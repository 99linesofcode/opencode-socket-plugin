import { describe, expect, it } from 'vitest';
import { Router, param, type Route } from '../src/Router.js';

const ok = (body: unknown) => Response.json(body);

function routeTable(): Route[] {
  return [
    {
      method: 'GET',
      pattern: /^\/things$/,
      handler: async () => ok({ things: [] }),
    },
    {
      method: 'GET',
      pattern: /^\/things\/(?<id>[^/]+)$/,
      handler: async (params) => ok({ id: param(params, 'id') }),
    },
    {
      method: 'POST',
      pattern: /^\/things$/,
      handler: async (_params, body) => ok({ echo: body }),
    },
    {
      method: 'GET',
      pattern: /^\/boom$/,
      handler: async () => {
        throw new Error('kaboom');
      },
    },
  ];
}

describe('Router', () => {
  it('returns 404 for an unknown path', async () => {
    const router = new Router(routeTable(), () => {});

    const response = await router.handle(new Request('http://localhost/nope'));

    expect(response.status).toBe(404);
  });

  it('returns 405 when the path matches but the method does not', async () => {
    const router = new Router(routeTable(), () => {});

    const response = await router.handle(
      new Request('http://localhost/things', { method: 'DELETE' }),
    );

    expect(response.status).toBe(405);
  });

  it('extracts named params', async () => {
    const router = new Router(routeTable(), () => {});

    const response = await router.handle(
      new Request('http://localhost/things/ses_1'),
    );

    expect(await response.json()).toEqual({ id: 'ses_1' });
  });

  it('passes the parsed JSON body to POST handlers', async () => {
    const router = new Router(routeTable(), () => {});

    const response = await router.handle(
      new Request('http://localhost/things', {
        method: 'POST',
        body: '{"a":1}',
      }),
    );

    expect(await response.json()).toEqual({ echo: { a: 1 } });
  });

  it('returns 400 on malformed JSON for POST', async () => {
    const router = new Router(routeTable(), () => {});

    const response = await router.handle(
      new Request('http://localhost/things', { method: 'POST', body: '{nope' }),
    );

    expect(response.status).toBe(400);
  });

  it('returns 500 and logs when the handler throws', async () => {
    const logged: string[] = [];
    const router = new Router(routeTable(), (message) => {
      logged.push(message);
    });

    const response = await router.handle(new Request('http://localhost/boom'));

    expect(response.status).toBe(500);
    expect(logged).toHaveLength(1);
  });
});

describe('param', () => {
  it('returns the named param', () => {
    const value = param({ id: 'ses_1' }, 'id');

    expect(value).toBe('ses_1');
  });

  it('throws on a missing param', () => {
    expect(() => param({}, 'id')).toThrow('missing route param "id"');
  });
});
