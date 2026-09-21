// Unix socket file lifecycle. Own the socket file: detect a stale one left
// behind by a dead process, and remove it on shutdown. A stale socket is one
// where the owner is gone or unresponsive. connect() alone is not enough: a
// stopped process's socket accepts connections at the kernel level but never
// serves them, so we probe with a health request and treat "no response" as
// stale.
import { chmodSync, unlinkSync, existsSync } from 'node:fs';
import net from 'node:net';

const HEALTH_TIMEOUT_MS = 2000;

// The /global/health route answers with { healthy: true, ... }. A squatter
// socket that answers the probe with anything else must not be mistaken for
// our own server, so we require this exact marker before trusting a path.
export function isOwnHealthResponse(bytes: Uint8Array): boolean {
  const text = new TextDecoder().decode(bytes);
  // The HTTP response carries headers before the body; the health body is the
  // JSON after the header/body separator. Accept a bare body too.
  const sep = text.indexOf('\r\n\r\n');
  const body = sep === -1 ? text : text.slice(sep + 4);
  try {
    const parsed = JSON.parse(body) as { healthy?: unknown };
    return parsed.healthy === true;
  } catch {
    return false;
  }
}

// Probe a socket with a health request and report whether it answered with
// our own payload. Bounded by HEALTH_TIMEOUT_MS so a socket that accepts but
// never responds (or answers with a foreign body) still resolves.
function probeHealth(socketPath: string): Promise<boolean> {
  return new Promise((resolve) => {
    const sock = net.connect(socketPath);
    let settled = false;
    const chunks: Uint8Array[] = [];

    const finish = (ok: boolean) => {
      if (settled) return;
      settled = true;
      sock.destroy();
      resolve(ok);
    };

    sock.on('connect', () => {
      sock.write(
        'GET /global/health HTTP/1.1\r\n' +
          'Host: localhost\r\n' +
          'Connection: close\r\n\r\n',
      );
      const timer = setTimeout(() => finish(false), HEALTH_TIMEOUT_MS);
      sock.on('data', (chunk: Buffer) => {
        chunks.push(chunk);
        // Keep reading until the health body arrives; a response that is not
        // ours means a squatter owns the path.
        if (isOwnHealthResponse(Buffer.concat(chunks))) {
          clearTimeout(timer);
          finish(true);
        }
      });
    });
    sock.on('error', () => finish(false));
    sock.on('end', () => finish(false));
  });
}

export async function clearStaleSocket(socketPath: string): Promise<boolean> {
  if (!existsSync(socketPath)) return true;
  const healthy = await probeHealth(socketPath);
  if (!healthy) {
    // Not our server (or no server at all) — reclaim the path from a squatter
    // or a dead process's leftover socket.
    try {
      unlinkSync(socketPath);
    } catch {
      /* ignore */
    }
  }
  return healthy;
}

// After binding, connect back and confirm the socket answers with our own
// health payload — guards against a race where a squatter grabbed the path
// between our probe and our bind.
export function verifySocketIdentity(socketPath: string): Promise<boolean> {
  return probeHealth(socketPath);
}

// Restrict the socket to the owning user. Bun.serve creates the socket with
// umask-dependent permissions (0755 under a 022 umask), which would let any
// local user drive the agent. Returns false if the chmod could not be applied.
export function enforceOwnerOnlyMode(socketPath: string): boolean {
  try {
    chmodSync(socketPath, 0o600);
    return true;
  } catch {
    return false;
  }
}

// True when the socket lives in the world-writable /tmp directory, where any
// local user could squat the predictable path.
export function isTmpFallback(socketPath: string): boolean {
  return socketPath === '/tmp' || socketPath.startsWith('/tmp/');
}

export function removeSocketFile(socketPath: string): void {
  try {
    unlinkSync(socketPath);
  } catch {
    /* ignore */
  }
}
