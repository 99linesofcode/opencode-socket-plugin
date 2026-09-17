// SSE hub.
//
// Single responsibility: manage the connected event-stream clients — the
// registry, the heartbeat that lets them detect a dead connection, and the
// fan-out of bus events to every client whose ?session= filter matches.

import { type Event } from '@opencode-ai/sdk';

export type SSEClient = {
  controller: ReadableStreamDefaultController;
  sessionFilter?: string | undefined;
  eventFilter?: Set<string> | undefined;
};

export type SSEHub = {
  /** Create the response for a new /event subscription. */
  subscribe(req: Request): Response;
  /** Forward a bus event to every matching client. */
  broadcast(event: Event): void;
  /** Stop the heartbeat and close all client streams. */
  close(): void;
};

const HEARTBEAT_INTERVAL_MS = 10_000;

export function createSseHub(): SSEHub {
  const clients = new Set<SSEClient>();
  const heartbeat = startHeartbeat(clients);

  return {
    subscribe(req) {
      const url = new URL(req.url);
      const sessionFilter = url.searchParams.get('session') ?? undefined;
      // ?events=a,b,c — only these event types are forwarded. The bridge
      // needs a handful of types; without a filter every bus event (one per
      // token chunk during a response) is serialized into the TUI's event
      // loop, which backpressures it.
      const eventsParam = url.searchParams.get('events');
      const eventFilter = eventsParam
        ? new Set(eventsParam.split(',').filter(Boolean))
        : undefined;
      let client: SSEClient | undefined;
      const stream = new ReadableStream({
        start(controller) {
          client = { controller, sessionFilter, eventFilter };
          clients.add(client);
          controller.enqueue(`: connected\n\n`);
        },
        cancel() {
          if (client) clients.delete(client);
        },
      });
      return new Response(stream, {
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          Connection: 'keep-alive',
        },
      });
    },

    broadcast(event) {
      const props = event.properties as Record<string, unknown> | undefined;
      const info = props?.info as Record<string, unknown> | undefined;
      // sessionID lives in different places per event type: top-level
      // (session.idle, message.removed), on the part (message.part.updated),
      // on the message (message.updated), or as the session's own id
      // (session.created). Check them in that order so a Message's id is
      // never mistaken for a session id.
      const sessionID =
        (props?.sessionID as string | undefined) ??
        ((props?.part as Record<string, unknown> | undefined)?.sessionID as
          string | undefined) ??
        (info?.sessionID as string | undefined) ??
        (info?.id as string | undefined);
      for (const client of clients) {
        if (client.sessionFilter && sessionID !== client.sessionFilter)
          continue;
        if (client.eventFilter && !client.eventFilter.has(event.type)) continue;
        try {
          client.controller.enqueue(`data: ${JSON.stringify(event)}\n\n`);
        } catch {
          /* client gone */
        }
      }
    },

    close() {
      clearInterval(heartbeat);
      for (const client of clients) {
        try {
          client.controller.close();
        } catch {
          /* ignore */
        }
      }
      clients.clear();
    },
  };
}

// Heartbeat every 10s so clients can detect a dead connection.
function startHeartbeat(
  clients: Set<SSEClient>,
): ReturnType<typeof setInterval> {
  return setInterval(() => {
    for (const client of clients) {
      try {
        client.controller.enqueue(`: ping\n\n`);
      } catch {
        /* client gone */
      }
    }
  }, HEARTBEAT_INTERVAL_MS);
}
