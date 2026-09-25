"use client";
import { useState } from "react";
import { Hourglass, Lock, LogOut, MessageCircle, RefreshCw } from "lucide-react";
import { supportLink } from "@/lib/admin";

// Mostrada no lugar do painel quando a conta está suspensa ou ainda não foi
// ativada pelo administrador. Os dados continuam no banco; o bloqueio vale
// também nas funções e na leitura direta das tabelas.
export default function Suspended({
  email,
  support = null,
  status = "suspended",
}: {
  email: string;
  support?: string | null;
  status?: "suspended" | "pending";
}) {
  const pending = status === "pending";
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function logout() {
    setBusy(true);
    setError("");
    try {
      const r = await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "logout" }),
      });
      if (!r.ok) throw new Error();
      window.location.assign("/login");
    } catch {
      setError("Não foi possível sair. Verifique a conexão e tente novamente.");
      setBusy(false);
    }
  }
  return (
    <main className="standalone suspended-page">
      <span className="suspended-mark" aria-hidden="true">
        {pending ? <Hourglass size={26} /> : <Lock size={26} />}
      </span>
      <span className="eyebrow">ExtinPro · Assinatura</span>
      <h1>{pending ? "Conta aguardando ativação" : "Acesso suspenso"}</h1>
      {pending ? (
        <p>
          A conta <strong>{email}</strong> foi criada e está aguardando a
          liberação do acesso. Assim que ela for ativada, é só entrar de novo.
        </p>
      ) : (
        <p>
          O acesso da conta <strong>{email}</strong> está suspenso. Seus dados
          continuam guardados e voltam a aparecer assim que a assinatura for
          regularizada. Fale com o responsável pelo sistema para reativar.
        </p>
      )}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <div className="suspended-actions">
        {support && (
          <a
            className="button"
            href={supportLink(
              support,
              pending
                ? `Olá! Criei minha conta no ExtinPro (${email}) e aguardo a ativação.`
                : `Olá! Quero reativar o acesso ao ExtinPro da conta ${email}.`,
            )}
            target="_blank"
            rel="noopener noreferrer"
          >
            <MessageCircle size={16} />
            Falar com o suporte
          </a>
        )}
        <a className="button" href="/app">
          <RefreshCw size={16} />
          Verificar novamente
        </a>
        <button className="primary" onClick={logout} disabled={busy}>
          <LogOut size={16} />
          {busy ? "Saindo…" : "Sair da conta"}
        </button>
      </div>
    </main>
  );
}
