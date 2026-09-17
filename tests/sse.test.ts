import { describe, expect, it } from 'vitest';
import { type Event } from '@opencode-ai/sdk';
import { createSseHub } from '../src/sse.js';

function event(type: string, properties: Record<string, unknown>): Event {
  return { type, properties } as unknown as Event;
}

// The hub enqueues strings directly, so chunks arrive as strings even though
// Response types its body as bytes.
type StreamChunk = Uint8Array | string;

function bodyReader(res: Response): ReadableStreamDefaultReader<StreamChunk> {
  const body = res.body;
  if (!body) throw new Error('response has no body');
  return body.getReader() as ReadableStreamDefaultReader<StreamChunk>;
}

function decode(chunk: StreamChunk): string {
  return typeof chunk === 'string' ? chunk : new TextDecoder().decode(chunk);
}

function dataPayload(frame: string): Record<string, unknown> {
  return JSON.parse(frame.replace(/^data: /, '').trim()) as Record<
    string,
    unknown
  >;
}

describe('createSseHub', () => {
  it('returns an event-stream response with a connected frame', async () => {
    const hub = createSseHub();

    const response = hub.subscribe(new Request('http://localhost/event'));
    const reader = bodyReader(response);
    const { value } = await reader.read();

    expect(response.headers.get('Content-Type')).toBe('text/event-stream');
    expect(decode(value!)).toBe(': connected\n\n');
    hub.close();
  });

  it('forwards matching events as data frames', async () => {
    const hub = createSseHub();
    const reader = bodyReader(
      hub.subscribe(new Request('http://localhost/event')),
    );
    await reader.read(); // the connected frame

    hub.broadcast(event('session.idle', { sessionID: 'ses_1' }));
    const { value } = await reader.read();

    expect(dataPayload(decode(value!))).toMatchObject({ type: 'session.idle' });
    hub.close();
  });

  it('drops events for other sessions under a session filter', async () => {
    const hub = createSseHub();
    const reader = bodyReader(
      hub.subscribe(new Request('http://localhost/event?session=ses_1')),
    );
    await reader.read();

    hub.broadcast(event('session.idle', { sessionID: 'ses_2' }));
    hub.broadcast(event('session.idle', { sessionID: 'ses_1' }));
    const { value } = await reader.read();

    expect(dataPayload(decode(value!)).properties).toMatchObject({
      sessionID: 'ses_1',
    });
    hub.close();
  });

  it('forwards only the listed event types under an event filter', async () => {
    const hub = createSseHub();
    const reader = bodyReader(
      hub.subscribe(new Request('http://localhost/event?events=session.idle')),
    );
    await reader.read();

    hub.broadcast(event('message.updated', { info: { id: 'msg_1' } }));
    hub.broadcast(event('session.idle', { sessionID: 'ses_1' }));
    const { value } = await reader.read();

    expect(dataPayload(decode(value!)).type).toBe('session.idle');
    hub.close();
  });

  it('reads the session id from the part before the info id', async () => {
    const hub = createSseHub();
    const reader = bodyReader(
      hub.subscribe(new Request('http://localhost/event?session=ses_1')),
    );
    await reader.read();

    // message.part.updated carries the session on the part; a bare info.id
    // must never be mistaken for a session id.
    hub.broadcast(
      event('message.updated', {
        part: { sessionID: 'ses_1' },
        info: { id: 'msg_9' },
      }),
    );
    const { value } = await reader.read();

    expect(dataPayload(decode(value!)).properties).toMatchObject({
      part: { sessionID: 'ses_1' },
    });
    hub.close();
  });

  it('drops events without a resolvable session id under a session filter', async () => {
    const hub = createSseHub();
    const reader = bodyReader(
      hub.subscribe(new Request('http://localhost/event?session=ses_1')),
    );
    await reader.read();

    hub.broadcast(event('message.updated', { info: { id: 'msg_1' } }));
    hub.broadcast(event('session.idle', { sessionID: 'ses_1' }));
    const { value } = await reader.read();

    expect(dataPayload(decode(value!)).type).toBe('session.idle');
    hub.close();
  });
});
