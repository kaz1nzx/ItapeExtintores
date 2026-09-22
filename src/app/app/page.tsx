import { redirect } from "next/navigation";
import { configured, supabase } from "@/lib/supabase";
import Workspace from "@/components/workspace";
import type { Store } from "@/lib/domain";
export const dynamic = "force-dynamic";
export default async function Page() {
  if (!configured()) redirect("/login");
  const client = await supabase();
  const { data: auth, error: authError } = await client.auth.getUser();
  if (authError || !auth.user || auth.user.is_anonymous) redirect("/login");
  const { data, error } = await client.rpc("itape_state");
  if (error)
    return (
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
  return (
    <Workspace
      initial={data as Store}
      user={{
        id: auth.user.id,
        name: auth.user.email ?? "Administrador",
        role: "admin",
      }}
    />
  );
}
