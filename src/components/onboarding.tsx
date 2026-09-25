"use client";
import { useEffect, useState } from "react";
import { ArrowRight, Check, X } from "lucide-react";
import type { Store } from "@/lib/domain";

export type Step = "company" | "product" | "purchase" | "sale" | "goal";

// Primeiros passos de uma conta nova. Some sozinho quando tudo estiver feito;
// "Ocultar" vale só para este navegador.
export default function Onboarding({
  store,
  userId,
  busy,
  onStep,
}: {
  store: Store;
  userId: string;
  busy: boolean;
  onStep: (step: Step) => void;
}) {
  const key = `extinpro:primeiros-passos:${userId}`;
  // null até ler o navegador: quem já ocultou não vê o quadro piscar.
  const [hidden, setHidden] = useState<boolean | null>(null);
  useEffect(() => {
    try {
      setHidden(localStorage.getItem(key) === "oculto");
    } catch {
      setHidden(false);
    }
  }, [key]);
  const hasProduct = store.products.length > 0;
  const hasStock = store.products.some((p) => p.active && p.stock > 0);
  const steps: {
    id: Step;
    title: string;
    text: string;
    done: boolean;
    blocked?: string;
  }[] = [
    {
      id: "company",
      title: "Cadastre sua empresa",
      text: "Nome, CNPJ e contatos saem nos orçamentos.",
      done: !!store.company,
    },
    {
      id: "product",
      title: "Cadastre o primeiro produto",
      text: "Código, capacidade, custo e preço de venda.",
      done: hasProduct,
    },
    {
      id: "purchase",
      title: "Registre uma entrada de estoque",
      text: "As unidades compradas e o custo de cada uma.",
      done: store.movements.some((m) => m.kind === "purchase"),
      blocked: hasProduct ? undefined : "Cadastre um produto antes",
    },
    {
      id: "sale",
      title: "Registre a primeira venda",
      text: "O orçamento em PDF e a validade saem juntos.",
      done: store.movements.some((m) => m.kind === "sale"),
      blocked: hasStock ? undefined : "Registre uma entrada de estoque antes",
    },
    {
      id: "goal",
      title: "Defina a meta do mês",
      text: "E acompanhe o ritmo de vendas na Visão geral.",
      done: Object.keys(store.settings.goals ?? {}).length > 0,
    },
  ];
  const done = steps.filter((s) => s.done).length;
  if (hidden !== false || done === steps.length) return null;
  const next = steps.find((s) => !s.done)!;
  function hide() {
    try {
      localStorage.setItem(key, "oculto");
    } catch {
      /* Sem armazenamento: some só até recarregar. */
    }
    setHidden(true);
  }
  return (
    <section className="panel onboarding" aria-label="Primeiros passos">
      <div className="panel-heading">
        <div>
          <h2>Primeiros passos</h2>
          <p>
            {done} de {steps.length} concluídos · deixe o sistema pronto para o
            dia a dia
          </p>
        </div>
        <button className="text-button" onClick={hide}>
          Ocultar <X size={14} />
        </button>
      </div>
      <div
        className="onboarding-track"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={steps.length}
        aria-valuenow={done}
        aria-label={`${done} de ${steps.length} passos concluídos`}
      >
        <i style={{ width: `${(done / steps.length) * 100}%` }} />
      </div>
      <ol className="onboarding-steps">
        {steps.map((s, i) => (
          <li
            key={s.id}
            className={s.done ? "done" : s.id === next.id ? "next" : ""}
          >
            <span className="onboarding-mark" aria-hidden="true">
              {s.done ? <Check size={14} /> : i + 1}
            </span>
            <strong>{s.title}</strong>
            <p>{s.text}</p>
            {s.done ? (
              <span className="onboarding-note">Concluído</span>
            ) : s.blocked ? (
              <span className="onboarding-note">{s.blocked}</span>
            ) : (
              <button
                className={s.id === next.id ? "primary" : ""}
                onClick={() => onStep(s.id)}
                disabled={busy}
              >
                Fazer agora
                <ArrowRight size={15} />
              </button>
            )}
          </li>
        ))}
      </ol>
    </section>
  );
}
