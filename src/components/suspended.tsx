"use client";
import { useState } from "react";
import { Lock, LogOut, RefreshCw } from "lucide-react";

// Mostrada no lugar do painel quando o administrador suspende a conta. Os
// dados continuam no banco; o bloqueio vale também nas funções e na leitura
// direta das tabelas.
export default function Suspended({ email }: { email: string }) {
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
        <Lock size={26} />
      </span>
      <span className="eyebrow">ExtinPro · Assinatura</span>
      <h1>Acesso suspenso</h1>
      <p>
        O acesso da conta <strong>{email}</strong> está suspenso. Seus dados
        continuam guardados e voltam a aparecer assim que a assinatura for
        regularizada. Fale com o responsável pelo sistema para reativar.
      </p>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <div className="suspended-actions">
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
