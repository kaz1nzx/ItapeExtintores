"use client";
import { useState, useMemo, useRef, useEffect, type ReactNode } from "react";
import Link from "next/link";
import {
  Flame,
  LayoutDashboard,
  Boxes,
  ArrowLeftRight,
  Wallet,
  FileChartColumn,
  Settings2,
  ChevronRight,
  ChevronLeft,
  Plus,
  ArrowUpRight,
  ArrowDownLeft,
  Download,
  Search,
  Bell,
  LogOut,
  CalendarDays,
  TrendingUp,
  CircleDollarSign,
  TriangleAlert,
  RefreshCw,
  Printer,
  Check,
  X,
  Menu,
  Pencil,
  Archive,
  ShieldCheck,
  Database,
  ArrowRight,
  CalendarClock,
} from "lucide-react";
import {
  applyCommand,
  type Command,
  type Product,
  type Store,
  type User,
  type Validity,
  ALERT_DAYS,
  money,
  summarize,
  today,
  daysBefore,
  daysBetween,
  withDefaults,
} from "@/lib/domain";
import OperationForm, { type FormMode } from "./operation-form";
import { Empty, Extinguisher, download } from "./primitives";
import { CountUp, Reveal } from "./motion";
import Chart from "./chart";
import ValidityPage, {
  ValidityStrip,
  ValidityUpgradeNotice,
} from "./validity";

const nav = [
  { id: "overview", label: "Visão geral", icon: LayoutDashboard },
  { id: "stock", label: "Estoque", icon: Boxes },
  { id: "movements", label: "Movimentações", icon: ArrowLeftRight },
  { id: "validity", label: "Validades", icon: CalendarClock },
  { id: "finance", label: "Financeiro", icon: Wallet },
  { id: "reports", label: "Relatórios", icon: FileChartColumn },
  { id: "settings", label: "Configurações", icon: Settings2 },
] as const;
type Page = (typeof nav)[number]["id"];
const subtitles: Record<Page, string> = {
  overview: "Uma visão clara de tudo que movimenta o seu negócio.",
  stock: "Cada produto no lugar certo. Cada unidade sob controle.",
  movements: "Acompanhe as entradas e saídas da sua operação.",
  validity: "Cada extintor vendido, com a data certa para voltar ao cliente.",
  finance: "Entenda seus custos e acompanhe seus resultados.",
  reports: "Os números que ajudam a decidir o próximo passo.",
  settings: "Sua conta, seus dados e suas preferências.",
};
const displayDate = (date: string) => date.split("-").reverse().join("/");
// Formatadores estáveis para o contador animado (CountUp recebe a função pronta).
const integer = (n: number) => String(Math.round(n));
const units = (n: number) => `${Math.round(n)} un.`;
const signed = (n: number) =>
  `${Math.round(n) > 0 ? "+" : ""}${Math.round(n)}`;
