import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { configured, supabase } from "@/lib/supabase";
import AdminPanel from "@/components/admin";
import {
  adminOnlyError,
  missingFunction,
  type AdminOverview,
} from "@/lib/admin";
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "ExtinPro · Administração" };
export default async function Page() {
  if (!configured()) redirect("/login");
  const client = await supabase();
  const { data: auth, error: authError } = await client.auth.getUser();
  if (authError || !auth.user || auth.user.is_anonymous) redirect("/login");
  // Quem decide se a conta é administradora é o banco (itape_private.admins).
  const { data, error } = await client.rpc("itape_admin_overview");
  if (error && adminOnlyError(error)) redirect("/app");
  if (error)
    return (
      <main className="standalone">
        <h1>
          {missingFunction(error)
            ? "Falta atualizar o banco de dados."
            : "Não foi possível carregar o painel."}
        </h1>
        <p>
          {missingFunction(error)
            ? "O painel de administração precisa da atualização database/upgrade.sql. No Supabase, abra o SQL Editor, execute o arquivo inteiro e recarregue esta página. Nenhum dado é apagado."
            : "Verifique a conexão e a configuração do banco Supabase."}
        </p>
        <a className="button primary" href="/admin">
          Tentar novamente
        </a>
        <a className="button" href="/app">
          Voltar ao sistema
        </a>
      </main>
    );
  return (
    <AdminPanel initial={data as AdminOverview} email={auth.user.email ?? ""} />
  );
}
