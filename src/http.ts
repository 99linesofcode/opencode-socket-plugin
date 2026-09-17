// HTTP protocol concerns shared by the route handlers and the dispatcher.
//
// Single responsibility: the HTTP details — mapping SDK results to HTTP
// responses and parsing JSON request bodies. Pure functions.

// The SDK's RequestResult is a discriminated union ({ data, error } &
// { request, response }); this is the minimal structural view the mapping
// needs, kept loose so this module stays decoupled from the SDK.
export type SdkResult = {
  data?: unknown;
  error?: unknown;
  response?: { status?: number };
};

// Map an SDK { data, error } result to an HTTP Response. The SDK result
// carries the upstream response, so we surface its status code when the call
// failed; otherwise fall back to 500.
export function sdkResultToResponse(result: SdkResult): Response {
  if (result.error) {
    const status =
      typeof result.response?.status === 'number' &&
      result.response.status >= 400
        ? result.response.status
        : 500;
    return Response.json({ error: result.error }, { status });
  }
  return Response.json(result.data ?? null);
}

export type ParsedBody =
  { ok: true; body: unknown } | { ok: false; response: Response };

// Parse a JSON request body. An empty body is valid (no body); malformed JSON
// yields a 400 response instead of throwing.
export async function parseJsonBody(req: Request): Promise<ParsedBody> {
  const raw = await req.text();
  if (!raw) return { ok: true, body: undefined };
  try {
    return { ok: true, body: JSON.parse(raw) };
  } catch {
    return {
      ok: false,
      response: Response.json({ error: 'invalid JSON body' }, { status: 400 }),
    };
  }
}
