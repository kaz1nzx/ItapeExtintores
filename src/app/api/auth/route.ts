import { z } from "zod";
import { configured, supabase } from "@/lib/supabase";
import { json, sameOrigin } from "@/lib/http";
export async function POST(request: Request) {
  try {
    sameOrigin(request);
  } catch {
    return json({ error: "Origem não autorizada." }, 403);
  }
  if (!configured())
    return json(
      { error: "Configure a conexão com o Supabase no arquivo .env.local." },
      503,
    );
  if (Number(request.headers.get("content-length") ?? 0) > 8192)
    return json({ error: "Solicitação muito grande." }, 413);
  const body = await request.json().catch(() => null);
  const client = await supabase();
  if (body?.action === "logout") {
    const { error } = await client.auth.signOut();
    return error
      ? json(
          { error: "Não foi possível encerrar a sessão. Tente novamente." },
          502,
        )
      : json({ ok: true });
  }
  const parsed = z
    .object({ email: z.email().max(254), password: z.string().min(1).max(128) })
    .safeParse(body);
  if (!parsed.success)
    return json({ error: "Informe um e-mail e uma senha válidos." }, 400);
  const { error } = await client.auth.signInWithPassword(parsed.data);
  if (error)
    return json(
      {
        error:
          error.status === 429
            ? "Muitas tentativas. Aguarde alguns minutos."
            : "Não foi possível entrar. Confira suas credenciais e a conexão.",
      },
      error.status === 429 ? 429 : 401,
    );
  return json({ ok: true });
}
