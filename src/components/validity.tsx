"use client";
import { useState, type CSSProperties } from "react";
import {
  ArrowUpRight,
  CalendarCheck,
  ChevronLeft,
  ChevronRight,
  Database,
  MessageCircle,
  RotateCw,
  Search,
  ShieldCheck,
  X,
} from "lucide-react";
import {
  ALERT_DAYS,
  VALIDITY_MONTHS,
  daysBetween,
  today,
  urgency,
  type Urgency,
  type Validity,
} from "@/lib/domain";
import { CountUp } from "./motion";
import { Empty } from "./primitives";

const MONTHS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const WEEKDAYS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const RANK: Record<Urgency, number> = { overdue: 0, soon: 1, upcoming: 2, later: 3 };
const display = (date: string) => date.split("-").reverse().join("/");
const integer = (n: number) => String(Math.round(n));
const units = (list: Validity[]) => list.reduce((a, v) => a + v.quantity, 0);
const byDue = (a: Validity, b: Validity) =>
  a.dueDate.localeCompare(b.dueDate) || a.client.localeCompare(b.client, "pt-BR");

export function dueLabel(days: number) {
  if (days < -1) return `Venceu há ${-days} dias`;
  if (days === -1) return "Venceu ontem";
  if (days === 0) return "Vence hoje";
  if (days === 1) return "Vence amanhã";
  return `Vence em ${days} dias`;
}

// Abre o WhatsApp com a mensagem pronta para o cliente. Números com DDD (10 ou
// 11 dígitos) ganham o código do Brasil. Na demonstração os telefones são
// fictícios, então o WhatsApp abre para escolher o contato.
function whatsappLink(v: Validity, demo: boolean) {
  const late = daysBetween(today(), v.dueDate) < 0;
  const what = v.quantity === 1 ? "do extintor" : `dos ${v.quantity} extintores`;
  const text =
    `Olá, ${v.client}! Aqui é da Itapê Extintores. ` +
    `A validade ${what} (${v.item}) ${late ? "venceu" : "vence"} em ${display(v.dueDate)}. ` +
    (late ? "Vamos agendar a recarga?" : "Podemos agendar a recarga antes do vencimento?");
  let digits = demo ? "" : v.phone.replace(/\D/g, "");
  if (digits.length === 10 || digits.length === 11) digits = `55${digits}`;
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
}

type Filter = "attention" | "overdue" | "soon" | "upcoming" | "all";
const FILTERS: [Filter, string][] = [
  ["attention", "Atenção"],
  ["overdue", "Vencidas"],
  ["soon", `Até ${ALERT_DAYS} dias`],
  ["upcoming", "31 a 90 dias"],
  ["all", "Todas"],
];
const fits = (filter: Filter, u: Urgency) =>
  filter === "all" ||
  (filter === "attention" ? u === "overdue" || u === "soon" : u === filter);

