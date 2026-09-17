import { describe, expect, it } from 'vitest';
import { parseJsonBody, sdkResultToResponse } from '../src/http.js';

describe('sdkResultToResponse', () => {
  it('maps data to a 200 JSON response', async () => {
    const response = sdkResultToResponse({ data: { ok: true } });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
  });

  it('maps a missing data payload to null', async () => {
    const response = sdkResultToResponse({});

    expect(await response.json()).toBeNull();
  });

  it('surfaces the upstream status on error', async () => {
    const response = sdkResultToResponse({
      error: 'boom',
      response: { status: 404 },
    });

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: 'boom' });
  });

  it('falls back to 500 when the upstream status is not an error status', async () => {
    const response = sdkResultToResponse({
      error: 'boom',
      response: { status: 200 },
    });

    expect(response.status).toBe(500);
  });

  it('falls back to 500 without an upstream status', async () => {
    const response = sdkResultToResponse({ error: 'boom' });

    expect(response.status).toBe(500);
  });
});

describe('parseJsonBody', () => {
  it('accepts an empty body', async () => {
    const parsed = await parseJsonBody(
      new Request('http://localhost/', { method: 'POST' }),
    );

    expect(parsed).toEqual({ ok: true, body: undefined });
  });

  it('parses valid JSON', async () => {
    const request = new Request('http://localhost/', {
      method: 'POST',
      body: JSON.stringify({ parts: [] }),
    });

    const parsed = await parseJsonBody(request);

    expect(parsed).toEqual({ ok: true, body: { parts: [] } });
  });

  it('rejects malformed JSON with a 400', async () => {
    const request = new Request('http://localhost/', {
      method: 'POST',
      body: '{nope',
    });

    const parsed = await parseJsonBody(request);

    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect(parsed.response.status).toBe(400);
  });
});
