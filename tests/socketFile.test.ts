import { afterEach, describe, expect, it } from 'vitest';
import net from 'node:net';
import { mkdtempSync, rmSync, statSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  enforceOwnerOnlyMode,
  isOwnHealthResponse,
  isTmpFallback,
  verifySocketIdentity,
} from '../src/socketFile.js';

const tmpDirs: string[] = [];

function tmpDir(): string {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'socketfile-'));
  tmpDirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of tmpDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

// Serve a raw HTTP response over a unix socket at the given path.
function serve(socketPath: string, response: string): Promise<net.Server> {
  return new Promise((resolve) => {
    const server = net.createServer((sock) => {
      sock.on('data', () => sock.end(response));
    });
    server.listen(socketPath, () => resolve(server));
  });
}

describe('isOwnHealthResponse', () => {
  it('accepts our health payload', () => {
    const bytes = new TextEncoder().encode(
      'HTTP/1.1 200 OK\r\nContent-Type: application/json\r\n\r\n' +
        '{"healthy":true,"version":"0.1.0"}',
    );
    expect(isOwnHealthResponse(bytes)).toBe(true);
  });

  it('accepts a bare health body without headers', () => {
    const bytes = new TextEncoder().encode('{"healthy":true}');
    expect(isOwnHealthResponse(bytes)).toBe(true);
  });

  it('rejects a wrong body', () => {
    const bytes = new TextEncoder().encode('{"healthy":false}');
    expect(isOwnHealthResponse(bytes)).toBe(false);
  });

  it('rejects garbage bytes', () => {
    const bytes = new TextEncoder().encode('not json at all');
    expect(isOwnHealthResponse(bytes)).toBe(false);
  });

  it('rejects an empty payload', () => {
    expect(isOwnHealthResponse(new Uint8Array())).toBe(false);
  });

  it('rejects truncated JSON', () => {
    const bytes = new TextEncoder().encode('{"healthy":true,"version":"0.1');
    expect(isOwnHealthResponse(bytes)).toBe(false);
  });
});

describe('enforceOwnerOnlyMode', () => {
  it('sets the socket to mode 0600', async () => {
    const dir = tmpDir();
    const socketPath = path.join(dir, 'test.sock');
    const server = await serve(socketPath, 'HTTP/1.1 200 OK\r\n\r\nok');

    const applied = enforceOwnerOnlyMode(socketPath);

    expect(applied).toBe(true);
    expect(statSync(socketPath).mode & 0o777).toBe(0o600);
    server.close();
  });

  it('returns false when the path does not exist', () => {
    expect(enforceOwnerOnlyMode(path.join(tmpDir(), 'missing.sock'))).toBe(
      false,
    );
  });
});

describe('verifySocketIdentity', () => {
  it('returns true for a socket serving our health payload', async () => {
    const dir = tmpDir();
    const socketPath = path.join(dir, 'test.sock');
    const server = await serve(
      socketPath,
      'HTTP/1.1 200 OK\r\nContent-Type: application/json\r\n\r\n' +
        '{"healthy":true,"version":"0.1.0"}',
    );

    expect(await verifySocketIdentity(socketPath)).toBe(true);
    server.close();
  });

  it('returns false for a socket serving a wrong payload', async () => {
    const dir = tmpDir();
    const socketPath = path.join(dir, 'test.sock');
    const server = await serve(
      socketPath,
      'HTTP/1.1 200 OK\r\nContent-Type: application/json\r\n\r\n' +
        '{"healthy":false}',
    );

    expect(await verifySocketIdentity(socketPath)).toBe(false);
    server.close();
  });

  it('returns false when nothing is listening', async () => {
    expect(await verifySocketIdentity(path.join(tmpDir(), 'missing.sock'))).toBe(
      false,
    );
  });
});

describe('isTmpFallback', () => {
  it('is true for a path under /tmp', () => {
    expect(isTmpFallback('/tmp/opencode.sock')).toBe(true);
  });

  it('is true for /tmp itself', () => {
    expect(isTmpFallback('/tmp')).toBe(true);
  });

  it('is false for a runtime-dir path', () => {
    expect(isTmpFallback('/run/user/1000/opencode.sock')).toBe(false);
  });

  it('is false for a path that merely starts with /tmp', () => {
    expect(isTmpFallback('/tmpfoo/opencode.sock')).toBe(false);
  });
});
