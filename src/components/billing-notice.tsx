"use client";
import { useEffect, useState } from "react";
import { CalendarClock, MessageCircle, TriangleAlert, X } from "lucide-react";
import { money } from "@/lib/domain";
import { subscriptionNotice, supportLink } from "@/lib/admin";

const display = (date: string) => date.split("-").reverse().join("/");

// Aviso da mensalidade para o cliente, com o vencimento que o administrador
// registra no painel. Fechar vale até a próxima etapa (vencida) ou, depois de
// vencida, até o dia seguinte.
export default function BillingNotice({
  paidUntil,
  monthlyFee,
  now,
  support,
  email,
}: {
  paidUntil: string | null;
  monthlyFee: number;
  now: string;
  support: string | null;
  email: string;
}) {
  const notice = subscriptionNotice(paidUntil, now);
  const key = notice
    ? `extinpro:aviso-mensalidade:${paidUntil}:${notice.overdue ? now : "a-vencer"}`
    : "";
  const [closed, setClosed] = useState<string | null>(null);
  useEffect(() => {
    if (!key) return;
    try {
      setClosed(localStorage.getItem(key) ? key : "");
    } catch {
      setClosed("");
    }
  }, [key]);
  // Espera ler o navegador para não piscar um aviso já fechado.
  if (!notice || closed === null || closed === key) return null;
  const { days, overdue } = notice;
  const when = overdue
    ? days === -1
      ? "venceu ontem"
      : `venceu há ${-days} dias`
    : days === 0
      ? "vence hoje"
      : days === 1
        ? "vence amanhã"
        : `vence em ${days} dias`;
  function close() {
    try {
      localStorage.setItem(key, "fechado");
    } catch {
      /* Sem armazenamento: fecha até recarregar. */
    }
    setClosed(key);
  }
  return (
    <div className={`billing-notice ${overdue ? "overdue" : ""}`} role="status">
      {overdue ? <TriangleAlert size={20} aria-hidden="true" /> : <CalendarClock size={20} aria-hidden="true" />}
      <div>
        <strong>Sua mensalidade {when}</strong>
        <p>
          Vencimento em {display(paidUntil!)}
          {monthlyFee ? ` · ${money(monthlyFee)}` : ""}.{" "}
          {overdue
            ? "Regularize o pagamento para manter o acesso ao sistema."
            : "Pague até a data para seguir usando o sistema sem interrupção."}
        </p>
      </div>
      {support && (
        <a
          className="button"
          href={supportLink(support, `Olá! Quero pagar a mensalidade do ExtinPro da conta ${email}.`)}
          target="_blank"
          rel="noopener noreferrer"
        >
          <MessageCircle size={16} />
          Falar sobre o pagamento
        </a>
      )}
      <button className="icon-button" onClick={close} aria-label="Fechar aviso da mensalidade">
        <X size={16} />
      </button>
    </div>
  );
}
