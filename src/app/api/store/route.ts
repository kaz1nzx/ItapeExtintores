import { z } from "zod";
import { signedIn } from "@/lib/supabase";
import { commandSchema } from "@/lib/domain";
import { suspendedError } from "@/lib/admin";
import { json, sameOrigin } from "@/lib/http";
// A tela recarrega /app ao receber `suspended`, que mostra o aviso de acesso
// suspenso no lugar do painel.
const suspended = (message: string) =>
  json({ error: message, suspended: true }, 403);
export async function GET() {
  const client = await signedIn();
  if (!client) return json({ error: "Entre novamente para continuar." }, 401);
  const { data, error } = await client.rpc("itape_state");
  if (error && suspendedError(error)) return suspended(error.message);
  return error
    ? json(
        { error: "Não foi possível carregar os dados. Tente novamente." },
        502,
      )
    : json(data);
}
export async function POST(request: Request) {
  try {
    sameOrigin(request);
  } catch {
    return json({ error: "Origem não autorizada." }, 403);
  }
  const client = await signedIn();
  if (!client) return json({ error: "Entre novamente para continuar." }, 401);
  const raw = await request.text();
  if (raw.length > 8192)
    return json({ error: "Solicitação muito grande." }, 413);
  let value;
  try {
    value = JSON.parse(raw);
  } catch {
    return json({ error: "Solicitação inválida." }, 400);
  }
  const parsed = z
    .object({
      command: commandSchema,
      requestId: z.uuid(),
      version: z.number().int().min(0),
    })
    .safeParse(value);
  if (!parsed.success)
    return json(
      { error: "Confira os campos. Use valores positivos e uma data válida." },
      400,
    );
  const { data, error } = await client.rpc("itape_command", {
    command: parsed.data.command,
    request_id: parsed.data.requestId,
    expected_version: parsed.data.version,
  });
  if (error && suspendedError(error)) return suspended(error.message);
  if (error) {
    // "Operação desconhecida." vem de uma função de banco anterior ao
    // database/upgrade.sql: o app já envia operações que ela não conhece.
    const message =
      error.code === "23505"
        ? "Este código de produto já está cadastrado."
        : error.message === "Operação desconhecida."
          ? "O banco de dados ainda não tem esta função. Aplique database/upgrade.sql no SQL Editor do Supabase e tente novamente."
          : error.code === "P0001"
            ? error.message
            : "Não foi possível salvar. Atualize os dados e tente novamente.";
    return json(
      { error: message },
      error.message.includes("dados mudaram") ? 409 : 400,
    );
  }
  return json(data);
}
