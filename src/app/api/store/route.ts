import { z } from "zod";
import { supabase, configured } from "@/lib/supabase";
import { commandSchema } from "@/lib/domain";
import { json, sameOrigin } from "@/lib/http";
async function authenticated() {
  if (!configured()) return null;
  const client = await supabase();
  const { data, error } = await client.auth.getUser();
  return error || !data.user || data.user.is_anonymous ? null : client;
}
export async function GET() {
  const client = await authenticated();
  if (!client) return json({ error: "Entre novamente para continuar." }, 401);
  const { data, error } = await client.rpc("itape_state");
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
  const client = await authenticated();
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
  if (error) {
    const message =
      error.code === "23505"
        ? "Este código de produto já está cadastrado."
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
