// The session API surface.
//
// Single responsibility: define the endpoints. Each route is a thin command
// that proxies to the opencode SDK client. Adding an endpoint means adding a
// route here — the dispatcher and the SDK calls stay untouched.

import { type PluginInput } from '@opencode-ai/plugin';
import { sdkResultToResponse } from './http.js';
import { param, type Route } from './router.js';

export type PluginClient = PluginInput['client'];

export type ServerContext = {
  client: PluginClient;
  directory: string;
};

export function createRoutes({ client, directory }: ServerContext): Route[] {
  return [
    {
      method: 'GET',
      pattern: /^\/global\/health$/,
      handler: async () => Response.json({ healthy: true, version: '0.1.0' }),
    },
    {
      method: 'GET',
      pattern: /^\/session$/,
      handler: async () => sdkResultToResponse(await client.session.list()),
    },
    // NOTE: /session/active MUST come before /session/:id, otherwise
    // "active" would be captured as an id.
    {
      method: 'GET',
      pattern: /^\/session\/active$/,
      handler: async () => {
        const result = await client.session.list();
        const sessions = result.data ?? [];
        const active = sessions
          .filter((s) => s.directory === directory)
          .sort((a, b) => (b.time?.updated ?? 0) - (a.time?.updated ?? 0))[0];
        return Response.json(active ?? null);
      },
    },
    {
      method: 'GET',
      pattern: /^\/session\/(?<id>[^/]+)$/,
      handler: async (params) =>
        sdkResultToResponse(
          await client.session.get({ path: { id: param(params, 'id') } }),
        ),
    },
    {
      method: 'GET',
      pattern: /^\/session\/(?<id>[^/]+)\/message$/,
      handler: async (params) =>
        sdkResultToResponse(
          await client.session.messages({ path: { id: param(params, 'id') } }),
        ),
    },
    {
      method: 'GET',
      pattern: /^\/session\/(?<id>[^/]+)\/message\/(?<messageID>[^/]+)$/,
      handler: async (params) =>
        sdkResultToResponse(
          await client.session.message({
            path: {
              id: param(params, 'id'),
              messageID: param(params, 'messageID'),
            },
          }),
        ),
    },
  ];
}