export default function Workspace({
  initial,
  user,
  demo = false,
}: {
  initial: Store;
  user: User;
  demo?: boolean;
}) {
  const [store, setStore] = useState(() => withDefaults(initial));
  // Um banco sem database/upgrade.sql não devolve a lista de validades. Nesse
  // caso o calendário fica guardado e a venda não promete um lembrete que o
  // banco não teria como gravar.
  const [ready, setReady] = useState(() => Array.isArray(initial.validities));
  function receive(data: Store) {
    setReady(Array.isArray(data.validities));
    setStore(withDefaults(data));
  }
  const [page, setPage] = useState<Page>("overview");
  const [period, setPeriod] = useState<"week" | "month">("month");
  const [anchor, setAnchor] = useState(today());
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const [movementKind, setMovementKind] = useState("all");
  const [tablePage, setTablePage] = useState(0);
  const [form, setForm] = useState<{
    mode: FormMode;
    product?: Product;
    validity?: Validity;
  } | null>(null);
  const [notice, setNotice] = useState<{
    message: string;
    error?: boolean;
  } | null>(null);
  const [saving, setSaving] = useState(false);
  const [mobileMenu, setMobileMenu] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [synced, setSynced] = useState<string | null>(null);
  const busy = useRef(false);
  useEffect(() => {
    if (!notice || notice.error) return;
    const id = setTimeout(() => setNotice(null), 4500);
    return () => clearTimeout(id);
  }, [notice]);
  const to =
    period === "week"
      ? anchor
      : [
          new Date(
            Number(anchor.slice(0, 4)),
            Number(anchor.slice(5, 7)),
            0,
            12,
          )
            .toISOString()
            .slice(0, 10),
          today(),
        ].sort()[0];
  const from =
    period === "week" ? daysBefore(anchor, 6) : `${anchor.slice(0, 7)}-01`;
  const stats = useMemo(() => summarize(store, from, to), [store, from, to]);
  const products = store.products.filter((p) => p.active);
  const low = products.filter((p) => p.stock <= p.minimum);
  // Clientes a contatar: vencidos ou vencendo dentro da janela de aviso.
  const dueSoon = store.validities.filter(
    (v) => v.status === "pending" && daysBetween(today(), v.dueDate) <= ALERT_DAYS,
  );
  const stockUnits = products.reduce((a, p) => a + p.stock, 0);
  const stockValue = products.reduce((a, p) => a + p.stock * p.cost, 0);
  const filteredProducts = products.filter(
    (p) =>
      `${p.name} ${p.sku} ${p.type} ${p.capacity}`
        .toLocaleLowerCase("pt-BR")
        .includes(query.toLocaleLowerCase("pt-BR")) &&
      (filter === "all" ||
        (filter === "low" ? p.stock <= p.minimum : p.type === filter)),
  );
  const movements = [...store.movements]
    .filter(
      (m) =>
        m.date >= from &&
        m.date <= to &&
        (movementKind === "all" || m.kind === movementKind),
    )
    .reverse();
  function go(next: Page) {
    setPage(next);
    setTablePage(0);
    setMobileMenu(false);
  }
  function open(mode: FormMode, product?: Product, validity?: Validity) {
    if (busy.current) return;
    setForm({ mode, product, validity });
  }
  async function save(command: Command, requestId: string) {
    if (busy.current) throw new Error("Aguarde a operação em andamento.");
    const before = store;
    let recovery: Store | undefined;
    const optimistic = applyCommand(before, command, user, requestId);
    busy.current = true;
    setSaving(true);
    setStore(optimistic);
    try {
      if (!demo) {
        const response = await fetch("/api/store", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ command, requestId, version: before.version }),
          signal: AbortSignal.timeout(20000),
        });
        const result = await response.json();
        if (!response.ok) {
          if (response.status === 409) {
            const refreshed = await fetch("/api/store", { cache: "no-store" });
            if (refreshed.ok) recovery = await refreshed.json();
          }
          throw new Error(result.error);
        }
        receive(result);
        setSynced(
          new Date().toLocaleTimeString("pt-BR", {
            hour: "2-digit",
            minute: "2-digit",
          }),
        );
      }
      setNotice({
        message: demo
          ? "Registro atualizado na demonstração."
          : "Registro salvo com sucesso.",
      });
    } catch (e) {
      if (recovery) receive(recovery);
      else setStore(before);
      // A lost response can mean the database committed. Repeating the same
      // requestId is safe: the database records and deduplicates every command.
      if (
        !(e instanceof Error) ||
        e.name === "TimeoutError" ||
        e instanceof TypeError ||
        e instanceof SyntaxError
      ) {
        throw new Error(
          "Sem confirmação do servidor. Verifique a conexão e tente salvar novamente; a operação não será duplicada.",
        );
      }
      throw e;
    } finally {
      busy.current = false;
      setSaving(false);
    }
  }
  async function refresh() {
    if (busy.current || demo) return;
    setRefreshing(true);
    try {
      const res = await fetch("/api/store", {
        cache: "no-store",
        signal: AbortSignal.timeout(20000),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      receive(data);
      setSynced(
        new Date().toLocaleTimeString("pt-BR", {
          hour: "2-digit",
          minute: "2-digit",
        }),
      );
      setNotice({ message: "Dados atualizados." });
    } catch (e) {
      setNotice({
        message: e instanceof Error ? e.message : "Não foi possível atualizar.",
        error: true,
      });
    } finally {
      setRefreshing(false);
    }
  }
  async function logout() {
    if (demo) {
      window.location.assign("/login");
      return;
    }
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
        message:
          "Não foi possível sair. Verifique a conexão e tente novamente.",
        error: true,
      });
    }
  }
  const productTable = (items: Product[], compact = false) =>
    items.length ? (
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Produto</th>
              <th>Custo unitário</th>
              <th>Preço de venda</th>
              <th>Estoque</th>
              <th>Situação</th>
              {!compact && (
                <th>
                  <span className="sr-only">Ações</span>
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {items.map((p) => (
              <tr key={p.id}>
                <td>
                  <div className="product-name">
                    <Extinguisher type={p.type} />
                    <span>
                      <strong>
                        {p.name} <span className="capacity">{p.capacity}</span>
                      </strong>
                      <small>
                        {p.sku} · {p.type}
                      </small>
                    </span>
                  </div>
                </td>
                <td>{money(p.cost)}</td>
                <td className="strong">{money(p.price)}</td>
                <td>
                  <strong>{p.stock}</strong> <span className="muted">un.</span>
                  <span className="stock-track">
                    <i
                      style={{
                        width: `${Math.min(100, (p.stock / Math.max(1, p.minimum * 4)) * 100)}%`,
                        background:
                          p.stock <= p.minimum ? "#df9c36" : "#329887",
                      }}
                    />
                  </span>
                </td>
                <td>
                  <span
                    className={`badge ${p.stock <= p.minimum ? "warning" : "success"}`}
                  >
                    {p.stock === 0
                      ? "Sem estoque"
                      : p.stock <= p.minimum
                        ? "Estoque baixo"
                        : "Em estoque"}
                  </span>
                </td>
                {!compact && (
                  <td>
                    <div className="row-actions">
                      <button
                        className="icon-button"
                        onClick={() => open("purchase", p)}
                        aria-label={`Adicionar estoque ${p.sku}`}
                        title="Entrada de estoque"
                      >
                        <Plus size={16} />
                      </button>
                      <button
                        className="icon-button"
                        onClick={() => open("product", p)}
                        aria-label={`Editar ${p.sku}`}
                        title="Editar produto"
                      >
                        <Pencil size={15} />
                      </button>
                      {p.stock === 0 && (
                        <button
                          className="icon-button"
                          onClick={() => open("archive", p)}
                          aria-label={`Arquivar ${p.sku}`}
                        >
                          <Archive size={15} />
                        </button>
                      )}
                    </div>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    ) : (
      <Empty
        title="Nenhum produto encontrado"
        description={
          products.length
            ? "Tente outro nome, código ou filtro."
            : "Cadastre seu primeiro extintor para começar o controle."
        }
      >
        {!products.length && (
          <button onClick={() => open("product")}>
            <Plus size={16} />
            Cadastrar produto
          </button>
        )}
      </Empty>
    );
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
        <Link href={demo ? "/demo" : "/app"} className="brand">
          <span className="brand-mark">
            <Flame strokeWidth={2} />
          </span>
          <span>
            itapê<span className="brand-sub">EXTINTORES</span>
          </span>
        </Link>
        <div className="workspace-switch">
          <span className="store-avatar">IE</span>
          <span>
            <strong>Itapê Extintores</strong>
            <small>Central de gestão</small>
          </span>
          <ChevronRight size={15} />
        </div>
        <span className="nav-label">PRINCIPAL</span>
        <nav aria-label="Navegação principal">
          {nav
            .filter((n) => n.id !== "settings")
            .map((n) => (
              <button
                key={n.id}
                className={page === n.id ? "active" : ""}
                onClick={() => go(n.id)}
                aria-current={page === n.id ? "page" : undefined}
              >
                <n.icon size={19} />
                {n.label}
                {n.id === "stock" && (
                  <span className="nav-count">{products.length}</span>
                )}
                {n.id === "validity" && dueSoon.length > 0 && (
                  <span
                    className="nav-count alert"
                    aria-label={`${dueSoon.length} para contatar`}
                  >
                    {dueSoon.length}
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
            <strong>
              Controle que traz
              <br />
              tranquilidade.
            </strong>
            <p>
              Seu negócio organizado,
              <br />
              do estoque ao resultado.
            </p>
          </div>
          <button
            className={`settings-link ${page === "settings" ? "active" : ""}`}
            onClick={() => go("settings")}
          >
            <Settings2 size={19} />
            Configurações
          </button>
          <div className="user-card">
            <span className="user-avatar">AD</span>
            <span>
              <strong>Administrador</strong>
              <small>{demo ? "Modo demonstração" : "Minha conta"}</small>
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
            <span>Área de gestão</span>
            <ChevronRight size={14} />
            <strong>{nav.find((n) => n.id === page)?.label}</strong>
          </div>
          <div className="topbar-right">
            <span className="sync-state">
              <span className={`dot ${saving ? "pending" : ""}`} />
              {demo
                ? "Demonstração"
                : saving
                  ? "Salvando…"
                  : synced
                    ? `Atualizado às ${synced}`
                    : "Conectado ao Supabase"}
            </span>
            <button
              className="icon-button notification"
              aria-label={`${low.length} produtos com estoque baixo`}
              onClick={() => {
                setFilter("low");
                setQuery("");
                go("stock");
              }}
            >
              <Bell size={19} />
              {low.length > 0 && <i />}
            </button>
            <button
              className="icon-button notification"
              aria-label={`${dueSoon.length} validades de clientes a vencer`}
              title="Validades a vencer"
              onClick={() => go("validity")}
            >
              <CalendarClock size={19} />
              {dueSoon.length > 0 && <i />}
            </button>
            <span className="user-avatar">AD</span>
          </div>
        </header>
        {/* key={page} remonta o bloco: o título recorta e os números recontam
            a cada troca de seção. */}
        <main id="content" className="content page-swap" key={page}>
          {demo && (
            <div className="demo-banner">
              <span>
                <strong>Modo demonstração</strong> · Dados fictícios. As
                alterações são descartadas ao recarregar.
              </span>
              <Link href="/login">
                Acessar minha conta <ArrowRight size={14} />
              </Link>
            </div>
          )}
          <div className="page-heading">
            <div>
              <span className="eyebrow">ITAPÊ EXTINTORES / GESTÃO</span>
              <h1>
                <span>
                  {page === "overview"
                    ? "Seu negócio, em dia."
                    : nav.find((n) => n.id === page)?.label}
                </span>
              </h1>
              <p>{subtitles[page]}</p>
            </div>
            <div className="heading-actions">
              {page === "stock" && (
                <button
                  className="secondary"
                  onClick={() => open("purchase")}
                  disabled={saving}
                >
                  <Plus size={16} />
                  Entrada de estoque
                </button>
              )}
              {page !== "settings" && (page !== "validity" || ready) && (
                <button
                  className="primary"
                  onClick={() =>
                    open(
                      page === "stock"
                        ? "product"
                        : page === "finance"
                          ? "expense"
                          : page === "validity"
                            ? "validity"
                            : "sale",
                    )
                  }
                  disabled={saving}
                >
                  <Plus size={17} />
                  {page === "stock"
                    ? "Novo produto"
                    : page === "finance"
                      ? "Nova despesa"
                      : page === "validity"
                        ? "Registrar validade"
                        : "Nova venda"}
                </button>
              )}
            </div>
          </div>
          {page !== "stock" && page !== "settings" && page !== "validity" && (
            <div className="period-bar">
              <div className="segmented" data-active={period}>
                {/* Indicador que desliza entre as opções em vez de piscar. */}
                <span className="segmented-thumb" aria-hidden="true" />
                <button
                  className={period === "week" ? "selected" : ""}
                  onClick={() => {
                    setPeriod("week");
                    setTablePage(0);
                  }}
                >
                  Semanal
                </button>
                <button
                  className={period === "month" ? "selected" : ""}
                  onClick={() => {
                    setPeriod("month");
                    setTablePage(0);
                  }}
                >
                  Mensal
                </button>
              </div>
              <div className="period-date">
                <CalendarDays size={15} />
                <label>
                  <span className="sr-only">
                    {period === "week"
                      ? "Data final da semana"
                      : "Mês do relatório"}
                  </span>
                  <input
                    type={period === "week" ? "date" : "month"}
                    value={period === "week" ? anchor : anchor.slice(0, 7)}
                    min={period === "week" ? "2000-01-07" : "2000-01"}
                    max={period === "week" ? today() : today().slice(0, 7)}
                    onChange={(e) => {
                      if (e.target.value && e.target.validity.valid) {
                        setAnchor(
                          period === "week"
                            ? e.target.value
                            : `${e.target.value}-01`,
                        );
                        setTablePage(0);
                      }
                    }}
                  />
                </label>
                <span>
                  {displayDate(from)} — {displayDate(to)}
                </span>
              </div>
              {!demo && (
                <button
                  className="refresh-button"
                  disabled={saving || refreshing}
                  onClick={refresh}
                >
                  <RefreshCw size={14} className={refreshing ? "spin" : ""} />
                  Atualizar
                </button>
              )}
            </div>
          )}
          {(page === "overview" ||
            page === "finance" ||
            page === "reports") && (
            <section className="metrics" aria-label="Indicadores do período">
              <Metric
                index={1}
                title="Custos e despesas"
                value={
                  <CountUp
                    value={stats.cogs + stats.expenses + stats.taxes}
                    format={money}
                  />
                }
                detail="Itens vendidos, despesas e impostos"
                icon={ArrowDownLeft}
                color="orange"
              />
              <Metric
                index={2}
                title="Receita de vendas"
                value={<CountUp value={stats.revenue} format={money} />}
                detail={`${stats.sales.length} vendas no período`}
                icon={CircleDollarSign}
                color="red"
              />
              <Metric
                index={3}
                title="Resultado estimado"
                value={<CountUp value={stats.profit} format={money} />}
                detail={`${stats.revenue ? ((stats.profit / stats.revenue) * 100).toFixed(1).replace(".", ",") : "0"}% de margem no período`}
                icon={TrendingUp}
                color="green"
                highlight
              />
              <Metric
                index={4}
                title={
                  page === "overview"
                    ? "Produtos em estoque"
                    : "Compras de estoque"
                }
                value={
                  page === "overview" ? (
                    <CountUp value={stockUnits} format={units} />
                  ) : (
                    <CountUp value={stats.purchases} format={money} />
                  )
                }
                detail={
                  page === "overview"
                    ? `${products.length} produtos · ${money(stockValue)} em custo`
                    : "Entradas de mercadorias no período"
                }
                icon={Boxes}
                color="blue"
              />
            </section>
          )}
          {page === "overview" && (
            <>
              {ready && (
                <ValidityStrip
                  validities={store.validities}
                  onOpen={() => go("validity")}
                />
              )}
              <div className="overview-grid">
                <section className="panel chart-panel">
                  <PanelHeading
                    title="Evolução financeira"
                    subtitle="Receita e resultado ao longo do período"
                  />
                  <div className="chart-summary">
                    <strong>
                      <CountUp value={stats.revenue} format={money} />
                    </strong>
                    <span>em vendas no período</span>
                  </div>
                  <Chart store={store} from={from} to={to} />
                </section>
                <section className="panel attention-panel">
                  <PanelHeading
                    title="Atenção ao estoque"
                    subtitle="Antecipe a próxima reposição"
                    extra={<span className="count-badge">{low.length}</span>}
                  />
                  {low.length ? (
                    <div className="attention-list">
                      {low.slice(0, 3).map((p) => (
                        <button key={p.id} onClick={() => open("purchase", p)}>
                          <Extinguisher type={p.type} />
                          <span>
                            <strong>{p.name}</strong>
                            <small>
                              {p.capacity} · mínimo {p.minimum} un.
                            </small>
                          </span>
                          <span className="low-count">
                            {p.stock}
                            <small>unidades</small>
                          </span>
                        </button>
                      ))}
                    </div>
                  ) : (
                    <div className="stock-good">
                      <ShieldCheck size={35} />
                      <strong>Estoque em equilíbrio</strong>
                      <p>Nenhum produto abaixo do mínimo.</p>
                    </div>
                  )}
                  <button
                    className="attention-footer"
                    onClick={() => {
                      setFilter("low");
                      setQuery("");
                      go("stock");
                    }}
                  >
                    Gerenciar estoque <ArrowRight size={15} />
                  </button>
                </section>
              </div>
              <Reveal>
              <section className="panel inventory-overview">
                <PanelHeading
                  title="Seu estoque de extintores"
                  subtitle="Disponibilidade e valores, sempre à vista"
                  extra={
                    <button
                      className="text-button"
                      onClick={() => {
                        setFilter("all");
                        go("stock");
                      }}
                    >
                      Ver todos os produtos <ArrowUpRight size={15} />
                    </button>
                  }
                />
                {productTable(products.slice(0, 5), true)}
              </section>
              </Reveal>
              <Reveal delay={90}>
              <section className="quick-strip">
                <span className="quick-icon">
                  <Flame size={23} />
                </span>
                <div>
                  <strong>
                    Uma gestão mais leve começa com os registros em dia.
                  </strong>
                  <p>
                    Registre cada venda e mantenha o estoque e o financeiro
                    conectados.
                  </p>
                </div>
                <button onClick={() => open("sale")}>
                  Registrar uma venda <ArrowRight size={16} />
                </button>
              </section>
              </Reveal>
            </>
          )}
          {page === "validity" && !ready && <ValidityUpgradeNotice />}
          {page === "validity" && ready && (
            <ValidityPage
              validities={store.validities}
              demo={demo}
              busy={saving}
              onCreate={() => open("validity")}
              onRenew={(v) => open("renew", undefined, v)}
              onDismiss={(v) => open("dismiss", undefined, v)}
            />
          )}
          {page === "stock" && (
            <>
              <section className="stock-summary">
                <div>
                  <Boxes />
                  <span>
                    Unidades disponíveis
                    <strong>
                      <CountUp value={stockUnits} format={integer} />
                    </strong>
                  </span>
                </div>
                <div>
                  <Wallet />
                  <span>
                    Valor do estoque a custo
                    <strong>
                      <CountUp value={stockValue} format={money} />
                    </strong>
                  </span>
                </div>
                <div>
                  <TriangleAlert />
                  <span>
                    Produtos para repor
                    <strong>
                      <CountUp value={low.length} format={integer} />{" "}
                      <small>de {products.length} produtos</small>
                    </strong>
                  </span>
                </div>
              </section>
              <section className="panel">
                <div className="stock-toolbar">
                  <div className="search-field">
                    <Search size={17} />
                    <input
                      aria-label="Buscar produto"
                      placeholder="Buscar por nome, código ou tipo…"
                      value={query}
                      onChange={(e) => {
                        setQuery(e.target.value);
                        setTablePage(0);
                      }}
                    />
                  </div>
                  <select
                    aria-label="Filtrar estoque"
                    value={filter}
                    onChange={(e) => {
                      setFilter(e.target.value);
                      setTablePage(0);
                    }}
                  >
                    <option value="all">Todos os produtos</option>
                    <option value="low">Estoque baixo</option>
                    {Array.from(new Set(products.map((p) => p.type))).map(
                      (type) => (
                        <option key={type}>{type}</option>
                      ),
                    )}
                  </select>
                  <span className="muted">
                    {filteredProducts.length} produtos
                  </span>
                </div>
                {productTable(
                  filteredProducts.slice(tablePage * 10, tablePage * 10 + 10),
                )}
                <Pagination
                  count={filteredProducts.length}
                  page={tablePage}
                  setPage={setTablePage}
                />
              </section>
              <div className="info-line">
                <ShieldCheck size={16} />O custo médio é atualizado pelas
                compras. Vendas anteriores preservam seus valores originais.
              </div>
            </>
          )}
          {page === "movements" && (
            <section className="panel">
              <PanelHeading
                title="Histórico de movimentações"
                subtitle={`${movements.length} registros no período selecionado`}
                extra={
                  <button onClick={() => open("purchase")}>
                    <Plus size={16} />
                    Entrada de estoque
                  </button>
                }
              />
              <div className="table-tabs">
                {[
                  ["all", "Todas"],
                  ["sale", "Vendas"],
                  ["purchase", "Entradas"],
                ].map(([value, label]) => (
                  <button
                    key={value}
                    className={movementKind === value ? "active" : ""}
                    onClick={() => {
                      setMovementKind(value);
                      setTablePage(0);
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>
              {movements.length ? (
                <div className="table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>Movimentação</th>
                        <th>Produto</th>
                        <th>Cliente / fornecedor</th>
                        <th>Data</th>
                        <th>Quantidade</th>
                        <th>Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {movements
                        .slice(tablePage * 10, tablePage * 10 + 10)
                        .map((m) => (
                          <tr key={m.id}>
                            <td>
                              <span className={`movement-label ${m.kind}`}>
                                {m.kind === "sale" ? (
                                  <ArrowUpRight size={16} />
                                ) : (
                                  <ArrowDownLeft size={16} />
                                )}
                                {m.kind === "sale" ? "Venda" : "Entrada"}
                              </span>
                            </td>
                            <td className="strong">{m.productName}</td>
                            <td>{m.party}</td>
                            <td>{displayDate(m.date)}</td>
                            <td>{m.quantity} un.</td>
                            <td className="strong">
                              {money(m.quantity * m.unitPrice)}
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <Empty description="Não há movimentações neste período. Registre uma venda ou uma compra." />
              )}
              <Pagination
                count={movements.length}
                page={tablePage}
                setPage={setTablePage}
              />
            </section>
          )}
          {page === "finance" && (
            <>
              <div className="finance-grid">
                <section className="panel">
                  <PanelHeading
                    title="Composição do resultado"
                    subtitle="Receitas menos custos, impostos e despesas"
                  />
                  <div className="statement">
                    <Statement
                      label="Receita de vendas"
                      value={stats.revenue}
                    />
                    <Statement
                      label="Custo dos itens vendidos"
                      value={-stats.cogs}
                    />
                    <Statement
                      label="Impostos estimados"
                      value={-stats.taxes}
                    />
                    <Statement
                      label="Despesas operacionais"
                      value={-stats.expenses}
                    />
                    <Statement
                      label="Resultado estimado"
                      value={stats.profit}
                      total
                    />
                  </div>
                </section>
                <section className="panel">
                  <PanelHeading
                    title="Entradas e saídas estimadas"
                    subtitle="Considerando pagamentos à vista"
                  />
                  <div className="statement">
                    <Statement label="Vendas" value={stats.revenue} />
                    <Statement
                      label="Compras de estoque"
                      value={-stats.purchases}
                    />
                    <Statement
                      label="Impostos e despesas"
                      value={-stats.taxes - stats.expenses}
                    />
                    <Statement
                      label="Saldo operacional estimado"
                      value={stats.cash}
                      total
                    />
                  </div>
                  <p className="panel-note">
                    Não representa saldo bancário. Compras entram no resultado
                    conforme os produtos são vendidos.
                  </p>
                </section>
              </div>
              <section className="panel">
                <PanelHeading
                  title="Despesas operacionais"
                  subtitle="Gastos do negócio fora das compras de estoque"
                  extra={
                    <button
                      className="text-button"
                      onClick={() => open("expense")}
                    >
                      <Plus size={16} />
                      Nova despesa
                    </button>
                  }
                />
                {store.expenses.filter((e) => e.date >= from && e.date <= to)
                  .length ? (
                  <div className="table-scroll">
                    <table>
                      <thead>
                        <tr>
                          <th>Descrição</th>
                          <th>Data</th>
                          <th>Valor</th>
                        </tr>
                      </thead>
                      <tbody>
                        {store.expenses
                          .filter((e) => e.date >= from && e.date <= to)
                          .slice()
                          .reverse()
                          .map((e) => (
                            <tr key={e.id}>
                              <td className="strong">{e.description}</td>
                              <td>{displayDate(e.date)}</td>
                              <td>{money(e.amount)}</td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <Empty
                    title="Nenhuma despesa neste período"
                    description="Registre gastos como aluguel, transporte e materiais."
                  />
                )}
              </section>
            </>
          )}
          {page === "reports" && (
            <section className="panel report">
              <PanelHeading
                title={`Relatório ${period === "week" ? "semanal" : "mensal"}`}
                subtitle={`${displayDate(from)} a ${displayDate(to)}${demo ? " · DEMONSTRAÇÃO" : ""}`}
                extra={
                  <div className="heading-actions">
                      <button onClick={() => window.print()}>
                      <Printer size={16} />
                      Imprimir / PDF
                    </button>
                  </div>
                }
              />
              <div className="report-brand">
                ITAPÊ EXTINTORES · RELATÓRIO FINANCEIRO
              </div>
              <div className="volume-band">
                <div>
                  <span>Extintores vendidos</span>
                  <strong>
                    <CountUp value={stats.unitsSold} format={integer} />
                    <small>un.</small>
                  </strong>
                  <small>
                    em {stats.sales.length}{" "}
                    {stats.sales.length === 1 ? "venda" : "vendas"}
                  </small>
                </div>
                <div>
                  <span>Extintores comprados</span>
                  <strong>
                    <CountUp value={stats.unitsBought} format={integer} />
                    <small>un.</small>
                  </strong>
                  <small>
                    em {stats.restocks.length}{" "}
                    {stats.restocks.length === 1 ? "entrada" : "entradas"}
                  </small>
                </div>
                <div>
                  <span>Variação do estoque</span>
                  <strong
                    className={
                      stats.unitsBought - stats.unitsSold < 0
                        ? "negative"
                        : "positive"
                    }
                  >
                    <CountUp
                      value={stats.unitsBought - stats.unitsSold}
                      format={signed}
                    />
                    <small>un.</small>
                  </strong>
                  <small>compradas menos vendidas</small>
                </div>
              </div>
              <Chart store={store} from={from} to={to} />
              <div className="report-totals">
                <Statement label="Receita" value={stats.revenue} />
                <Statement
                  label="Custo dos itens vendidos"
                  value={-stats.cogs}
                />
                <Statement label="Impostos estimados" value={-stats.taxes} />
                <Statement label="Despesas" value={-stats.expenses} />
                <Statement
                  label="Resultado estimado"
                  value={stats.profit}
                  total
                />
              </div>
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Produto</th>
                      <th>Un. vendidas</th>
                      <th>Un. compradas</th>
                      <th>Receita</th>
                      <th>Custo dos itens</th>
                      <th>Impostos</th>
                      <th>Margem após impostos</th>
                    </tr>
                  </thead>
                  <tbody>
                    {store.products.map((p) => {
                      const sales = stats.sales.filter(
                        (s) => s.productId === p.id,
                      );
                      const bought = stats.restocks
                        .filter((m) => m.productId === p.id)
                        .reduce((a, m) => a + m.quantity, 0);
                      // O produto entra no relatório se teve qualquer
                      // movimentação no período, comprada ou vendida.
                      if (!sales.length && !bought) return null;
                      const qty = sales.reduce((a, s) => a + s.quantity, 0),
                        revenue = sales.reduce(
                          (a, s) => a + s.quantity * s.unitPrice,
                          0,
                        ),
                        cost = sales.reduce(
                          (a, s) => a + s.quantity * s.unitCost,
                          0,
                        ),
                        tax = sales.reduce(
                          (a, s) =>
                            a +
                            Math.round(
                              (s.quantity * s.unitPrice * s.tax) / 100,
                            ),
                          0,
                        );
                      return (
                        <tr key={p.id}>
                          <td className="strong">
                            {p.name} · {p.capacity}
                          </td>
                          <td className="units-cell">{qty}</td>
                          <td className="units-cell">{bought}</td>
                          <td>{money(revenue)}</td>
                          <td>{money(cost)}</td>
                          <td>{money(tax)}</td>
                          <td
                            className={
                              revenue - cost - tax < 0 ? "negative" : "positive"
                            }
                          >
                            {money(revenue - cost - tax)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td className="strong">Total do período</td>
                      <td className="units-cell">{stats.unitsSold}</td>
                      <td className="units-cell">{stats.unitsBought}</td>
                      <td>{money(stats.revenue)}</td>
                      <td>{money(stats.cogs)}</td>
                      <td>{money(stats.taxes)}</td>
                      <td
                        className={
                          stats.revenue - stats.cogs - stats.taxes < 0
                            ? "negative"
                            : "positive"
                        }
                      >
                        {money(stats.revenue - stats.cogs - stats.taxes)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
              {!stats.sales.length && !stats.restocks.length && (
                <Empty
                  title="Nenhuma movimentação no período"
                  description="Selecione outra semana ou mês para consultar o histórico."
                />
              )}
              <p className="panel-note">
                Resultado estimado = receita − custo histórico dos itens
                vendidos − impostos informados − despesas operacionais. Os
                valores consideram somente os registros incluídos no sistema. A
                margem por produto não inclui as despesas operacionais.
              </p>
            </section>
          )}
          {page === "settings" && (
            <div className="settings-grid">
              <section className="panel">
                <PanelHeading
                  title="Sua conta"
                  subtitle="Acesso individual à gestão"
                />
                <div className="settings-body">
                  <span className="settings-avatar">AD</span>
                  <h3>Administrador</h3>
                  <p>{user.name}</p>
                  <div className="setting-row">
                    <span>Ambiente</span>
                    <strong>{demo ? "Demonstração" : "Supabase"}</strong>
                  </div>
                  <div className="setting-row">
                    <span>Moeda</span>
                    <strong>Real brasileiro (BRL)</strong>
                  </div>
                  <div className="setting-row">
                    <span>Fuso horário dos registros</span>
                    <strong>São Paulo</strong>
                  </div>
                  <button onClick={logout} disabled={saving}>
                    <LogOut size={16} />
                    Sair da conta
                  </button>
                </div>
              </section>
              <section className="panel">
                <PanelHeading
                  title="Seus dados"
                  subtitle="Uma cópia dos registros, sempre que precisar"
                />
                <div className="settings-body">
                  <Database className="settings-data-icon" />
                  <h3>Exportar cópia dos dados</h3>
                  <p>
                    Baixe os produtos, as movimentações e as despesas em JSON.
                    Guarde o arquivo em um local protegido.
                  </p>
                  <button
                    className="primary"
                    onClick={() =>
                      download(
                        `itape-dados-${today()}.json`,
                        JSON.stringify(
                          {
                            format: "itape-export-v1",
                            exportedAt: new Date().toISOString(),
                            demo,
                            data: store,
                          },
                          null,
                          2,
                        ),
                        "application/json",
                      )
                    }
                    disabled={saving}
                  >
                    <Download size={16} />
                    Exportar dados
                  </button>
                  <p className="panel-note">
                    Essa cópia permite consultar seus registros fora do sistema.
                    A restauração requer importação técnica. A disponibilidade
                    dos dados reais depende da conexão com o Supabase.
                  </p>
                </div>
              </section>
            </div>
          )}
          <footer className="page-footer">
            <span>
              Itapê Extintores <i /> Feito para simplificar sua gestão.
            </span>
            <span>
              {demo ? "Dados de demonstração" : "Acesso individual protegido"}
            </span>
          </footer>
        </main>
      </div>
      {form && (
        <OperationForm
          mode={form.mode}
          product={form.product}
          validity={form.validity}
          schedules={ready}
          products={products}
          close={() => setForm(null)}
          save={save}
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
function Metric({
  index,
  title,
  value,
  detail,
  icon: Icon,
  color,
  highlight = false,
}: {
  index: number;
  title: string;
  value: ReactNode;
  detail: string;
  icon: typeof Boxes;
  color: string;
  highlight?: boolean;
}) {
  return (
    <article className={`metric ${highlight ? "highlight" : ""}`}>
      <div className="metric-heading">
        <span>
          <span className="metric-index">
            {String(index).padStart(2, "0")}
          </span>
          {title}
        </span>
        <span className={`metric-icon ${color}`}>
          <Icon size={18} />
        </span>
      </div>
      <strong>{value}</strong>
      <small>
        {highlight && <span className="dot" />}
        {detail}
      </small>
    </article>
  );
}
function PanelHeading({
  title,
  subtitle,
  extra,
}: {
  title: string;
  subtitle: string;
  extra?: React.ReactNode;
}) {
  return (
    <div className="panel-heading">
      <div>
        <h2>{title}</h2>
        <p>{subtitle}</p>
      </div>
      {extra}
    </div>
  );
}
function Statement({
  label,
  value,
  total = false,
}: {
  label: string;
  value: number;
  total?: boolean;
}) {
  return (
    <div className={`statement-row ${total ? "total" : ""}`}>
      <span>{label}</span>
      <strong className={total ? (value < 0 ? "negative" : "positive") : ""}>
        {money(value)}
      </strong>
    </div>
  );
}
function Pagination({
  count,
  page,
  setPage,
}: {
  count: number;
  page: number;
  setPage: (p: number) => void;
}) {
  if (count <= 10)
    return (
      <div className="pagination">
        <span>
          {count} {count === 1 ? "registro" : "registros"}
        </span>
      </div>
    );
  return (
    <div className="pagination">
      <span>
        {page * 10 + 1}–{Math.min(count, page * 10 + 10)} de {count} registros
      </span>
      <div>
        <button
          disabled={page === 0}
          onClick={() => setPage(page - 1)}
          aria-label="Página anterior"
        >
          <ChevronLeft size={16} />
        </button>
        <span>Página {page + 1}</span>
        <button
          disabled={(page + 1) * 10 >= count}
          onClick={() => setPage(page + 1)}
          aria-label="Próxima página"
        >
          <ChevronRight size={16} />
        </button>
      </div>
    </div>
  );
}
