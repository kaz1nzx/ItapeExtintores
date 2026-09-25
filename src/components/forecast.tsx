"use client";
import { useState } from "react";
import { Pencil, Info } from "lucide-react";
import { money, type Validity } from "@/lib/domain";
import { monthName, rechargeForecast, shortMonth, type ForecastBucket } from "@/lib/insights";
import { PanelHeading } from "./primitives";

const count = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

// Quanto de recarga vem pela frente: extintores com validade pendente por mês
// de vencimento, com o potencial pelo valor médio da recarga.
export default function RechargeForecast({
  validities,
  now,
  price,
  onEditPrice,
  busy,
}: {
  validities: Validity[];
  now: string;
  price: number;
  onEditPrice: () => void;
  busy: boolean;
}) {
  const { late, months } = rechargeForecast(validities, now, 6);
  const buckets = late.units ? [late, ...months] : months;
  const [selected, setSelected] = useState(months[0].key);
  const active = buckets.find((b) => b.key === selected) ?? months[0];
  const max = Math.max(1, ...buckets.map((b) => b.units));
  const ahead = months.reduce((a, b) => a + b.units, 0);
  const label = (b: ForecastBucket) => (b.month ? shortMonth(b.month) : "Atrasadas");
  const headline = (b: ForecastBucket) => {
    const who = `${count(b.units, "extintor", "extintores")} de ${count(b.clients, "cliente", "clientes")}`;
    if (!b.month)
      return b.units === 1
        ? `${who} venceu e ainda não foi renovado`
        : `${who} venceram e ainda não foram renovados`;
    if (!b.units) return `Nenhum extintor vence em ${monthName(b.month)}`;
    return `Em ${monthName(b.month)} ${b.units === 1 ? "vence" : "vencem"} ${who}`;
  };
  return (
    <section className="panel forecast-panel">
      <PanelHeading
        title="Previsão de recargas"
        subtitle="Extintores com validade pendente, por mês de vencimento"
        extra={
          <button className="text-button" onClick={onEditPrice} disabled={busy}>
            <Pencil size={14} />
            {price ? `Recarga média ${money(price)}` : "Definir valor da recarga"}
          </button>
        }
      />
      <div className="forecast-headline" aria-live="polite">
        <strong>{headline(active)}</strong>
        {active.units > 0 &&
          (price ? (
            <span>
              <b>{money(active.units * price)}</b> em potencial
            </span>
          ) : (
            <button className="text-button" onClick={onEditPrice} disabled={busy}>
              Informe o valor médio da recarga para ver o potencial
            </button>
          ))}
      </div>
      <div className="forecast-columns" role="group" aria-label="Recargas por mês">
        {buckets.map((b) => (
          <button
            key={b.key}
            className={`forecast-column ${b.key === active.key ? "selected" : ""} ${b.month ? "" : "late"}`}
            onClick={() => setSelected(b.key)}
            aria-pressed={b.key === active.key}
            aria-label={`${b.month ? monthName(b.month) : "Atrasadas"}: ${headline(b)}${price && b.units ? `, ${money(b.units * price)} em potencial` : ""}`}
          >
            <span className="forecast-value">{b.units}</span>
            <span className="forecast-bar">
              <i style={{ height: `${(b.units / max) * 100}%` }} />
            </span>
            <span className="forecast-label">{label(b)}</span>
          </button>
        ))}
      </div>
      <p className="admin-note">
        <Info size={15} />
        <span>
          Próximos 6 meses: {count(ahead, "extintor", "extintores")}
          {price ? ` · ${money(ahead * price)} em potencial` : ""}. Considera só as
          validades pendentes; renovadas e dispensadas saem da conta.
        </span>
      </p>
    </section>
  );
}
