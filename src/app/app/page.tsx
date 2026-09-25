import { redirect } from "next/navigation";
import { configured, supabase } from "@/lib/supabase";
import Workspace from "@/components/workspace";
import Suspended from "@/components/suspended";
import { missingFunction, supportNumber } from "@/lib/admin";
import type { Store } from "@/lib/domain";
export const dynamic = "force-dynamic";
export default async function Page() {
  if (!configured()) redirect("/login");
  const client = await supabase();
  const { data: auth, error: authError } = await client.auth.getUser();
  if (authError || !auth.user || auth.user.is_anonymous) redirect("/login");
  const unavailable = (
    <main className="standalone">
      <h1>Não foi possível carregar seus dados.</h1>
      <p>Verifique a conexão e a configuração do banco Supabase.</p>
      <a className="button primary" href="/app">
        Tentar novamente
      </a>
      <a className="button" href="/demo">
        Abrir demonstração
      </a>
    </main>
  );
  // Sem database/upgrade.sql a função ainda não existe e a conta segue como
  // antes: ativa e sem painel de administração.
  const { data: access, error: accessError } = await client.rpc("itape_access");
  if (accessError && !missingFunction(accessError)) return unavailable;
  const support = supportNumber(process.env.SUPPORT_WHATSAPP);
  if (access?.active === false)
    return (
      <Suspended
        email={auth.user.email ?? ""}
        support={support}
        status={access.status === "pending" ? "pending" : "suspended"}
      />
    );
  const { data, error } = await client.rpc("itape_state");
  if (error) return unavailable;
  return (
    <Workspace
      initial={data as Store}
      admin={access?.admin === true}
      subscription={{
        paidUntil: access?.paidUntil ?? null,
        monthlyFee: access?.monthlyFee ?? 0,
      }}
      support={support}
      user={{
        id: auth.user.id,
        name: auth.user.email ?? "Administrador",
        role: "admin",
      }}
    />
  );
}
