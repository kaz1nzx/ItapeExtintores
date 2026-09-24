"use client";
import { useState, type CSSProperties, type FormEvent } from "react";
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
import EmberField from "@/components/ember-field";
import { Magnetic } from "@/components/motion";

// Índice de sequência das animações de entrada, lido pelo CSS.
const step = (i: number) => ({ "--i": i }) as CSSProperties;
const specs = [
  { label: "Estoque sempre à vista", icon: Boxes },
  { label: "Clareza para suas decisões", icon: ChartNoAxesCombined },
  { label: "Acesso protegido à sua gestão", icon: ShieldCheck },
];
const ticker = [
  "Estoque em tempo real",
  "Financeiro conectado",
  "Relatórios prontos para impressão",
  "Acesso individual protegido",
];
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
        <EmberField />
        <div className="story-grid" aria-hidden="true" />
        <div className="story-top">
          <Link href="/" className="brand">
            <Magnetic strength={7}>
              <span className="brand-mark">
                <Flame />
              </span>
            </Magnetic>
            <span>
              ExtinPro<span className="brand-sub">GESTÃO</span>
            </span>
          </Link>
          <span className="story-code" aria-hidden="true">
            GESTÃO DE EXTINTORES
            <br />
            EXTINPRO · BRASIL
          </span>
        </div>
        <div className="story-main">
          <span className="eyebrow">Mais controle. Mais tranquilidade.</span>
          <h1 className="display-xl">
            <span className="line" style={step(0)}>
              <span>Sua operação</span>
            </span>
            <span className="line" style={step(1)}>
              <span>sob</span>
            </span>
            <span className="line" style={step(2)}>
              <span>
                <em>controle</em>
              </span>
            </span>
          </h1>
          <p>
            Do primeiro extintor em estoque ao resultado do mês. Tudo conectado,
            tudo no seu controle.
          </p>
          <ul className="spec-list">
            {specs.map((s, i) => (
              <li key={s.label} style={step(i)}>
                <span className="spec-n">
                  {String(i + 1).padStart(2, "0")}
                </span>
                {s.label}
                <s.icon aria-hidden="true" />
              </li>
            ))}
          </ul>
        </div>
        <div className="story-foot">
          <div className="story-ticker" aria-hidden="true">
            <div className="ticker-track">
              {[...ticker, ...ticker].map((t, i) => (
                <span key={i}>{t}</span>
              ))}
            </div>
          </div>
        </div>
      </section>
      <section className="login-form">
        <div className="login-box">
          <span className="pill">
            <span className="dot" /> Seu espaço de gestão
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
          <div className="login-divider">Conheça o sistema</div>
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
