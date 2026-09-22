export function sameOrigin(request: Request) {
  const expected = process.env.APP_ORIGIN;
  const received = request.headers.get("origin");
  if (!expected || !received)
    throw new Error("Origem da solicitação não autorizada.");

  let configured: URL;
  let origin: URL;
  try {
    configured = new URL(expected);
    origin = new URL(received);
  } catch {
    throw new Error("Origem da solicitação não autorizada.");
  }
  // Compare against configuration, never the client-supplied Host header.
  // Browser Origin headers contain only a scheme, host and port.
  if (received !== origin.origin || !["http:", "https:"].includes(origin.protocol))
    throw new Error("Origem da solicitação não autorizada.");
  if (origin.origin === configured.origin) return;

  const loopback = new Set(["localhost", "127.0.0.1", "[::1]"]);
  if (
    loopback.has(configured.hostname) &&
    loopback.has(origin.hostname) &&
    configured.protocol === origin.protocol
  ) return;

  throw new Error("Origem da solicitação não autorizada.");
}
export const json = (body: unknown, status = 200) =>
  Response.json(body, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });
