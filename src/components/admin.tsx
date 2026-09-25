"use client";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import {
  Flame,
  LayoutDashboard,
  Users,
  ArrowLeft,
  ArrowRight,
  LogOut,
  Menu,
  ChevronRight,
  RefreshCw,
  Search,
  Wallet,
  UserCheck,
  TriangleAlert,
  Lock,
  LockOpen,
  CircleDollarSign,
  Pencil,
  Check,
  X,
  Info,
  ShieldCheck,
  ShieldUser,
  UserPlus,
  History,
} from "lucide-react";
import { daysBetween, money } from "@/lib/domain";
import {
  BILLING_ALERT_DAYS,
  billing,
  billingQueue,
  nextPaidUntil,
  summarizeAccounts,
  describeEvent,
  type AdminAccount,
  type AdminCommand,
  type AdminOverview,
  type Billing,
} from "@/lib/admin";
import { Empty, Metric, Modal, PanelHeading, problem } from "./primitives";
import { CountUp } from "./motion";
import { ActivityChart, StatusBreakdown, UsageBars } from "./admin-charts";

const nav = [
  { id: "overview", label: "Visão geral", icon: LayoutDashboard },
  { id: "accounts", label: "Contas", icon: Users },
] as const;
type View = (typeof nav)[number]["id"];
type Filter = "all" | "active" | "pending" | "overdue" | "suspended";
type DialogKind = "status" | "plan" | "payment";

const integer = (n: number) => String(Math.round(n));
const displayDate = (date: string) => date.split("-").reverse().join("/");
// Datas de Authentication chegam com horário em UTC; o painel conta dias no
// fuso dos registros.
const localDay = (timestamp: string) =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(timestamp));
const name = (a: AdminAccount) => a.company || a.email;
const initials = (a: AdminAccount) =>
  name(a).replace(/[^\p{L}\p{N}]/gu, "").slice(0, 2).toUpperCase() || "—";
// Data curta no ano corrente; com o ano quando é outro.
const shortDate = (date: string, today: string) =>
  date.slice(0, 4) === today.slice(0, 4)
    ? displayDate(date).slice(0, 5)
    : displayDate(date);
function lastAccess(timestamp: string | null, today: string) {
  if (!timestamp) return "Nunca entrou";
  const day = localDay(timestamp);
  const d = daysBetween(day, today);
  return d <= 0
    ? "Acesso hoje"
    : d === 1
      ? "Acesso ontem"
      : d < 30
        ? `Acesso há ${d} dias`
        : `Acesso em ${shortDate(day, today)}`;
}
function dueText(paidUntil: string | null, today: string) {
  if (!paidUntil) return "Sem vencimento";
  const d = daysBetween(today, paidUntil);
  return d === 0
    ? "Vence hoje"
    : d === 1
      ? "Vence amanhã"
      : d > 1
        ? `Vence em ${d} dias`
        : d === -1
          ? "Venceu ontem"
          : `Venceu há ${-d} dias`;
}
const badges: Record<Billing, { label: string; className: string }> = {
  current: { label: "Em dia", className: "success" },
  due: { label: "Em dia", className: "success" },
  untracked: { label: "Ativa", className: "success" },
  overdue: { label: "Em atraso", className: "warning" },
  suspended: { label: "Suspensa", className: "off" },
  pending: { label: "Aguardando ativação", className: "pending" },
};
// Data e hora do registro de ações, no fuso dos registros.
const moment = (timestamp: string) =>
  new Date(timestamp).toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
const stamp = () =>
  new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
// Falha de rede ou resposta perdida: a mensagem do navegador não ajuda.

