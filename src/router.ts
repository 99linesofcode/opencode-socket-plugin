// HTTP request dispatcher.
//
// Single responsibility: match an incoming request against the route table and
// produce a Response — 404 when no path matches, 405 when the path matches but
// the method doesn't, 400 on malformed JSON, 500 on handler failure. It knows
// nothing about the opencode SDK; the only seam is the injected `log` function.

import { parseJsonBody } from './http.js';

export type RouteParams = Record<string, string>;
export type RouteHandler = (
  params: RouteParams,
  body: unknown,
  req: Request,
) => Promise<Response>;

// The route's pattern guarantees the named group exists for any request that
// reached its handler; this accessor keeps that guarantee explicit and fails
// loudly if pattern and handler drift apart.
export function param(params: RouteParams, name: string): string {
  const value = params[name];
  if (value === undefined) throw new Error(`missing route param "${name}"`);
  return value;
}

export interface Route {
  method: string;
  pattern: RegExp;
  handler: RouteHandler;
}

export type Router = (req: Request) => Promise<Response>;

export function createRouter(
  routes: Route[],
  log: (message: string) => unknown,
): Router {
  return async (req) => {
    const url = new URL(req.url);

    // Find a route whose path AND method match. If the path matches some
    // route but no route accepts this method, that's a 405; if the path
    // matches nothing at all, that's a 404.
    const matched = matchRoute(routes, req.method, url.pathname);
    if (matched.response) return matched.response;

    // Parse the JSON body for POST routes; pass it through to the SDK call.
    let body: unknown;
    if (req.method === 'POST') {
      const parsed = await parseJsonBody(req);
      if (!parsed.ok) return parsed.response;
      body = parsed.body;
    }

    try {
      return await matched.route!.handler(matched.params!, body, req);
    } catch (err) {
      await log(String(err));
      return Response.json({ error: String(err) }, { status: 500 });
    }
  };
}

type MatchResult = {
  route?: Route;
  params?: RouteParams;
  response?: Response;
};

function matchRoute(
  routes: Route[],
  method: string,
  pathname: string,
): MatchResult {
  let route: Route | undefined;
  let match: RegExpMatchArray | null = null;
  let pathMatched = false;
  for (const r of routes) {
    const m = pathname.match(r.pattern);
    if (m) {
      pathMatched = true;
      if (r.method === method) {
        route = r;
        match = m;
        break;
      }
    }
  }
  if (!pathMatched) {
    return { response: Response.json({ error: 'not found' }, { status: 404 }) };
  }
  if (!route || !match) {
    return {
      response: Response.json(
        { error: `method ${method} not allowed for ${pathname}` },
        { status: 405 },
      ),
    };
  }
  return { route, params: toParams(match.groups) };
}

// The type system types group values string | undefined even though a
// matched pattern guarantees them — drop the undefined entries.
function toParams(groups: RegExpMatchArray['groups']): RouteParams {
  const params: RouteParams = {};
  for (const [name, value] of Object.entries(groups ?? {})) {
    if (value !== undefined) params[name] = value;
  }
  return params;
}
