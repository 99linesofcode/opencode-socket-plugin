import { describe, expect, it } from 'vitest';
import { sdkResultToResponse } from '../src/sdkResultToResponse.js';

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