export default function AdminPanel({
  initial,
  email,
}: {
  initial: AdminOverview;
  email: string;
}) {
  const [data, setData] = useState(initial);
  const [view, setView] = useState<View>("overview");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  // Guarda só o id: depois de salvar ou atualizar, a janela lê a conta atual.
  const [dialog, setDialog] = useState<{ kind: DialogKind; id: string } | null>(
    null,
  );
  const [saving, setSaving] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [synced, setSynced] = useState<string | null>(null);
  const [notice, setNotice] = useState<{
    message: string;
    error?: boolean;
  } | null>(null);
  const [mobileMenu, setMobileMenu] = useState(false);
  const busy = useRef(false);
  useEffect(() => {
    if (!notice || notice.error) return;
    const id = setTimeout(() => setNotice(null), 4500);
    return () => clearTimeout(id);
  }, [notice]);

  const { today, accounts, activity } = data;
  // Banco sem o registro de ações (upgrade antigo) não manda a lista.
  const events = data.events ?? [];
  const summary = useMemo(
    () => summarizeAccounts(accounts, today),
    [accounts, today],
  );
  const queue = useMemo(() => billingQueue(accounts, today), [accounts, today]);
  const operations30 = activity.reduce((sum, d) => sum + d.operations, 0);
  const mostActive = [...accounts]
    .filter((a) => a.operations30 > 0)
    .sort((a, b) => b.operations30 - a.operations30)
    .slice(0, 6)
    .map((a) => ({ id: a.id, label: name(a), value: a.operations30 }));
  const needle = query.trim().toLocaleLowerCase("pt-BR");
  const visible = accounts
    .filter((a) =>
      `${a.email} ${a.company}`.toLocaleLowerCase("pt-BR").includes(needle),
    )
    .filter((a) => {
      const b = billing(a, today);
      return filter === "all"
        ? true
        : filter === "active"
          ? b !== "suspended" && b !== "pending"
          : b === filter;
    })
    .sort((a, b) => name(a).localeCompare(name(b), "pt-BR"));
  const filters: { id: Filter; label: string; count: number }[] = [
    { id: "all", label: "Todas", count: summary.total },
    { id: "active", label: "Ativas", count: summary.active },
    // Só aparece quando há conta nova esperando.
    ...(summary.pending
      ? [{ id: "pending" as const, label: "Aguardando", count: summary.pending }]
      : []),
    { id: "overdue", label: "Em atraso", count: summary.overdue },
    { id: "suspended", label: "Suspensas", count: summary.suspended },
  ];
  const current = dialog && accounts.find((a) => a.id === dialog.id);

  function go(next: View) {
    setView(next);
    setMobileMenu(false);
  }
  function showAccounts(next: Filter) {
    setFilter(next);
    setQuery("");
    go("accounts");
  }
  function open(kind: DialogKind, account: AdminAccount) {
    if (!busy.current) setDialog({ kind, id: account.id });
  }
  async function load() {
    const response = await fetch("/api/admin", {
      cache: "no-store",
      signal: AbortSignal.timeout(20000),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error);
    setData(result);
    setSynced(stamp());
  }
  async function run(command: AdminCommand, message: string) {
    if (busy.current) throw new Error("Aguarde a operação em andamento.");
    busy.current = true;
    setSaving(true);
    try {
      const response = await fetch("/api/admin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ command }),
        signal: AbortSignal.timeout(20000),
      });
      const result = await response.json();
      if (!response.ok) {
        // Outra aba ou um pedido repetido já mudou a conta: mostra o estado
        // atual na própria janela antes de pedir a confirmação de novo.
        if (response.status === 409) await load().catch(() => undefined);
        throw new Error(result.error);
      }
      setData(result);
      setSynced(stamp());
      setDialog(null);
      setNotice({ message });
    } catch (e) {
      throw new Error(problem(e));
    } finally {
      busy.current = false;
      setSaving(false);
    }
  }
  async function refresh() {
    if (busy.current) return;
    setRefreshing(true);
    try {
      await load();
      setNotice({ message: "Dados atualizados." });
    } catch (e) {
      setNotice({ message: problem(e), error: true });
    } finally {
      setRefreshing(false);
    }
  }
  async function logout() {
    try {
      const r = await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "logout" }),
      });
      if (!r.ok) throw new Error();
      window.location.assign("/login");
    } catch {
      setNotice({
        message: "Não foi possível sair. Verifique a conexão e tente novamente.",
        error: true,
      });
    }
  }

  return (
    <div className="workspace">
      <a className="skip-link" href="#content">
        Pular para o conteúdo
      </a>
      {mobileMenu && (
        <button
          className="sidebar-scrim"
          aria-label="Fechar menu"
          onClick={() => setMobileMenu(false)}
        />
      )}
      <aside className={`sidebar ${mobileMenu ? "is-open" : ""}`}>
        <Link href="/admin" className="brand">
          <span className="brand-mark">
            <Flame strokeWidth={2} />
          </span>
          <span>
            ExtinPro<span className="brand-sub">ADMIN</span>
          </span>
        </Link>
        <div className="workspace-switch">
          <span className="store-avatar">
            <ShieldUser size={16} />
          </span>
          <span>
            <strong>Administração</strong>
            <small>{summary.total} contas</small>
          </span>
        </div>
        <span className="nav-label">PAINEL</span>
        <nav aria-label="Navegação da administração">
          {nav.map((n) => (
            <button
              key={n.id}
              className={view === n.id ? "active" : ""}
              onClick={() => go(n.id)}
              aria-current={view === n.id ? "page" : undefined}
            >
              <n.icon size={19} />
              {n.label}
              {n.id === "accounts" && (
                <span className="nav-count">{summary.total}</span>
              )}
              {n.id === "overview" && summary.overdue > 0 && (
                <span
                  className="nav-count alert"
                  aria-label={`${summary.overdue} cobranças em atraso`}
                >
                  {summary.overdue}
                </span>
              )}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="sidebar-note">
            <span className="note-icon">
              <ShieldCheck size={18} />
            </span>
            <strong>O acesso de cada cliente, sob seu controle.</strong>
            <p>
              Suspender bloqueia o sistema na hora. Os dados do cliente ficam
              guardados para a reativação.
            </p>
          </div>
          <Link className="settings-link" href="/app">
            <ArrowLeft size={19} />
            Voltar ao sistema
          </Link>
          <div className="user-card admin-user">
            <span className="user-avatar">AD</span>
            <span>
              <strong title={email}>{email}</strong>
              <small>Administrador</small>
            </span>
            <button
              className="icon-button"
              onClick={logout}
              disabled={saving}
              aria-label="Sair da conta"
            >
              <LogOut size={16} />
            </button>
          </div>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumb">
            <button
              className="icon-button mobile-only"
              aria-label="Abrir menu"
              onClick={() => setMobileMenu(true)}
            >
              <Menu />
            </button>
            <span>Administração</span>
            <ChevronRight size={14} />
            <strong>{nav.find((n) => n.id === view)?.label}</strong>
          </div>
          <div className="topbar-right">
            <span className="sync-state">
              <span className={`dot ${saving || refreshing ? "pending" : ""}`} />
              {saving
                ? "Salvando…"
                : refreshing
                  ? "Atualizando…"
                  : synced
                    ? `Atualizado às ${synced}`
                    : "Conectado ao Supabase"}
            </span>
            <button
              className="icon-button notification"
              aria-label={`${summary.overdue} cobranças em atraso`}
              title="Cobranças em atraso"
              onClick={() => showAccounts("overdue")}
            >
              <TriangleAlert size={19} />
              {summary.overdue > 0 && <i />}
            </button>
            <span className="user-avatar">AD</span>
          </div>
        </header>
        <main id="content" className="content page-swap" key={view}>
          <div className="page-heading">
            <div>
              <span className="eyebrow">EXTINPRO / ADMINISTRAÇÃO</span>
              <h1>
                <span>
                  {view === "overview"
                    ? "Seu sistema, em dia."
                    : "Contas e assinaturas"}
                </span>
              </h1>
              <p>
                {view === "overview"
                  ? "Assinaturas, cobranças e uso de todas as contas cadastradas."
                  : "Cada cliente, sua mensalidade e o acesso ao sistema."}
              </p>
            </div>
            <div className="heading-actions">
              <button
                className="secondary"
                onClick={refresh}
                disabled={saving || refreshing}
              >
                <RefreshCw size={16} className={refreshing ? "spin" : ""} />
                Atualizar
              </button>
            </div>
          </div>

          {view === "overview" && (
            <>
              {summary.pending > 0 && (
                <div className="billing-notice" role="status">
                  <UserPlus size={20} aria-hidden="true" />
                  <div>
                    <strong>
                      {summary.pending === 1
                        ? "1 conta nova aguardando ativação"
                        : `${summary.pending} contas novas aguardando ativação`}
                    </strong>
                    <p>
                      Contas novas só entram no sistema depois que você ativa.
                      Confira se são mesmo seus clientes antes de liberar.
                    </p>
                  </div>
                  <button onClick={() => showAccounts("pending")}>
                    Ver contas <ArrowRight size={16} />
                  </button>
                </div>
              )}
              <section className="metrics" aria-label="Indicadores das assinaturas">
                <Metric
                  index={1}
                  title="Receita mensal"
                  value={<CountUp value={summary.mrr} format={money} />}
                  detail={
                    summary.paying === 1
                      ? "1 conta pagante ativa"
                      : `${summary.paying} contas pagantes ativas`
                  }
                  icon={Wallet}
                  color="green"
                  highlight
                />
                <Metric
                  index={2}
                  title="Contas ativas"
                  value={<CountUp value={summary.active} format={integer} />}
                  detail={`de ${summary.total} cadastradas`}
                  icon={UserCheck}
                  color="blue"
                />
                <Metric
                  index={3}
                  title="Pagamentos em atraso"
                  value={<CountUp value={summary.overdue} format={integer} />}
                  detail={
                    summary.overdue
                      ? `${money(summary.overdueAmount)} por mês em aberto`
                      : "Nenhuma cobrança vencida"
                  }
                  icon={TriangleAlert}
                  color="orange"
                />
                <Metric
                  index={4}
                  title="Acessos suspensos"
                  value={<CountUp value={summary.suspended} format={integer} />}
                  detail="Contas sem acesso ao sistema"
                  icon={Lock}
                  color="red"
                />
              </section>
              <div className="overview-grid">
                <section className="panel chart-panel">
                  <PanelHeading
                    title="Uso do sistema"
                    subtitle="Operações registradas por dia, somando todas as contas"
                  />
                  <div className="chart-summary">
                    <strong>
                      <CountUp value={operations30} format={integer} />
                    </strong>
                    <span>operações nos últimos 30 dias</span>
                  </div>
                  <ActivityChart activity={activity} />
                </section>
                <section className="panel attention-panel">
                  <PanelHeading
                    title="Cobranças"
                    subtitle={`Vencidas ou vencendo em ${BILLING_ALERT_DAYS} dias`}
                    extra={<span className="count-badge">{queue.length}</span>}
                  />
                  {queue.length ? (
                    <div className="attention-list">
                      {queue.slice(0, 4).map((a) => (
                        <button key={a.id} onClick={() => open("payment", a)}>
                          <span className="account-avatar">{initials(a)}</span>
                          <span>
                            <strong>{name(a)}</strong>
                            <small className={`due-note ${billing(a, today)}`}>
                              {dueText(a.paidUntil, today)}
                            </small>
                          </span>
                          <span className="queue-amount">
                            {money(a.monthlyFee)}
                            <small>Registrar</small>
                          </span>
                        </button>
                      ))}
                    </div>
                  ) : (
                    <div className="stock-good">
                      <ShieldCheck size={35} />
                      <strong>Cobranças em dia</strong>
                      <p>
                        Nenhuma mensalidade vencida ou vencendo nos próximos{" "}
                        {BILLING_ALERT_DAYS} dias.
                      </p>
                    </div>
                  )}
                  <button
                    className="attention-footer"
                    onClick={() => showAccounts(queue.length ? "overdue" : "all")}
                  >
                    Gerenciar contas <ArrowRight size={15} />
                  </button>
                </section>
              </div>
              <div className="admin-grid">
                <section className="panel">
                  <PanelHeading
                    title="Situação das assinaturas"
                    subtitle="Todas as contas cadastradas"
                  />
                  <StatusBreakdown
                    total={summary.total}
                    segments={[
                      {
                        key: "current",
                        label: "Em dia",
                        count: summary.current,
                        color: "var(--series-green)",
                      },
                      {
                        key: "overdue",
                        label: "Em atraso",
                        count: summary.overdue,
                        color: "var(--amber)",
                      },
                      {
                        key: "pending",
                        label: "Aguardando ativação",
                        count: summary.pending,
                        color: "var(--steel)",
                      },
                      {
                        key: "suspended",
                        label: "Suspensas",
                        count: summary.suspended,
                        color: "var(--ink-2)",
                      },
                    ]}
                  />
                  {summary.untracked > 0 && (
                    <p className="admin-note">
                      <Info size={15} />
                      {summary.untracked === 1
                        ? "1 conta ativa ainda sem vencimento. Edite a assinatura para acompanhar a cobrança."
                        : `${summary.untracked} contas ativas ainda sem vencimento. Edite a assinatura para acompanhar a cobrança.`}
                    </p>
                  )}
                </section>
                <section className="panel">
                  <PanelHeading
                    title="Contas mais ativas"
                    subtitle="Operações registradas nos últimos 30 dias"
                  />
                  {mostActive.length ? (
                    <UsageBars rows={mostActive} />
                  ) : (
                    <Empty
                      title="Sem operações no período"
                      description="As contas aparecem aqui assim que registrarem produtos, vendas ou despesas."
                    />
                  )}
                  {summary.idle > 0 && (
                    <p className="admin-note">
                      <Info size={15} />
                      {summary.idle === 1
                        ? "1 conta ativa sem nenhuma operação em 30 dias."
                        : `${summary.idle} contas ativas sem nenhuma operação em 30 dias.`}
                    </p>
                  )}
                </section>
              </div>
              <section className="panel audit-panel">
                <PanelHeading
                  title="Registro de ações"
                  subtitle="Quem ativou, suspendeu, editou ou registrou pagamento, e quando"
                />
                {events.length ? (
                  <ol className="audit-list">
                    {events.map((e) => (
                      <li key={e.id}>
                        <time dateTime={e.createdAt}>{moment(e.createdAt)}</time>
                        <span>
                          <strong>{e.admin || "Administrador removido"}</strong>{" "}
                          {describeEvent(e)}
                        </span>
                      </li>
                    ))}
                  </ol>
                ) : (
                  <Empty
                    title="Nenhuma ação registrada"
                    description="Ativações, suspensões, assinaturas e pagamentos aparecem aqui."
                  />
                )}
              </section>
            </>
          )}

          {view === "accounts" && (
            <>
              <p className="info-line">
                <Info size={16} />
                Para cadastrar um cliente, crie o usuário com e-mail e senha em
                Authentication → Users no Supabase. Ele aparece aqui aguardando
                ativação e só entra no sistema depois que você clicar em Ativar.
              </p>
              <section className="panel">
                <div className="stock-toolbar admin-toolbar">
                  <div className="search-field">
                    <Search size={17} />
                    <input
                      aria-label="Buscar conta"
                      placeholder="Buscar por e-mail ou empresa…"
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                    />
                  </div>
                  <div className="chips" role="group" aria-label="Filtrar contas">
                    {filters.map((f) => (
                      <button
                        key={f.id}
                        className={filter === f.id ? "selected" : ""}
                        aria-pressed={filter === f.id}
                        onClick={() => setFilter(f.id)}
                      >
                        {f.label} · {f.count}
                      </button>
                    ))}
                  </div>
                  <span className="muted">
                    {visible.length === 1 ? "1 conta" : `${visible.length} contas`}
                  </span>
                </div>
                {visible.length ? (
                  <div className="table-scroll">
                    <table className="accounts-table">
                      <thead>
                        <tr>
                          <th>Conta</th>
                          <th>Situação</th>
                          <th>Cobrança</th>
                          <th>Uso · 30 dias</th>
                          <th>
                            <span className="sr-only">Ações</span>
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {visible.map((a) => {
                          const b = billing(a, today);
                          return (
                            <tr
                              key={a.id}
                              className={b === "suspended" ? "is-suspended" : ""}
                            >
                              <td>
                                <div className="product-name">
                                  <span className="account-avatar">
                                    {initials(a)}
                                  </span>
                                  <span title={a.company ? `${a.company} · ${a.email}` : a.email}>
                                    <strong>
                                      {name(a)}
                                      {a.admin && (
                                        <span className="admin-tag">Admin</span>
                                      )}
                                    </strong>
                                    <small>
                                      {a.company ? a.email : "Empresa não cadastrada"}
                                    </small>
                                  </span>
                                </div>
                              </td>
                              <td>
                                <span className={`badge ${badges[b].className}`}>
                                  {badges[b].label}
                                </span>
                              </td>
                              <td>
                                {a.monthlyFee ? (
                                  <strong>{money(a.monthlyFee)}</strong>
                                ) : (
                                  <span className="muted">Sem mensalidade</span>
                                )}
                                <small className={`due-note ${b}`}>
                                  {dueText(a.paidUntil, today)}
                                  {a.paidUntil && ` · ${shortDate(a.paidUntil, today)}`}
                                </small>
                              </td>
                              <td>
                                <strong>{a.operations30}</strong>{" "}
                                <span className="muted">
                                  {a.operations30 === 1 ? "operação" : "operações"}
                                </span>
                                <small>{lastAccess(a.lastSignInAt, today)}</small>
                              </td>
                              <td>
                                <div className="row-actions">
                                  <button
                                    className="icon-button"
                                    onClick={() => open("payment", a)}
                                    aria-label={`Registrar pagamento de ${name(a)}`}
                                    title="Registrar pagamento"
                                  >
                                    <CircleDollarSign size={16} />
                                  </button>
                                  <button
                                    className="icon-button"
                                    onClick={() => open("plan", a)}
                                    aria-label={`Editar assinatura de ${name(a)}`}
                                    title="Editar assinatura"
                                  >
                                    <Pencil size={15} />
                                  </button>
                                  {a.status !== "active" ? (
                                    <button
                                      className={`row-toggle ${a.status === "pending" ? "activate" : ""}`}
                                      onClick={() => open("status", a)}
                                      aria-label={`${a.status === "pending" ? "Ativar" : "Reativar"} acesso de ${name(a)}`}
                                    >
                                      <LockOpen size={14} />
                                      {a.status === "pending" ? "Ativar" : "Reativar"}
                                    </button>
                                  ) : (
                                    <button
                                      className="row-toggle suspend"
                                      onClick={() => open("status", a)}
                                      disabled={a.admin}
                                      aria-label={`Suspender acesso de ${name(a)}`}
                                      title={
                                        a.admin
                                          ? "Contas de administrador não podem ser suspensas"
                                          : undefined
                                      }
                                    >
                                      <Lock size={14} />
                                      Suspender
                                    </button>
                                  )}
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <Empty
                    title="Nenhuma conta encontrada"
                    description={
                      accounts.length
                        ? "Tente outro e-mail, empresa ou filtro."
                        : "Crie o primeiro usuário em Authentication → Users no Supabase."
                    }
                  />
                )}
              </section>
            </>
          )}
          <footer className="page-footer">
            <span>
              ExtinPro <i /> Administração do sistema
            </span>
            <span>Dados de {displayDate(today)}</span>
          </footer>
        </main>
      </div>
      {dialog && current && (
        <AccountDialog
          key={`${dialog.kind}-${current.id}`}
          kind={dialog.kind}
          account={current}
          today={today}
          saving={saving}
          close={() => setDialog(null)}
          run={run}
        />
      )}
      {notice && (
        <div
          role={notice.error ? "alert" : "status"}
          className={`toast ${notice.error ? "error" : ""}`}
        >
          {notice.error ? <TriangleAlert size={18} /> : <Check size={18} />}
          <span>{notice.message}</span>
          <button
            className="icon-button"
            aria-label="Fechar aviso"
            onClick={() => setNotice(null)}
          >
            <X size={16} />
          </button>
        </div>
      )}
    </div>
  );
}

function AccountDialog({
  kind,
  account,
  today,
  saving,
  close,
  run,
}: {
  kind: DialogKind;
  account: AdminAccount;
  today: string;
  saving: boolean;
  close: () => void;
  run: (command: AdminCommand, message: string) => Promise<void>;
}) {
  const [error, setError] = useState("");
  const [reactivate, setReactivate] = useState(true);
  const suspend = account.status === "active";
  const pending = account.status === "pending";
  const next = nextPaidUntil(account.paidUntil, today);
  const who = name(account);
  const statusAction = suspend
    ? "Suspender acesso"
    : pending
      ? "Ativar acesso"
      : "Reativar acesso";
  const title =
    kind === "payment"
      ? "Registrar pagamento"
      : kind === "plan"
        ? "Assinatura"
        : statusAction;
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (saving) return;
    setError("");
    let command: AdminCommand;
    let message: string;
    if (kind === "status") {
      command = {
        kind: "status",
        accountId: account.id,
        status: suspend ? "suspended" : "active",
      };
      message = suspend
        ? `Acesso de ${who} suspenso.`
        : pending
          ? `Conta de ${who} ativada.`
          : `Acesso de ${who} reativado.`;
    } else if (kind === "payment") {
      const back = account.status !== "active" && reactivate;
      command = {
        kind: "payment",
        accountId: account.id,
        paidUntil: account.paidUntil,
        reactivate: back,
      };
      message = `Pagamento registrado. Próximo vencimento: ${displayDate(next)}.${back ? " Acesso reativado." : ""}`;
    } else {
      const f = new FormData(e.currentTarget);
      const fee = Math.round(Number(String(f.get("fee") ?? "")) * 100);
      if (!Number.isFinite(fee) || fee < 0 || fee > 100_000_000) {
        setError("Informe uma mensalidade entre R$ 0,00 e R$ 1.000.000,00.");
        return;
      }
      command = {
        kind: "plan",
        accountId: account.id,
        monthlyFee: fee,
        paidUntil: String(f.get("paidUntil") ?? "") || null,
        notes: String(f.get("notes") ?? "").trim(),
      };
      message = `Assinatura de ${who} atualizada.`;
    }
    try {
      await run(command, message);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível salvar.");
    }
  }
  return (
    <Modal
      title={title}
      subtitle={account.company ? `${who} · ${account.email}` : who}
      close={close}
      busy={saving}
    >
      <form className="admin-dialog" onSubmit={submit}>
        <fieldset disabled={saving}>
          {kind === "status" &&
            (suspend ? (
              <p className="hint">
                <Lock size={16} />
                <span>
                  Ao confirmar, <strong>{who}</strong> perde o acesso na hora: o
                  painel passa a mostrar o aviso de acesso suspenso e nenhuma
                  operação nova é registrada. Os dados ficam guardados e voltam
                  ao reativar.
                </span>
              </p>
            ) : pending ? (
              <p className="hint">
                <LockOpen size={16} />
                <span>
                  <strong>{account.email}</strong> passa a entrar no sistema.
                  Ative só contas que você mesmo criou para um cliente. Depois,
                  informe a mensalidade e o vencimento em Editar assinatura.
                </span>
              </p>
            ) : (
              <p className="hint">
                <LockOpen size={16} />
                <span>
                  A conta volta a abrir o sistema imediatamente, com todos os
                  dados. Se recebeu o pagamento, registre-o também para
                  atualizar o vencimento.
                </span>
              </p>
            ))}
          {kind === "payment" && (
            <>
              <div className="form-total">
                <span>Mensalidade</span>
                <strong>{money(account.monthlyFee)}</strong>
              </div>
              <div className="payment-dates">
                <div>
                  <span>Vencimento atual</span>
                  <strong>
                    {account.paidUntil
                      ? displayDate(account.paidUntil)
                      : "Não definido"}
                  </strong>
                </div>
                <ArrowRight size={18} aria-hidden="true" />
                <div>
                  <span>Novo vencimento</span>
                  <strong>{displayDate(next)}</strong>
                </div>
              </div>
              {account.status !== "active" && (
                <label className="check">
                  <input
                    type="checkbox"
                    checked={reactivate}
                    onChange={(e) => setReactivate(e.target.checked)}
                  />
                  <span>
                    <strong>{pending ? "Ativar o acesso agora" : "Reativar o acesso agora"}</strong>
                    {pending
                      ? "Esta conta ainda não foi ativada."
                      : "Esta conta está suspensa."}{" "}
                    Desmarque para só registrar o pagamento.
                  </span>
                </label>
              )}
              <p className="hint">
                <Info size={16} />
                <span>
                  O vencimento avança um mês
                  {account.paidUntil ? " a partir do vencimento atual" : " a partir de hoje"}
                  . Para outro período ou valor, edite a assinatura.
                </span>
              </p>
            </>
          )}
          {kind === "plan" && (
            <>
              <div className="form-grid">
                <label>
                  Mensalidade (R$)
                  <input
                    name="fee"
                    type="number"
                    defaultValue={(account.monthlyFee / 100).toFixed(2)}
                    min="0"
                    max="1000000"
                    step="0.01"
                    required
                  />
                </label>
                <label>
                  Pago até (vencimento)
                  <input
                    name="paidUntil"
                    type="date"
                    defaultValue={account.paidUntil ?? ""}
                    min="2000-01-01"
                    max="2100-12-31"
                  />
                </label>
              </div>
              <label>
                Observações <span className="optional">(opcional)</span>
                <textarea
                  name="notes"
                  rows={3}
                  maxLength={1000}
                  defaultValue={account.notes}
                  placeholder="Plano, forma de pagamento, contato do responsável…"
                />
              </label>
              <p className="dialog-meta">
                {account.lastPaymentOn
                  ? `Último pagamento registrado em ${displayDate(account.lastPaymentOn)}.`
                  : "Nenhum pagamento registrado ainda."}{" "}
                Cliente desde {displayDate(localDay(account.createdAt))}, com{" "}
                {account.products} produtos e {account.sales} vendas registrados.
              </p>
            </>
          )}
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <div className="form-actions">
            <button type="button" onClick={close}>
              Cancelar
            </button>
            <button className="primary" type="submit">
              {saving
                ? "Salvando…"
                : kind === "payment"
                  ? "Confirmar pagamento"
                  : kind === "plan"
                    ? "Salvar assinatura"
                    : statusAction}
            </button>
          </div>
        </fieldset>
      </form>
    </Modal>
  );
}
