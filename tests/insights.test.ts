import test from "node:test";
import assert from "node:assert/strict";
import {
  applyCommand,
  commandSchema,
  emptyStore,
  withDefaults,
  type Store,
  type User,
  type Validity,
} from "../src/lib/domain";
import {
  formatPercent,
  goalFor,
  goalProgress,
  previousPeriod,
  rechargeForecast,
  trend,
} from "../src/lib/insights";
import { subscriptionNotice, supportNumber } from "../src/lib/admin";

const user: User = { id: "owner", name: "Administrador", role: "admin" };

test("período anterior: mês parcial, mês completo, fevereiro, virada de ano e semana", () => {
  assert.deepEqual(previousPeriod("month", "2026-09-01", "2026-09-24"), {
    from: "2026-08-01", to: "2026-08-24", label: "vs. mesmo período de agosto",
  });
  assert.deepEqual(previousPeriod("month", "2026-08-01", "2026-08-31"), {
    from: "2026-07-01", to: "2026-07-31", label: "vs. julho",
  });
  // 30 de março comparado com fevereiro inteiro; março completo, idem.
  assert.equal(previousPeriod("month", "2026-03-01", "2026-03-30").to, "2026-02-28");
  assert.equal(previousPeriod("month", "2026-03-01", "2026-03-31").to, "2026-02-28");
  // Fevereiro completo compara com janeiro inteiro, não com 1 a 28.
  assert.equal(previousPeriod("month", "2026-02-01", "2026-02-28").to, "2026-01-31");
  assert.equal(previousPeriod("month", "2026-01-01", "2026-01-10").from, "2025-12-01");
  assert.deepEqual(previousPeriod("week", "2026-09-18", "2026-09-24"), {
    from: "2026-09-11", to: "2026-09-17", label: "vs. 7 dias anteriores",
  });
});

test("variação: direção, porcentagem só com base positiva e formato brasileiro", () => {
  assert.deepEqual(trend(12000, 10000), { direction: "up", percent: 20, difference: 2000 });
  assert.equal(trend(5000, 10000).direction, "down");
  assert.equal(trend(0, 0).direction, "flat");
  assert.equal(trend(5000, 0).percent, null);
  assert.equal(trend(-100, -500).percent, null);
  assert.equal(formatPercent(12.345), "+12,3%");
  assert.equal(formatPercent(-8), "−8,0%");
  assert.equal(formatPercent(250), "+250%");
  assert.equal(formatPercent(0), "0,0%");
});

test("meta vale do mês definido em diante, sem reescrever meses anteriores", () => {
  const settings = { goals: { "2026-03": 1000000, "2026-09": 2000000, "2026-11": 0 } };
  assert.equal(goalFor(settings, "2026-02"), 0);
  assert.equal(goalFor(settings, "2026-03"), 1000000);
  assert.equal(goalFor(settings, "2026-08"), 1000000);
  assert.equal(goalFor(settings, "2026-10"), 2000000);
  assert.equal(goalFor(settings, "2026-12"), 0);
  assert.equal(goalFor({}, "2026-09"), 0);
});

function storeWithSales(sales: [string, number][], goals: Record<string, number>): Store {
  const store = withDefaults({ ...emptyStore(), settings: { goals } });
  store.movements = sales.map(([date, amount], i) => ({
    id: `m${i}`, productId: "p", productName: "Extintor", kind: "sale", quantity: 1,
    unitPrice: amount, unitCost: 0, tax: 0, date, party: "Cliente", actor: "x", createdAt: date,
  }));
  return store;
}

test("progresso da meta: ritmo, projeção e valor por dia no mês corrente", () => {
  const store = storeWithSales([["2026-09-05", 600000], ["2026-09-20", 600000], ["2026-08-30", 999999]], { "2026-09": 3000000 });
  const p = goalProgress(store, "2026-09", "2026-09-24");
  assert.equal(p.sold, 1200000);
  assert.equal(p.percent, 40);
  assert.equal(p.remaining, 1800000);
  assert.equal(p.daysLeft, 7);
  assert.equal(p.perDay, Math.ceil(1800000 / 7));
  assert.equal(p.expected, 2400000);
  assert.equal(p.projected, 1500000);
  // Mês fechado: nada a projetar, e a meta batida não deixa saldo negativo.
  const past = goalProgress(storeWithSales([["2026-08-10", 4000000]], { "2026-08": 3000000 }), "2026-08", "2026-09-24");
  assert.equal(past.current, false);
  assert.equal(past.remaining, 0);
  assert.equal(past.daysLeft, 0);
  assert.equal(past.projected, 4000000);
});

