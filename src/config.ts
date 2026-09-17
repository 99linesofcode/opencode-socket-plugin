// Socket path resolution.
//
// Single responsibility: turn plugin options + environment into the one path
// the server will bind. Pure function — no I/O, no state.

import path from 'node:path';
import { type PluginOptions } from '@opencode-ai/plugin';

// Resolve the socket path: plugin option > env > XDG_RUNTIME_DIR > /tmp
export function resolveSocketPath(options: PluginOptions): string {
  if (typeof options?.socketPath === 'string' && options.socketPath)
    return options.socketPath;
  if (process.env.OPENCODE_SOCKET_PATH) return process.env.OPENCODE_SOCKET_PATH;
  // || rather than ?? so an empty XDG_RUNTIME_DIR still falls through to /tmp
  // instead of producing a relative socket path.
  const base = process.env.XDG_RUNTIME_DIR || '/tmp';
  return path.join(base, 'opencode.sock');
}