export default function ValidityPage({
  validities,
  demo,
  busy,
  onCreate,
  onRenew,
  onDismiss,
}: {
  validities: Validity[];
  demo: boolean;
  busy: boolean;
  onCreate: () => void;
  onRenew: (v: Validity) => void;
  onDismiss: (v: Validity) => void;
}) {
  const now = today();
  const [month, setMonth] = useState(now.slice(0, 7));
  const [day, setDay] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("attention");
  const [query, setQuery] = useState("");
  const pending = validities.filter((v) => v.status === "pending").sort(byDue);
  const group = (u: Urgency) => pending.filter((v) => urgency(v.dueDate, now) === u);
  const overdue = group("overdue");
  const soon = group("soon");
  const upcoming = group("upcoming");
  const clients = new Set(pending.map((v) => v.client.toLocaleLowerCase("pt-BR"))).size;
  const needle = query.trim().toLocaleLowerCase("pt-BR");
  const list = pending.filter(
    (v) =>
      (day ? v.dueDate === day : fits(filter, urgency(v.dueDate, now))) &&
      (!needle ||
        `${v.client} ${v.item} ${v.phone}`.toLocaleLowerCase("pt-BR").includes(needle)),
  );
  const pick = (next: Filter) => {
    setFilter(next);
    setDay(null);
  };
  const summary: [Filter, string, Validity[], string][] = [
    ["overdue", "Vencidas", overdue, "extintores para recarregar já"],
    ["soon", `Vencem em até ${ALERT_DAYS} dias`, soon, "extintores · hora de avisar"],
    ["upcoming", "Em 31 a 90 dias", upcoming, "extintores no radar"],
  ];

  if (!validities.length)
    return (
      <section className="panel">
        <Empty
          title="Nenhuma validade agendada ainda"
          description={`Cada venda registrada agenda sozinha a validade de ${VALIDITY_MONTHS} meses para o cliente. Recargas feitas fora do sistema podem ser registradas à mão.`}
        >
          <button onClick={onCreate}>Registrar validade</button>
        </Empty>
      </section>
    );

  return (
    <>
      <section className="validity-summary" aria-label="Resumo das validades">
        {summary.map(([key, label, items, note]) => (
          <button
            key={key}
            className={`${key} ${filter === key && !day ? "active" : ""}`}
            onClick={() => pick(key)}
            aria-pressed={filter === key && !day}
          >
            <span>{label}</span>
            <strong>
              <CountUp value={items.length} format={integer} />
            </strong>
            <small>
              {units(items)} {note}
            </small>
          </button>
        ))}
        <div>
          <span>Clientes acompanhados</span>
          <strong>
            <CountUp value={clients} format={integer} />
          </strong>
          <small>{pending.length} lembretes ativos</small>
        </div>
      </section>
      <div className="validity-layout">
        <MonthCalendar
          month={month}
          setMonth={setMonth}
          pending={pending}
          now={now}
          selected={day}
          onSelect={setDay}
        />
        <section className="panel agenda-panel">
          <div className="panel-heading">
            <div>
              <h2>{day ? `Vencimentos em ${display(day)}` : "Agenda de contatos"}</h2>
              <p>
                {list.length} {list.length === 1 ? "lembrete" : "lembretes"} · do
                vencimento mais próximo ao mais distante
              </p>
            </div>
            {day && (
              <button className="text-button" onClick={() => setDay(null)}>
                Voltar à agenda <X size={14} />
              </button>
            )}
          </div>
          <div className="agenda-tools">
            {!day && (
              <div className="chips" role="group" aria-label="Filtrar lembretes">
                {FILTERS.map(([key, label]) => (
                  <button
                    key={key}
                    className={filter === key ? "selected" : ""}
                    onClick={() => pick(key)}
                    aria-pressed={filter === key}
                  >
                    {label}
                  </button>
                ))}
              </div>
            )}
            <div className="search-field">
              <Search size={16} />
              <input
                aria-label="Buscar cliente ou extintor"
                placeholder="Buscar cliente ou extintor…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
          </div>
          {list.length ? (
            <div className="agenda-list">
              {list.map((v, i) => (
                <AgendaItem
                  key={v.id}
                  v={v}
                  now={now}
                  demo={demo}
                  busy={busy}
                  index={i}
                  onRenew={onRenew}
                  onDismiss={onDismiss}
                />
              ))}
            </div>
          ) : (
            <Empty
              title={needle ? "Nenhum cliente encontrado" : "Nada por aqui"}
              description={
                needle
                  ? "Tente outro nome ou extintor."
                  : day
                    ? "Nenhum vencimento pendente neste dia."
                    : "Nenhum lembrete neste filtro. Veja as outras faixas ou todas as validades."
              }
            />
          )}
        </section>
      </div>
      <div className="info-line">
        <ShieldCheck size={16} />
        Cada venda agenda sozinha a validade de {VALIDITY_MONTHS} meses para o cliente.
        Ao renovar, o lembrete atual é encerrado e o próximo ciclo começa na data da recarga.
      </div>
    </>
  );
}

