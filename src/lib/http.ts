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
export const json = (
  body: unknown,
  status = 200,
  headers: Record<string, string> = {},
) =>
  Response.json(body, {
    status,
    headers: { "Cache-Control": "private, no-store", ...headers },
  });

// Lê o corpo até `limit` bytes e para ali. Sem isso, um pedido enorme (ou sem
// Content-Length) seria carregado inteiro na memória antes da checagem.
export async function readBody(request: Request, limit: number) {
  if (Number(request.headers.get("content-length") ?? 0) > limit) return null;
  if (!request.body) return "";
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > limit) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(bytes);
}

// IP do visitante segundo o proxy da hospedagem. Sem esse cabeçalho (servidor
// exposto direto) não há IP confiável, e o limite por IP fica desligado em vez
// de juntar todo mundo numa chave só.
export function clientIp(request: Request) {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || request.headers.get("x-real-ip")?.trim() || null;
}
