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
  enforceOwnerOnlyMode,
  isTmpFallback,
  removeSocketFile,
  verifySocketIdentity,
} from './socketFile.js';
import { Router } from './Router.js';
import { createRoutes } from './createRoutes.js';
import { SseHub } from './SseHub.js';

export const opencodeSocketPlugin: PluginModule = {
  id: 'opencode-socket-plugin',
  server: async ({ client, directory }, options) => {
    const socketPath = resolveSocketPath(options ?? {});

    if (isTmpFallback(socketPath)) {
      // /tmp is world-writable and the path is predictable — any local user
      // could squat it. Warn so the operator moves to XDG_RUNTIME_DIR.
      await client.app
        .log({
          body: {
            service: 'opencode-socket-plugin',
            level: 'warn',
            message: `socket ${socketPath} lives in world-writable /tmp; prefer XDG_RUNTIME_DIR or an explicit socketPath`,
          },
        })
        .catch(() => {});
    }

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
    const allowPermissionApprovals = options?.allowPermissionApprovals === true;
    const routes = createRoutes(
      { client, directory, allowPermissionApprovals },
      sseHub,
    );
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

    // Bun.serve creates the socket with umask-dependent permissions (0755
    // under a 022 umask), which would let any local user drive the agent.
    // Enforce 0600; if we cannot, refuse to serve rather than run exposed.
    if (!enforceOwnerOnlyMode(socketPath)) {
      await client.app
        .log({
          body: {
            service: 'opencode-socket-plugin',
            level: 'error',
            message: `failed to set socket mode 0600 on ${socketPath}; refusing to serve`,
          },
        })
        .catch(() => {});
      disposeServer(sseHub, server, socketPath);
      return {};
    }

    // Re-verify identity after binding: a squatter could have grabbed the
    // path between our stale-socket probe and our bind. If the socket no
    // longer answers with our health payload, tear down rather than serve.
    if (!(await verifySocketIdentity(socketPath))) {
      await client.app
        .log({
          body: {
            service: 'opencode-socket-plugin',
            level: 'error',
            message: `socket ${socketPath} did not answer with our health payload; refusing to serve`,
          },
        })
        .catch(() => {});
      disposeServer(sseHub, server, socketPath);
      return {};
    }

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
