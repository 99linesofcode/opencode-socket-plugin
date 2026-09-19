// Parse a JSON request body. An empty body is valid (no body); malformed
// JSON yields a 400 response instead of throwing. Pure function.
export type ParsedBody =
  { ok: true; body: unknown } | { ok: false; response: Response };

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
