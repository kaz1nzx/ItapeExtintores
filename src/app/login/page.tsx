"use client";
import { useState, type FormEvent } from "react";
import Link from "next/link";
import {
  ArrowRight,
  Flame,
  ShieldCheck,
  Boxes,
  ChartNoAxesCombined,
  Eye,
  EyeOff,
} from "lucide-react";
export default function Login() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [visible, setVisible] = useState(false);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const f = new FormData(e.currentTarget);
    try {
      const res = await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: f.get("email"),
          password: f.get("password"),
        }),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error);
      window.location.assign("/app");
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Falha na conexão. Tente novamente.",
      );
      setBusy(false);
    }
  }
  return (
    <main className="login-page">
      <section className="login-story">
        <Link href="/" className="brand">
          <span className="brand-mark">
            <Flame />
          </span>
          <span>
            itapê<span className="brand-sub">EXTINTORES</span>
          </span>
        </Link>
        <div>
          <span className="eyebrow">MAIS CONTROLE. MAIS TRANQUILIDADE.</span>
          <h1>
            Sua operação
            <br />
            em boas mãos.
          </h1>
          <p>
            Do primeiro extintor em estoque ao resultado do mês. Tudo conectado,
            tudo no seu controle.
          </p>
          <div className="story-feature">
            <Boxes /> Estoque sempre à vista
          </div>
          <div className="story-feature">
            <ChartNoAxesCombined /> Clareza para suas decisões
          </div>
          <div className="story-feature">
            <ShieldCheck /> Acesso protegido à sua gestão
          </div>
        </div>
        <small>Itapê Extintores · Gestão com confiança.</small>
        <div className="story-orbit" aria-hidden="true">
          <Flame />
        </div>
      </section>
      <section className="login-form">
        <div className="login-box">
          <span className="pill">
            <span className="dot" /> SEU ESPAÇO DE GESTÃO
          </span>
          <h2>Bom ter você aqui.</h2>
          <p>Entre na sua conta para cuidar do que importa.</p>
          <form onSubmit={submit}>
            <label>
              E-mail
              <input
                name="email"
                type="email"
                autoComplete="username"
                placeholder="voce@empresa.com.br"
                required
                maxLength={254}
              />
            </label>
            <label>
              Senha
              <div className="password-field">
                <input
                  name="password"
                  type={visible ? "text" : "password"}
                  autoComplete="current-password"
                  placeholder="Digite sua senha"
                  required
                  maxLength={128}
                />
                <button
                  type="button"
                  className="icon-button"
                  aria-label={visible ? "Ocultar senha" : "Mostrar senha"}
                  onClick={() => setVisible(!visible)}
                >
                  {visible ? <EyeOff /> : <Eye />}
                </button>
              </div>
            </label>
            {error && (
              <p className="form-error" role="alert">
                {error}
              </p>
            )}
            <button className="primary full" disabled={busy}>
              {busy ? "Entrando…" : "Entrar no painel"}
              <ArrowRight size={18} />
            </button>
          </form>
          <div className="login-divider">CONHEÇA O SISTEMA</div>
          <Link className="button full" href="/demo">
            Explorar demonstração <ArrowRight size={16} />
          </Link>
          <p className="login-note">
            Use a conta cadastrada em Authentication no seu projeto Supabase. A
            demonstração usa apenas dados fictícios.
          </p>
        </div>
        <small className="login-footer">
          <ShieldCheck size={14} /> Seu estoque e seu financeiro, em um só
          lugar.
        </small>
      </section>
    </main>
  );
}
