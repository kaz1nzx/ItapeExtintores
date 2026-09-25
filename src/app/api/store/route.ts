import { z } from "zod";
import { signedIn } from "@/lib/supabase";
import { commandSchema } from "@/lib/domain";
import { missingFunction, suspendedError } from "@/lib/admin";
import { json, readBody, sameOrigin } from "@/lib/http";
// A tela recarrega /app ao receber `suspended`, que mostra o aviso de acesso
// suspenso no lugar do painel.
const suspended = (message: string) =>
  json({ error: message, suspended: true }, 403);
const loadFailed = () =>
  json({ error: "Não foi possível carregar os dados. Tente novamente." }, 502);
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
// GET sem parâmetros: janela de dados (mês atual e anterior).
// ?from=&to=[&full=1]: período anterior à janela, ou um mês da exportação.
// ?quotations=1&q=&page=: orçamentos de todos os períodos, 10 por página.
const query = z.union([
  z.object({ from: day, to: day, full: z.enum(["1"]).optional() }).strict(),
  z
    .object({
      quotations: z.literal("1"),
      q: z.string().max(120).optional(),
      page: z.coerce.number().int().min(0).max(100_000).optional(),
    })
    .strict(),
  z.object({}).strict(),
]);
export async function GET(request: Request) {
  const client = await signedIn();
  if (!client) return json({ error: "Entre novamente para continuar." }, 401);
  const parsed = query.safeParse(
    Object.fromEntries(new URL(request.url).searchParams),
  );
  if (!parsed.success) return json({ error: "Solicitação inválida." }, 400);
  const params = parsed.data;
  let result;
  if ("from" in params)
    result = await client.rpc("itape_history", {
      from_date: params.from,
      to_date: params.to,
      full_export: params.full === "1",
    });
  else if ("quotations" in params)
    result = await client.rpc("itape_quotations", {
      search: params.q ?? "",
      page: params.page ?? 0,
    });
  else {
    result = await client.rpc("itape_snapshot");
    // Banco sem a atualização: o estado completo, como antes.
    if (result.error && missingFunction(result.error))
      result = await client.rpc("itape_state");
  }
  const { data, error } = result;
  if (error && suspendedError(error)) return suspended(error.message);
  if (error?.message === "Período inválido." || error?.message === "Busca inválida.")
    return json({ error: error.message }, 400);
  return error ? loadFailed() : json(data);
}
export async function POST(request: Request) {
  try {
    sameOrigin(request);
  } catch {
    return json({ error: "Origem não autorizada." }, 403);
  }
  const client = await signedIn();
  if (!client) return json({ error: "Entre novamente para continuar." }, 401);
  const raw = await readBody(request, 8192);
  if (raw === null)
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
  const args = {
    command: parsed.data.command,
    request_id: parsed.data.requestId,
    expected_version: parsed.data.version,
  };
  let { data, error } = await client.rpc("itape_apply", args);
  // Banco sem a atualização: grava pela função anterior, que devolve tudo.
  if (error && missingFunction(error))
    ({ data, error } = await client.rpc("itape_command", args));
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
