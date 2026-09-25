import {
  addMonths,
  daysBefore,
  summarize,
  type Settings,
  type Store,
  type Validity,
} from "@/lib/domain";

const pad = (n: number) => String(n).padStart(2, "0");
const lastDay = (month: string) =>
  new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0)).getUTCDate();
export const monthName = (month: string) =>
  new Date(`${month}-15T12:00:00Z`).toLocaleDateString("pt-BR", {
    month: "long",
    timeZone: "UTC",
  });
export const shortMonth = (month: string) =>
  `${monthName(month).slice(0, 3)}/${month.slice(2, 4)}`;

// Período anterior comparável. Mês parcial (1 a 24) compara com os mesmos dias
// do mês anterior; mês completo, com o mês anterior inteiro; semana, com os 7
// dias anteriores.
export function previousPeriod(
  period: "week" | "month",
  from: string,
  to: string,
) {
  if (period === "week")
    return { from: daysBefore(from, 7), to: daysBefore(to, 7), label: "vs. 7 dias anteriores" };
  const month = addMonths(`${from.slice(0, 7)}-01`, -1).slice(0, 7);
  const full = Number(to.slice(8)) === lastDay(to.slice(0, 7));
  const end = full ? lastDay(month) : Math.min(Number(to.slice(8)), lastDay(month));
  return {
    from: `${month}-01`,
    to: `${month}-${pad(end)}`,
    label: full ? `vs. ${monthName(month)}` : `vs. mesmo período de ${monthName(month)}`,
  };
}

export type Trend = {
  direction: "up" | "down" | "flat";
  // null quando o período anterior não tem base para porcentagem.
  percent: number | null;
  difference: number;
};
export function trend(current: number, previous: number): Trend {
  const difference = current - previous;
  return {
    direction: difference > 0 ? "up" : difference < 0 ? "down" : "flat",
    percent: previous > 0 ? (difference / previous) * 100 : null,
    difference,
  };
}
export function formatPercent(percent: number) {
  const size = Math.abs(percent);
  const text = size >= 100 ? Math.round(size).toString() : size.toFixed(1).replace(".", ",");
  return `${percent > 0 ? "+" : percent < 0 ? "−" : ""}${text}%`;
}

// Meta vigente no mês: a definida para ele ou a última definida antes. 0 (ou
// nenhuma) significa sem meta.
export function goalFor(settings: Settings, month: string) {
  const goals = settings.goals ?? {};
  const key = Object.keys(goals)
    .filter((k) => k <= month)
    .sort()
    .at(-1);
  return key ? goals[key] : 0;
}

export function goalProgress(store: Store, month: string, now: string) {
  const goal = goalFor(store.settings, month);
  const total = lastDay(month);
  const current = now.slice(0, 7) === month;
  const elapsed = current ? Number(now.slice(8)) : total;
  const to = `${month}-${pad(elapsed)}`;
  const sold = summarize(store, `${month}-01`, to).revenue;
  // Dias que ainda contam, incluindo hoje: ainda dá para vender hoje.
  const daysLeft = current ? total - elapsed + 1 : 0;
  const remaining = Math.max(0, goal - sold);
  return {
    goal,
    sold,
    current,
    percent: goal ? (sold / goal) * 100 : 0,
    remaining,
    daysLeft,
    perDay: daysLeft ? Math.ceil(remaining / daysLeft) : 0,
    // Onde as vendas deveriam estar hoje para bater a meta em ritmo constante.
    expected: Math.round((goal * elapsed) / total),
    projected: current ? Math.round((sold / elapsed) * total) : sold,
  };
}

export type ForecastBucket = {
  key: string;
  month: string | null;
  units: number;
  clients: number;
  validities: number;
};
// Extintores com validade pendente por mês de vencimento, do mês atual em
// diante, mais um balde com o que venceu antes e não foi renovado.
export function rechargeForecast(validities: Validity[], now: string, months = 6) {
  const pending = validities.filter((v) => v.status === "pending");
  const first = now.slice(0, 7);
  const bucket = (key: string, month: string | null, list: Validity[]): ForecastBucket => ({
    key,
    month,
    units: list.reduce((a, v) => a + v.quantity, 0),
    clients: new Set(list.map((v) => v.client.trim().toLocaleLowerCase("pt-BR"))).size,
    validities: list.length,
  });
  const late = bucket(
    "late",
    null,
    pending.filter((v) => v.dueDate.slice(0, 7) < first),
  );
  const ahead = Array.from({ length: months }, (_, i) => {
    const month = addMonths(`${first}-01`, i).slice(0, 7);
    return bucket(month, month, pending.filter((v) => v.dueDate.startsWith(month)));
  });
  return { late, months: ahead };
}
