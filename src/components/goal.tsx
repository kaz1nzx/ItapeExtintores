"use client";
import { CircleCheck, Pencil, Target, TrendingDown, TrendingUp } from "lucide-react";
import { money, type Store } from "@/lib/domain";
import { goalProgress, monthName } from "@/lib/insights";

// Meta de vendas do mês na Visão geral: quanto já entrou, quanto falta, o
// valor por dia até o fim do mês e onde as vendas deveriam estar hoje.
export default function GoalPanel({
  store,
  month,
  now,
  onEdit,
  busy,
}: {
  store: Store;
  month: string;
  now: string;
  onEdit: () => void;
  busy: boolean;
}) {
  const p = goalProgress(store, month, now);
  const name = `${monthName(month)} de ${month.slice(0, 4)}`;
  if (!p.goal)
    return (
      <section className="panel goal-panel goal-empty">
        <span className="goal-icon">
          <Target size={22} />
        </span>
        <div>
          <strong>Defina a meta de vendas de {monthName(month)}</strong>
          <p>
            Acompanhe o mês com uma barra de progresso e saiba quanto vender por
            dia para chegar lá.
          </p>
        </div>
        <button className="primary" onClick={onEdit} disabled={busy}>
          <Target size={16} />
          Definir meta
        </button>
      </section>
    );
  const reached = p.sold >= p.goal;
  const ahead = p.sold >= p.expected;
  const percent = Math.round(p.percent);
  return (
    <section className="panel goal-panel" aria-label={`Meta de vendas de ${name}`}>
      <div className="goal-head">
        <div>
          <span className="eyebrow">Meta de vendas · {name}</span>
          <strong className="goal-value">
            {money(p.sold)} <small>de {money(p.goal)}</small>
          </strong>
        </div>
        <span className={`goal-percent ${reached ? "reached" : ""}`}>{percent}%</span>
        <button className="text-button" onClick={onEdit} disabled={busy}>
          <Pencil size={14} />
          Editar meta
        </button>
      </div>
      <div
        className="goal-track"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.min(100, percent)}
        aria-label={`${percent}% da meta de ${name}`}
      >
        <i
          className={`goal-fill ${reached ? "reached" : ""}`}
          style={{ width: `${Math.min(100, p.percent)}%` }}
        />
        {p.current && !reached && (
          <span
            className="goal-pace"
            style={{ left: `${Math.min(100, (p.expected / p.goal) * 100)}%` }}
            title={`Ritmo esperado até hoje: ${money(p.expected)}`}
          />
        )}
      </div>
      <div className="goal-facts">
        {reached ? (
          <span className="good">
            <CircleCheck size={15} />
            Meta batida{p.sold > p.goal ? `, ${money(p.sold - p.goal)} acima` : ""}
          </span>
        ) : p.current ? (
          <>
            <span className={ahead ? "good" : "behind"}>
              {ahead ? <TrendingUp size={15} /> : <TrendingDown size={15} />}
              {ahead ? "Acima" : "Abaixo"} do ritmo
            </span>
            <span>
              <i className="pace-key" aria-hidden="true" />
              Esperado até hoje: {money(p.expected)}
            </span>
          </>
        ) : (
          <span className="behind">
            <TrendingDown size={15} />
            Meta não batida: faltaram {money(p.remaining)}
          </span>
        )}
        {p.current && !reached && (
          <span>
            Faltam {money(p.remaining)} em {p.daysLeft}{" "}
            {p.daysLeft === 1 ? "dia" : "dias"} · {money(p.perDay)} por dia
          </span>
        )}
        {p.current && (
          <span>
            No ritmo atual, o mês fecha em {money(p.projected)} (
            {Math.round((p.projected / p.goal) * 100)}%)
          </span>
        )}
      </div>
    </section>
  );
}
