import { z } from "zod";
import { configured, supabase } from "@/lib/supabase";
import { clientIp, json, readBody, sameOrigin } from "@/lib/http";
import { createLimiter } from "@/lib/rate-limit";

// O login passa pelo servidor do site, então o Supabase vê o mesmo IP para
// todos os visitantes. Estes limites barram a força bruta antes de chegar lá:
// por e-mail (a senha de uma conta) e por IP (várias contas a partir de um
// lugar). Só erros de senha contam; entrar com sucesso zera o e-mail.
const WINDOW = 15 * 60_000;
const byEmail = createLimiter({ limit: 8, windowMs: WINDOW });
const byIp = createLimiter({ limit: 40, windowMs: WINDOW });
const tooMany = (seconds: number) =>
  json(
    {
      error: `Muitas tentativas de entrada. Aguarde ${Math.ceil(seconds / 60)} min e tente de novo.`,
    },
    429,
    { "Retry-After": String(seconds) },
  );

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
  const raw = await readBody(request, 8192);
  if (raw === null) return json({ error: "Solicitação muito grande." }, 413);
  let body;
  try {
    body = JSON.parse(raw);
  } catch {
    body = null;
  }
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
  const email = parsed.data.email.trim().toLowerCase();
  const ip = clientIp(request);
  const wait = Math.max(byEmail.wait(email), ip ? byIp.wait(ip) : 0);
  if (wait) return tooMany(wait);
  const { error } = await client.auth.signInWithPassword({
    email,
    password: parsed.data.password,
  });
  if (error) {
    if (error.status === 429) return tooMany(300);
    // Falha do Supabase ou da rede não é tentativa de senha.
    if (error.status && error.status >= 400 && error.status < 500) {
      byEmail.fail(email);
      if (ip) byIp.fail(ip);
    }
    return json(
      { error: "Não foi possível entrar. Confira suas credenciais e a conexão." },
      401,
    );
  }
  byEmail.reset(email);
  return json({ ok: true });
}
