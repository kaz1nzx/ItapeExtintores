import { z } from "zod";
import { addMonths, daysBetween } from "@/lib/domain";

// Conta de Authentication como o painel do administrador a recebe de
// itape_admin_overview (database/upgrade.sql). Uso em contagens, nunca valores
// financeiros da empresa cliente.
export type AdminAccount = {
  id: string;
  email: string;
  createdAt: string;
  lastSignInAt: string | null;
  company: string;
  admin: boolean;
  // pending: conta nova, ainda não liberada pelo administrador.
  status: "active" | "suspended" | "pending";
  monthlyFee: number;
  paidUntil: string | null;
  lastPaymentOn: string | null;
  notes: string;
  statusChangedAt: string | null;
  products: number;
  sales: number;
  operations30: number;
  lastActivityAt: string | null;
};
export type AdminActivity = { date: string; operations: number; accounts: number };
// Ação registrada em itape_private.admin_events.
export type AdminEvent = {
  id: number;
  action: "status" | "plan" | "payment";
  details: Record<string, unknown>;
  createdAt: string;
  admin: string;
  account: string;
};
export type AdminOverview = {
  today: string;
  accounts: AdminAccount[];
  activity: AdminActivity[];
  events?: AdminEvent[];
};

// A partir de quantos dias antes do vencimento a cobrança entra em atenção.
export const BILLING_ALERT_DAYS = 7;

export type Billing = "pending" | "suspended" | "overdue" | "due" | "current" | "untracked";
export function billing(account: AdminAccount, today: string): Billing {
  if (account.status === "pending") return "pending";
  if (account.status === "suspended") return "suspended";
  if (!account.paidUntil) return "untracked";
  const days = daysBetween(today, account.paidUntil);
  return days < 0 ? "overdue" : days <= BILLING_ALERT_DAYS ? "due" : "current";
}

export function summarizeAccounts(accounts: AdminAccount[], today: string) {
  const states = accounts.map((a) => ({ a, b: billing(a, today) }));
  const active = states.filter(({ b }) => b !== "suspended" && b !== "pending");
  const overdue = states.filter(({ b }) => b === "overdue");
  return {
    total: accounts.length,
    active: active.length,
    pending: states.filter(({ b }) => b === "pending").length,
    suspended: states.filter(({ b }) => b === "suspended").length,
    overdue: overdue.length,
    // Em dia: ativas sem cobrança vencida (inclui as sem vencimento definido).
    current: active.length - overdue.length,
    untracked: states.filter(({ b }) => b === "untracked").length,
    mrr: active.reduce((sum, { a }) => sum + a.monthlyFee, 0),
    paying: active.filter(({ a }) => a.monthlyFee > 0).length,
    overdueAmount: overdue.reduce((sum, { a }) => sum + a.monthlyFee, 0),
    idle: active.filter(({ a }) => a.operations30 === 0).length,
  };
}

// Cobranças que pedem ação: vencidas primeiro, depois as que vencem em breve.
export function billingQueue(accounts: AdminAccount[], today: string) {
  return accounts
    .filter((a) => ["overdue", "due"].includes(billing(a, today)))
    .sort((a, b) => a.paidUntil!.localeCompare(b.paidUntil!));
}

// Frase do registro de ações, a partir dos detalhes gravados pelo banco.
export function describeEvent(event: AdminEvent) {
  const d = event.details;
  const money = (cents: unknown) =>
    (Number(cents) / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  const date = (value: unknown) =>
    typeof value === "string" ? value.split("-").reverse().join("/") : "sem vencimento";
  if (event.action === "status")
    return d.to === "suspended"
      ? `suspendeu o acesso de ${event.account}`
      : d.from === "pending"
        ? `ativou a conta de ${event.account}`
        : `reativou o acesso de ${event.account}`;
  if (event.action === "payment")
    return `registrou o pagamento de ${event.account} (${date(d.from)} → ${date(d.to)})${d.reactivated ? " e liberou o acesso" : ""}`;
  return `editou a assinatura de ${event.account}: ${money(d.monthlyFee)}, vencimento ${date(d.paidUntil)}`;
}

// Mesma conta do banco: o pagamento avança um mês a partir do vencimento
// atual (ou de hoje, se ainda não houver), com o corte de fim de mês do
// Postgres.
export const nextPaidUntil = (paidUntil: string | null, today: string) =>
  addMonths(paidUntil ?? today, 1);

const day = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((v) => {
    const d = new Date(`${v}T12:00:00Z`);
    return (
      !isNaN(d.getTime()) &&
      d.toISOString().slice(0, 10) === v &&
      v >= "2000-01-01" &&
      v <= "2100-12-31"
    );
  }, "Informe uma data válida.");
const accountId = z.uuid();
export const adminCommandSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("status"),
    accountId,
    status: z.enum(["active", "suspended"]),
  }),
  z.object({
    kind: z.literal("plan"),
    accountId,
    monthlyFee: z.number().int().min(0).max(100_000_000),
    paidUntil: day.nullable(),
    notes: z.string().trim().max(1000),
  }),
  // paidUntil é o vencimento que o administrador viu: o banco recusa o
  // pagamento se ele já mudou, então repetir o pedido não cobra duas vezes.
  z.object({
    kind: z.literal("payment"),
    accountId,
    paidUntil: day.nullable(),
    reactivate: z.boolean(),
  }),
]);
export type AdminCommand = z.infer<typeof adminCommandSchema>;

// Aviso da mensalidade para o próprio cliente, a partir de BILLING_ALERT_DAYS
// antes do vencimento e enquanto ele estiver vencido.
export function subscriptionNotice(paidUntil: string | null, today: string) {
  if (!paidUntil) return null;
  const days = daysBetween(today, paidUntil);
  return days > BILLING_ALERT_DAYS ? null : { days, overdue: days < 0 };
}
// WhatsApp de suporte (SUPPORT_WHATSAPP). Número com DDD ganha o código do
// Brasil; qualquer outra coisa desliga o botão em vez de abrir um link errado.
export function supportNumber(raw: string | undefined) {
  let digits = (raw ?? "").replace(/\D/g, "");
  if (digits.length === 10 || digits.length === 11) digits = `55${digits}`;
  return digits.length >= 12 && digits.length <= 15 ? digits : null;
}
export const supportLink = (number: string, text: string) =>
  `https://wa.me/${number}?text=${encodeURIComponent(text)}`;

// Erros das funções do banco que mudam a resposta das rotas.
export const suspendedError = (error: { message?: string }) =>
  !!error.message?.startsWith("Acesso suspenso");
export const adminOnlyError = (error: { message?: string }) =>
  error.message === "Acesso restrito ao administrador.";
// Banco ainda sem database/upgrade.sql: a função chamada não existe.
export const missingFunction = (error: { code?: string }) =>
  error.code === "PGRST202" || error.code === "42883";
