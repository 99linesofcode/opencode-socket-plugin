// Map an SDK { data, error } result to an HTTP Response. The SDK result
// carries the upstream response, so we surface its status code when the call
// failed; otherwise fall back to 500. Pure function.

// The SDK's RequestResult is a discriminated union ({ data, error } &
// { request, response }); this is the minimal structural view the mapping
// needs, kept loose so this module stays decoupled from the SDK.
export type SdkResult = {
  data?: unknown;
  error?: unknown;
  response?: { status?: number };
};

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
