// @99linesofcode/opencode-socket-plugin
//
// Composition root. This is the only file that knows how the pieces fit
// together: it resolves the socket path, clears a stale socket, builds the
// SSE hub, the route table, and the router, starts the Unix socket server,
// and returns the event/dispose hooks.
//
// NOTE: never use console.log/error in this plugin — it runs inside the TUI
// process, so stdout writes get overlaid on the terminal UI. Use
// client.app.log() for structured logging (goes to the log file).

import { type PluginModule } from '@opencode-ai/plugin';
import { resolveSocketPath } from './resolveSocketPath.js';
import {
  clearStaleSocket,
  removeSocketFile,
} from './socketFile.js';
import { Router } from './Router.js';
import { createRoutes } from './createRoutes.js';
import { SseHub } from './SseHub.js';

export const opencodeSocketPlugin: PluginModule = {
  id: 'opencode-socket-plugin',
  server: async ({ client, directory }, options) => {
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

    const sseHub = new SseHub();
    const routes = createRoutes({ client, directory }, sseHub);
    const router = new Router(routes, (message) =>
      client.app
        .log({
          body: { service: 'opencode-socket-plugin', level: 'error', message },
        })
        .catch(() => {}),
    );

    // idleTimeout must exceed the SSE heartbeat (10s). Bun's default 10s
    // timeout closes the SSE stream whenever the heartbeat races it, and a
    // per-request server.timeout() gets reset by concurrent traffic — only
    // the global option holds under load. Cast: bun-types 1.4.0 types
    // idleTimeout as undefined on the XOR union, but the runtime accepts it.
    const server = Bun.serve({
      unix: socketPath,
      fetch: (req: Request) => router.handle(req),
      idleTimeout: 60,
    } as unknown as Bun.Serve.Options<undefined, never>);

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
      // Forward every bus event for this directory to connected SSE clients.
      event: async ({ event }) => {
        sseHub.broadcast(event);
      },
      async dispose() {
        disposeServer(sseHub, server, socketPath);
      },
    };
  },
};

function disposeServer(
  sseHub: SseHub,
  server: { stop(force?: boolean): void },
  socketPath: string,
): void {
  sseHub.close();
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
