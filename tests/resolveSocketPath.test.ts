import { afterEach, describe, expect, it, vi } from 'vitest';
import { resolveSocketPath } from '../src/resolveSocketPath.js';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('resolveSocketPath', () => {
  it('prefers the plugin option over everything', () => {
    vi.stubEnv('OPENCODE_SOCKET_PATH', '/env/path.sock');
    vi.stubEnv('XDG_RUNTIME_DIR', '/run/user/1000');

    const socketPath = resolveSocketPath({ socketPath: '/option/path.sock' });

    expect(socketPath).toBe('/option/path.sock');
  });

  it('falls through to the env var on an empty plugin option', () => {
    vi.stubEnv('OPENCODE_SOCKET_PATH', '/env/path.sock');

    const socketPath = resolveSocketPath({ socketPath: '' });

    expect(socketPath).toBe('/env/path.sock');
  });

  it('prefers the env var over XDG_RUNTIME_DIR', () => {
    vi.stubEnv('OPENCODE_SOCKET_PATH', '/env/path.sock');
    vi.stubEnv('XDG_RUNTIME_DIR', '/run/user/1000');

    const socketPath = resolveSocketPath({});

    expect(socketPath).toBe('/env/path.sock');
  });

  it('falls back to XDG_RUNTIME_DIR', () => {
    vi.stubEnv('OPENCODE_SOCKET_PATH', '');
    vi.stubEnv('XDG_RUNTIME_DIR', '/run/user/1000');

    const socketPath = resolveSocketPath({});

    expect(socketPath).toBe('/run/user/1000/opencode.sock');
  });

  it('falls through to /tmp on an empty XDG_RUNTIME_DIR', () => {
    vi.stubEnv('OPENCODE_SOCKET_PATH', '');
    vi.stubEnv('XDG_RUNTIME_DIR', '');

    const socketPath = resolveSocketPath({});

    expect(socketPath).toBe('/tmp/opencode.sock');
  });

  it('falls back to /tmp without XDG_RUNTIME_DIR', () => {
    vi.stubEnv('OPENCODE_SOCKET_PATH', '');
    delete process.env.XDG_RUNTIME_DIR;

    const socketPath = resolveSocketPath({});

    expect(socketPath).toBe('/tmp/opencode.sock');
  });
});
