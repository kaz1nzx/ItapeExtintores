import { z } from "zod";
import { signedIn } from "@/lib/supabase";
import {
  adminCommandSchema,
  adminOnlyError,
  missingFunction,
} from "@/lib/admin";
import { json, readBody, sameOrigin } from "@/lib/http";
// A regra de acesso fica no banco: estas rotas só repassam a sessão, e uma
// conta sem cadastro em itape_private.admins recebe 403.
function failure(error: { code?: string; message: string }) {
  if (adminOnlyError(error)) return json({ error: error.message }, 403);
  if (missingFunction(error))
    return json(
      {
        error:
          "O banco de dados ainda não tem o painel de administração. Aplique database/upgrade.sql no SQL Editor do Supabase.",
      },
      503,
    );
  if (error.code === "P0001")
    return json(
      { error: error.message },
      error.message.includes("dados mudaram") ? 409 : 400,
    );
  return json(
    { error: "Não foi possível concluir. Atualize os dados e tente novamente." },
    502,
  );
}
export async function GET() {
  const client = await signedIn();
  if (!client) return json({ error: "Entre novamente para continuar." }, 401);
  const { data, error } = await client.rpc("itape_admin_overview");
  return error ? failure(error) : json(data);
}
export async function POST(request: Request) {
  try {
    sameOrigin(request);
  } catch {
    return json({ error: "Origem não autorizada." }, 403);
  }
  const client = await signedIn();
  if (!client) return json({ error: "Entre novamente para continuar." }, 401);
  const raw = await readBody(request, 4096);
  if (raw === null)
    return json({ error: "Solicitação muito grande." }, 413);
  let value;
  try {
    value = JSON.parse(raw);
  } catch {
    return json({ error: "Solicitação inválida." }, 400);
  }
  const parsed = z.object({ command: adminCommandSchema }).safeParse(value);
  if (!parsed.success)
    return json(
      { error: "Confira os campos: valor da mensalidade e data de vencimento." },
      400,
    );
  const { data, error } = await client.rpc("itape_admin_command", {
    command: parsed.data.command,
  });
  return error ? failure(error) : json(data);
}
