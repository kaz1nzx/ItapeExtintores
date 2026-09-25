import test from "node:test";
import assert from "node:assert/strict";
import {
  adminCommandSchema,
  billing,
  billingQueue,
  describeEvent,
  missingFunction,
  nextPaidUntil,
  summarizeAccounts,
  suspendedError,
  type AdminAccount,
} from "../src/lib/admin";

const today = "2026-09-24";
const id = "4f1c2b0e-7d7a-4c1e-9a55-0f2d6b1e8c11";
const account = (over: Partial<AdminAccount> = {}): AdminAccount => ({
  id,
  email: "cliente@example.com",
  createdAt: "2026-01-10T12:00:00+00:00",
  lastSignInAt: null,
  company: "",
  admin: false,
  status: "active",
  monthlyFee: 14990,
  paidUntil: null,
  lastPaymentOn: null,
  notes: "",
  statusChangedAt: null,
  products: 0,
  sales: 0,
  operations30: 0,
  lastActivityAt: null,
  ...over,
});

test("classifica a cobrança: suspensa, em atraso, vencendo, em dia e sem vencimento", () => {
  assert.equal(billing(account({ status: "suspended", paidUntil: "2026-01-01" }), today), "suspended");
  assert.equal(billing(account({ paidUntil: "2026-09-23" }), today), "overdue");
  assert.equal(billing(account({ paidUntil: today }), today), "due");
  assert.equal(billing(account({ paidUntil: "2026-10-01" }), today), "due");
  assert.equal(billing(account({ paidUntil: "2026-10-02" }), today), "current");
  assert.equal(billing(account(), today), "untracked");
});

test("resume contas: receita mensal só das ativas e atraso separado das suspensas", () => {
  const s = summarizeAccounts(
    [
      account({ id: "a", paidUntil: "2026-10-20", operations30: 4 }),
      account({ id: "b", paidUntil: "2026-09-01", monthlyFee: 9900 }),
      account({ id: "c", status: "suspended", paidUntil: "2026-08-01", monthlyFee: 20000 }),
      account({ id: "d", monthlyFee: 0, admin: true, operations30: 2 }),
    ],
    today,
  );
  assert.deepEqual(s, {
    total: 4,
    active: 3,
    pending: 0,
    suspended: 1,
    overdue: 1,
    current: 2,
    untracked: 1,
    mrr: 14990 + 9900,
    paying: 2,
    overdueAmount: 9900,
    idle: 1,
  });
});

test("fila de cobrança traz vencidas antes das que vencem em breve, sem suspensas", () => {
  const queue = billingQueue(
    [
      account({ id: "soon", paidUntil: "2026-09-28" }),
      account({ id: "later", paidUntil: "2026-12-01" }),
      account({ id: "late", paidUntil: "2026-09-02" }),
      account({ id: "off", status: "suspended", paidUntil: "2026-08-01" }),
    ],
    today,
  );
  assert.deepEqual(queue.map((a) => a.id), ["late", "soon"]);
});

test("pagamento avança um mês com o mesmo corte de fim de mês do banco", () => {
  assert.equal(nextPaidUntil("2026-01-31", today), "2026-02-28");
  assert.equal(nextPaidUntil("2026-09-10", today), "2026-10-10");
  assert.equal(nextPaidUntil(null, today), "2026-10-24");
  assert.equal(nextPaidUntil("2026-12-15", today), "2027-01-15");
});

test("valida comandos do administrador", () => {
  const ok = (value: unknown) => adminCommandSchema.safeParse(value).success;
  assert.ok(ok({ kind: "status", accountId: id, status: "suspended" }));
  assert.ok(ok({ kind: "plan", accountId: id, monthlyFee: 14990, paidUntil: "2026-10-10", notes: "  Plano mensal " }));
  assert.ok(ok({ kind: "plan", accountId: id, monthlyFee: 0, paidUntil: null, notes: "" }));
  assert.ok(ok({ kind: "payment", accountId: id, paidUntil: null, reactivate: true }));
  assert.ok(!ok({ kind: "status", accountId: id, status: "deleted" }));
  assert.ok(!ok({ kind: "status", accountId: "não-é-uuid", status: "active" }));
  assert.ok(!ok({ kind: "plan", accountId: id, monthlyFee: -1, paidUntil: null, notes: "" }));
  assert.ok(!ok({ kind: "plan", accountId: id, monthlyFee: 10.5, paidUntil: null, notes: "" }));
  assert.ok(!ok({ kind: "plan", accountId: id, monthlyFee: 100, paidUntil: "2026-02-30", notes: "" }));
  assert.ok(!ok({ kind: "plan", accountId: id, monthlyFee: 100, paidUntil: null, notes: "x".repeat(1001) }));
  assert.ok(!ok({ kind: "payment", accountId: id, reactivate: true }));
  assert.ok(!ok({ kind: "delete", accountId: id }));
});

test("conta aguardando ativação não conta como ativa nem entra na cobrança", () => {
  const waiting = account({ id: "w", status: "pending", paidUntil: "2026-09-01", operations30: 0 });
  assert.equal(billing(waiting, today), "pending");
  const s = summarizeAccounts([waiting, account({ id: "a", paidUntil: "2026-10-20", operations30: 3 })], today);
  assert.equal(s.pending, 1);
  assert.equal(s.active, 1);
  assert.equal(s.suspended, 0);
  assert.equal(s.mrr, 14990);
  assert.equal(s.idle, 0);
  assert.deepEqual(billingQueue([waiting], today), []);
});

test("registro de ações vira frase legível", () => {
  const base = { id: 1, createdAt: "2026-09-24T20:00:00Z", admin: "dono@x.com", account: "Fogo Zero" };
  assert.equal(describeEvent({ ...base, action: "status", details: { from: "active", to: "suspended" } }), "suspendeu o acesso de Fogo Zero");
  assert.equal(describeEvent({ ...base, action: "status", details: { from: "pending", to: "active" } }), "ativou a conta de Fogo Zero");
  assert.equal(describeEvent({ ...base, action: "status", details: { from: "suspended", to: "active" } }), "reativou o acesso de Fogo Zero");
  assert.equal(
    describeEvent({ ...base, action: "payment", details: { from: "2026-09-10", to: "2026-10-10", reactivated: true } }),
    "registrou o pagamento de Fogo Zero (10/09/2026 → 10/10/2026) e liberou o acesso",
  );
  assert.match(
    describeEvent({ ...base, action: "plan", details: { monthlyFee: 14990, paidUntil: null } }),
    /^editou a assinatura de Fogo Zero: R\$\s149,90, vencimento sem vencimento$/,
  );
});

test("reconhece conta suspensa e banco sem a atualização", () => {
  assert.ok(suspendedError({ message: "Acesso suspenso. Entre em contato para reativar sua assinatura." }));
  assert.ok(!suspendedError({ message: "Os dados mudaram. Atualize e tente novamente." }));
  assert.ok(missingFunction({ code: "PGRST202" }));
  assert.ok(missingFunction({ code: "42883" }));
  assert.ok(!missingFunction({ code: "P0001" }));
});
