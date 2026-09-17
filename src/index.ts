// @99linesofcode/opencode-socket-plugin
//
// Composition root. This is the only file that knows how the pieces fit
// together: it resolves the socket path, clears a stale socket, builds the
// route table and the dispatcher, starts the Unix socket server, and returns
// the dispose hook. Each piece lives in its own module with a single
// responsibility — config, socket lifecycle, HTTP mapping, routing, and the
// session API.
//
// NOTE: never use console.log/error in this plugin — it runs inside the TUI
// process, so stdout writes get overlaid on the terminal UI. Use
// client.app.log() for structured logging (goes to the log file).

import { type Hooks, type PluginModule } from '@opencode-ai/plugin';
import { resolveSocketPath } from './config.js';
import { clearStaleSocket, removeSocketFile } from './socket.js';
import { createRouter } from './router.js';
import { createRoutes } from './routes.js';

export const opencodeSocketPlugin: PluginModule = {
  id: 'opencode-socket-plugin',
  // The runtime calls dispose on shutdown; the 1.15 plugin types don't
  // declare it, so the return type carries the intersection explicitly.
  server: async ({ client, directory }, options): Promise<Hooks & { dispose?(): Promise<void> }> => {
    const socketPath = resolveSocketPath(options ?? {});

    const ok = await clearStaleSocket(socketPath);
    if (!ok) {
      // A live instance owns the socket. It may be mid-shutdown (restart
      // race): retry briefly so we bind once it's gone. A genuinely live
      // duplicate (project-level + global copies) still ends in a graceful
      // skip rather than a thrown error.
      let acquired = false;
      for (let attempt = 0; attempt < 3; attempt++) {
        await sleep(1000);
        if (await clearStaleSocket(socketPath)) {
          acquired = true;
          break;
        }
      }
      if (!acquired) {
        await client.app
          .log({
            body: {
              service: 'opencode-socket-plugin',
              level: 'info',
              message: `socket ${socketPath} already owned by a live instance; skipping`,
            },
          })
          .catch(() => {});
        return {};
      }
    }

    const routes = createRoutes({ client, directory });
    const router = createRouter(routes, (message) =>
      client.app
        .log({
          body: { service: 'opencode-socket-plugin', level: 'error', message },
        })
        .catch(() => {}),
    );

    const server = Bun.serve({
      unix: socketPath,
      fetch: router,
    });

    await client.app
      .log({
        body: {
          service: 'opencode-socket-plugin',
          level: 'info',
          message: `listening on ${socketPath}`,
        },
      })
      .catch(() => {});

    return {
      async dispose() {
        disposeServer(server, socketPath);
      },
    };
  },
};

function disposeServer(
  server: { stop(force?: boolean): void },
  socketPath: string,
): void {
  try {
    server.stop(true);
  } catch {
    /* ignore */
  }
  removeSocketFile(socketPath);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export default opencodeSocketPlugin;