const validity = (over: Partial<Validity>): Validity => ({
  id: Math.random().toString(36), client: "Cliente", phone: "", item: "Pó ABC · 4 kg", quantity: 1,
  startDate: "2025-09-01", dueDate: "2026-09-01", status: "pending", movementId: null, resolvedAt: null,
  createdAt: "2025-09-01", ...over,
});

test("previsão de recargas: por mês, clientes distintos e atrasadas separadas", () => {
  const forecast = rechargeForecast([
    validity({ client: "Hotel Serra", quantity: 4, dueDate: "2026-09-02" }),
    validity({ client: "hotel serra ", quantity: 2, dueDate: "2026-09-28" }),
    validity({ client: "Padaria", quantity: 3, dueDate: "2026-11-15" }),
    validity({ client: "Oficina", quantity: 5, dueDate: "2026-07-01" }),
    validity({ client: "Oficina", quantity: 9, dueDate: "2026-10-10", status: "renewed" }),
    validity({ client: "Longe", quantity: 7, dueDate: "2027-06-01" }),
  ], "2026-09-24", 6);
  assert.deepEqual(forecast.months.map((m) => m.month), ["2026-09", "2026-10", "2026-11", "2026-12", "2027-01", "2027-02"]);
  assert.deepEqual(forecast.months[0], { key: "2026-09", month: "2026-09", units: 6, clients: 1, validities: 2 });
  assert.equal(forecast.months[1].units, 0);
  assert.equal(forecast.months[2].units, 3);
  assert.deepEqual(forecast.late, { key: "late", month: null, units: 5, clients: 1, validities: 1 });
});

test("comandos de meta e valor da recarga atualizam as preferências", () => {
  let store = withDefaults(emptyStore());
  store = applyCommand(store, { kind: "goal", month: "2026-09", amount: 2000000 }, user, "g1");
  store = applyCommand(store, { kind: "goal", month: "2026-11", amount: 0 }, user, "g2");
  store = applyCommand(store, { kind: "recharge_price", amount: 4500 }, user, "r1");
  assert.deepEqual(store.settings, { goals: { "2026-09": 2000000, "2026-11": 0 }, rechargePrice: 4500 });
  assert.equal(store.version, 3);
  const ok = (value: unknown) => commandSchema.safeParse(value).success;
  assert.ok(!ok({ kind: "goal", month: "2026-13", amount: 100 }));
  assert.ok(!ok({ kind: "goal", month: "2026-9", amount: 100 }));
  assert.ok(!ok({ kind: "goal", month: "2026-09", amount: -1 }));
  assert.ok(!ok({ kind: "recharge_price", amount: 10.5 }));
  // Banco sem a atualização não devolve preferências.
  const { settings: _, ...legacy } = emptyStore();
  assert.deepEqual(withDefaults(legacy as Store).settings, {});
});

test("aviso da mensalidade: 7 dias antes, no dia e enquanto vencida", () => {
  assert.equal(subscriptionNotice(null, "2026-09-24"), null);
  assert.equal(subscriptionNotice("2026-10-02", "2026-09-24"), null);
  assert.deepEqual(subscriptionNotice("2026-10-01", "2026-09-24"), { days: 7, overdue: false });
  assert.deepEqual(subscriptionNotice("2026-09-24", "2026-09-24"), { days: 0, overdue: false });
  assert.deepEqual(subscriptionNotice("2026-09-20", "2026-09-24"), { days: -4, overdue: true });
});

test("WhatsApp de suporte: DDD ganha +55 e número inválido desliga o botão", () => {
  assert.equal(supportNumber("(11) 98765-4321"), "5511987654321");
  assert.equal(supportNumber("+55 11 3333-4444"), "551133334444");
  assert.equal(supportNumber(""), null);
  assert.equal(supportNumber(undefined), null);
  assert.equal(supportNumber("12345"), null);
});
