// Unix socket file lifecycle. Own the socket file: detect a stale one left
// behind by a dead process, and remove it on shutdown. A stale socket is one
// where the owner is gone or unresponsive. connect() alone is not enough: a
// stopped process's socket accepts connections at the kernel level but never
// serves them, so we probe with a health request and treat "no response" as
// stale.
import { unlinkSync, existsSync } from 'node:fs';
import net from 'node:net';

const HEALTH_TIMEOUT_MS = 2000;

export function clearStaleSocket(socketPath: string): Promise<boolean> {
  if (!existsSync(socketPath)) return Promise.resolve(true);
  return new Promise((resolve) => {
    const sock = net.connect(socketPath);
    let settled = false;

    const finish = (ok: boolean) => {
      if (settled) return;
      settled = true;
      sock.destroy();
      if (!ok) {
        try {
          unlinkSync(socketPath);
        } catch {
          /* ignore */
        }
      }
      resolve(ok);
    };

    sock.on('connect', () => {
      sock.write(
        'GET /global/health HTTP/1.1\r\n' +
          'Host: localhost\r\n' +
          'Connection: close\r\n\r\n',
      );
      const timer = setTimeout(() => finish(false), HEALTH_TIMEOUT_MS);
      sock.on('data', () => {
        clearTimeout(timer);
        finish(true);
      });
    });
    sock.on('error', () => finish(false));
  });
}

export function removeSocketFile(socketPath: string): void {
  try {
    unlinkSync(socketPath);
  } catch {
    /* ignore */
  }
}
