import { describe, expect, it } from 'vitest';
import { parseJsonBody } from '../src/parseJsonBody.js';

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