function MonthCalendar({
  month,
  setMonth,
  pending,
  now,
  selected,
  onSelect,
}: {
  month: string;
  setMonth: (m: string) => void;
  pending: Validity[];
  now: string;
  selected: string | null;
  onSelect: (date: string | null) => void;
}) {
  const [y, m] = month.split("-").map(Number);
  const lead = new Date(Date.UTC(y, m - 1, 1)).getUTCDay();
  const total = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const label = new Date(Date.UTC(y, m - 1, 15)).toLocaleDateString("pt-BR", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
  const shift = (delta: number) => {
    const i = y * 12 + (m - 1) + delta;
    return `${Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, "0")}`;
  };
  const byDay = new Map<string, Validity[]>();
  for (const v of pending)
    if (v.dueDate.startsWith(month))
      byDay.set(v.dueDate, [...(byDay.get(v.dueDate) ?? []), v]);
  const inMonth = [...byDay.values()].flat();
  const cells: (number | null)[] = [
    ...Array<null>(lead).fill(null),
    ...Array.from({ length: total }, (_, i) => i + 1),
  ];
  while (cells.length % 7) cells.push(null);
  return (
    <section className="panel calendar-panel">
      <div className="panel-heading">
        <div>
          <h2 className="cal-title">{label}</h2>
          <p>
            {inMonth.length} {inMonth.length === 1 ? "vencimento" : "vencimentos"} ·{" "}
            {units(inMonth)} extintores
          </p>
        </div>
        <div className="cal-nav">
          <button
            className="icon-button"
            onClick={() => setMonth(shift(-1))}
            aria-label="Mês anterior"
          >
            <ChevronLeft size={18} />
          </button>
          <button
            className="cal-today"
            onClick={() => {
              setMonth(now.slice(0, 7));
              onSelect(null);
            }}
          >
            Hoje
          </button>
          <button
            className="icon-button"
            onClick={() => setMonth(shift(1))}
            aria-label="Próximo mês"
          >
            <ChevronRight size={18} />
          </button>
        </div>
      </div>
      <div className="cal-week" aria-hidden="true">
        {WEEKDAYS.map((d) => (
          <span key={d}>{d}</span>
        ))}
      </div>
      {/* key={month}: a grade reentra ao trocar de mês. */}
      <div className="cal-grid" key={month}>
        {cells.map((d, i) => {
          if (d === null) return <span key={`vazio-${i}`} className="cal-empty" />;
          const date = `${month}-${String(d).padStart(2, "0")}`;
          const items = byDay.get(date) ?? [];
          const worst = items
            .map((v) => urgency(v.dueDate, now))
            .sort((a, b) => RANK[a] - RANK[b])[0];
          return (
            <button
              key={date}
              className={`cal-day ${worst ?? ""} ${date === now ? "today" : ""} ${date === selected ? "selected" : ""}`}
              onClick={() => onSelect(date === selected ? null : date)}
              aria-pressed={date === selected}
              aria-label={`${d} de ${label}${items.length ? `: ${items.length} ${items.length === 1 ? "vencimento" : "vencimentos"}` : ""}`}
              style={{ "--i": i } as CSSProperties}
            >
              <span className="cal-num">{d}</span>
              {items.length > 0 && <span className="cal-mark">{items.length}</span>}
            </button>
          );
        })}
      </div>
      <div className="cal-legend" aria-hidden="true">
        <span>
          <i className="overdue" /> Vencida
        </span>
        <span>
          <i className="soon" /> Até {ALERT_DAYS} dias
        </span>
        <span>
          <i className="later" /> Depois
        </span>
      </div>
    </section>
  );
}

function AgendaItem({
  v,
  now,
  demo,
  busy,
  index,
  onRenew,
  onDismiss,
}: {
  v: Validity;
  now: string;
  demo: boolean;
  busy: boolean;
  index: number;
  onRenew: (v: Validity) => void;
  onDismiss: (v: Validity) => void;
}) {
  const days = daysBetween(now, v.dueDate);
  const [yy, mm, dd] = v.dueDate.split("-");
  return (
    <article
      className={`agenda-item ${urgency(v.dueDate, now)}`}
      style={{ "--i": Math.min(index, 12) } as CSSProperties}
    >
      <div className="due-block" aria-label={`Vencimento ${display(v.dueDate)}`}>
        <strong>{dd}</strong>
        <span>{MONTHS[Number(mm) - 1]}</span>
        <small>{yy}</small>
      </div>
      <div className="agenda-body">
        <h3>{v.client}</h3>
        <p>
          {v.quantity}× {v.item}
        </p>
        <div className="agenda-meta">
          <span className="due-label">{dueLabel(days)}</span>
          <span>desde {display(v.startDate)}</span>
          {v.phone && <span>{v.phone}</span>}
        </div>
      </div>
      <div className="agenda-actions">
        <a
          className="button whatsapp"
          href={whatsappLink(v, demo)}
          target="_blank"
          rel="noopener noreferrer"
          title={v.phone ? `Enviar mensagem para ${v.phone}` : "Escolher o contato no WhatsApp"}
        >
          <MessageCircle size={15} />
          Avisar
        </a>
        <button onClick={() => onRenew(v)} disabled={busy}>
          <RotateCw size={15} />
          Renovar
        </button>
        <button
          className="icon-button"
          onClick={() => onDismiss(v)}
          disabled={busy}
          aria-label={`Dispensar lembrete de ${v.client}`}
          title="Dispensar lembrete"
        >
          <X size={16} />
        </button>
      </div>
    </article>
  );
}

/** Resumo na Visão geral: quem precisa de contato nos próximos dias. */
export function ValidityStrip({
  validities,
  onOpen,
}: {
  validities: Validity[];
  onOpen: () => void;
}) {
  const now = today();
  const due = validities
    .filter((v) => v.status === "pending" && daysBetween(now, v.dueDate) <= ALERT_DAYS)
    .sort(byDue);
  return (
    <section className="panel validity-strip">
      <div className="panel-heading">
        <div>
          <h2>Validades a vencer</h2>
          <p>Clientes para contatar nos próximos {ALERT_DAYS} dias</p>
        </div>
        <div className="heading-actions">
          {due.length > 0 && <span className="count-badge">{due.length}</span>}
          <button className="text-button" onClick={onOpen}>
            Abrir calendário <ArrowUpRight size={15} />
          </button>
        </div>
      </div>
      {due.length ? (
        <div className="strip-cards">
          {due.slice(0, 4).map((v) => (
            <button
              key={v.id}
              className={`strip-card ${urgency(v.dueDate, now)}`}
              onClick={onOpen}
            >
              <span className="due-label">{dueLabel(daysBetween(now, v.dueDate))}</span>
              <strong>{v.client}</strong>
              <small>
                {v.quantity}× {v.item}
              </small>
              <small className="strip-date">{display(v.dueDate)}</small>
            </button>
          ))}
        </div>
      ) : (
        <div className="stock-good">
          <CalendarCheck size={32} />
          <strong>Nenhuma validade nos próximos {ALERT_DAYS} dias</strong>
          <p>Os clientes aparecem aqui assim que o vencimento se aproximar.</p>
        </div>
      )}
    </section>
  );
}

/** Aparece enquanto o banco ainda não recebeu o database/upgrade.sql. */
export function ValidityUpgradeNotice() {
  return (
    <section className="panel upgrade-notice">
      <div className="empty">
        <Database size={38} strokeWidth={1.3} />
        <h3>Falta atualizar o banco de dados</h3>
        <p>
          O calendário de validades precisa da atualização{" "}
          <code>database/upgrade.sql</code>. No Supabase, abra o SQL Editor,
          execute o arquivo inteiro e recarregue esta página. Nenhum dado é
          apagado.
        </p>
      </div>
    </section>
  );
}
