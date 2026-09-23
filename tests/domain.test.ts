import test from "node:test";
import assert from "node:assert/strict";
import {
  applyCommand,
  emptyStore,
  summarize,
  today,
  daysBefore,
  addMonths,
  type Store,
  type User,
} from "../src/lib/domain";
const user: User = { id: "owner", name: "Administrador", role: "admin" };
const product = {
  kind: "product",
  name: "Extintor",
  sku: "EXT-001",
  type: "Pó ABC",
  capacity: "4 kg",
  cost: 6200,
  price: 11000,
  tax: 12,
  minimum: 5,
};
function stocked(): Store {
  return applyCommand(
    applyCommand(emptyStore(), product, user, "p"),
    {
      kind: "purchase",
      productId: "p",
      quantity: 10,
      unitPrice: 6200,
      date: today(),
      party: "Fornecedor",
    },
    user,
    "purchase",
  );
}
test("compra aumenta estoque e preserva centavos", () => {
  const s = stocked();
  assert.equal(s.products[0].stock, 10);
  assert.equal(s.products[0].cost, 6200);
});
test("venda baixa estoque e preserva valores históricos", () => {
  const s = applyCommand(
    stocked(),
    {
      kind: "sale",
      productId: "p",
      quantity: 3,
      unitPrice: 11000,
      date: today(),
      party: "Cliente",
    },
    user,
    "sale",
  );
  assert.equal(s.products[0].stock, 7);
  const updated = applyCommand(
    s,
    { ...product, id: "p", price: 99900, tax: 22 },
    user,
    "edit",
  );
  const summary = summarize(updated, today(), today());
  assert.equal(summary.revenue, 33000);
  assert.equal(summary.cogs, 18600);
  assert.equal(summary.taxes, 3960);
  assert.equal(summary.profit, 10440);
});
test("estoque insuficiente não altera estado original", () => {
  const s = stocked();
  assert.throws(
    () =>
      applyCommand(
        s,
        {
          kind: "sale",
          productId: "p",
          quantity: 11,
          unitPrice: 100,
          date: today(),
          party: "Cliente",
        },
        user,
        "sale",
      ),
    /insuficiente/,
  );
  assert.equal(s.products[0].stock, 10);
  assert.equal(s.movements.length, 1);
});
test("não aceita quantidades fracionárias ou negativas", () => {
  for (const quantity of [1.2, -1, 0])
    assert.throws(() =>
      applyCommand(
        stocked(),
        {
          kind: "sale",
          productId: "p",
          quantity,
          unitPrice: 100,
          date: today(),
          party: "Cliente",
        },
        user,
        "sale",
      ),
    );
});
test("custo médio muda somente com novas compras", () => {
  const s = applyCommand(
    stocked(),
    {
      kind: "purchase",
      productId: "p",
      quantity: 10,
      unitPrice: 8200,
      date: today(),
      party: "Fornecedor",
    },
    user,
    "purchase-2",
  );
  assert.equal(s.products[0].cost, 7200);
  assert.throws(
    () => applyCommand(s, { ...product, id: "p", cost: 100 }, user, "edit"),
    /custo/,
  );
});
test("compras e despesas não são descontadas duas vezes do resultado", () => {
  let s = applyCommand(
    stocked(),
    {
      kind: "sale",
      productId: "p",
      quantity: 3,
      unitPrice: 11000,
      date: today(),
      party: "Cliente",
    },
    user,
    "sale",
  );
  s = applyCommand(
    s,
    { kind: "expense", description: "Frete", amount: 1000, date: today() },
    user,
    "expense",
  );
  const result = summarize(s, today(), today());
  assert.equal(result.profit, 9440);
  assert.equal(result.purchases, 62000);
  assert.equal(result.cash, -33960);
});
test("filtra período incluindo limites", () => {
  const s = stocked();
  assert.equal(summarize(s, today(), today()).purchases, 62000);
  assert.equal(
    summarize(s, daysBefore(today(), 7), daysBefore(today(), 1)).purchases,
    0,
  );
});
test("não aceita datas impossíveis, futuras ou anteriores à última movimentação", () => {
  for (const date of ["2025-02-30", "2099-01-01", daysBefore(today(), 1)])
    assert.throws(() =>
      applyCommand(
        stocked(),
        {
          kind: "sale",
          productId: "p",
          quantity: 1,
          unitPrice: 100,
          date,
          party: "Cliente",
        },
        user,
        "sale",
      ),
    );
});
test("produto com saldo não pode ser arquivado", () => {
  assert.throws(
    () =>
      applyCommand(
        stocked(),
        { kind: "archive", productId: "p" },
        user,
        "archive",
      ),
    /sem estoque/,
  );
});
test("código de produto é único sem diferenciar maiúsculas", () => {
  assert.throws(
    () => applyCommand(stocked(), { ...product, sku: "ext-001" }, user, "p2"),
    /código/,
  );
});
test("arredonda imposto por venda em centavos", () => {
  const s = applyCommand(
    stocked(),
    {
      kind: "sale",
      productId: "p",
      quantity: 1,
      unitPrice: 1001,
      date: today(),
      party: "Cliente",
    },
    user,
    "sale",
  );
  assert.equal(summarize(s, today(), today()).taxes, 120);
});
test("resultado permite prejuízo sem ocultar valores negativos", () => {
  const s = applyCommand(
    stocked(),
    {
      kind: "sale",
      productId: "p",
      quantity: 1,
      unitPrice: 100,
      date: today(),
      party: "Cliente",
    },
    user,
    "sale",
  );
  assert.equal(summarize(s, today(), today()).profit, -6112);
});


const second = {
  kind: "product",
  name: "Extintor CO2",
  sku: "EXT-002",
  type: "CO₂",
  capacity: "6 kg",
  cost: 18500,
  price: 32000,
  tax: 10,
  minimum: 5,
};
// Duas linhas na mesma remessa: estoque de ambos os produtos deve subir e as
// duas movimentações devem compartilhar data e fornecedor.
function twoProducts(): Store {
  return applyCommand(stocked(), second, user, "q");
}
test("compra em lote registra cada item e compartilha data e fornecedor", () => {
  const s = applyCommand(
    twoProducts(),
    {
      kind: "batch",
      operation: "purchase",
      date: today(),
      party: "Distribuidora Central",
      items: [
        { productId: "p", quantity: 5, unitPrice: 6200 },
        { productId: "q", quantity: 4, unitPrice: 18500 },
      ],
    },
    user,
    "lote",
  );
  assert.equal(s.products.find((x) => x.id === "p")!.stock, 15);
  assert.equal(s.products.find((x) => x.id === "q")!.stock, 4);
  const fresh = s.movements.filter((m) => m.party === "Distribuidora Central");
  assert.equal(fresh.length, 2);
  assert.equal(new Set(fresh.map((m) => m.id)).size, 2);
  assert.equal(summarize(s, today(), today()).unitsBought, 19);
});
test("lote com o mesmo produto duas vezes acumula custo médio", () => {
  const s = applyCommand(
    stocked(),
    {
      kind: "batch",
      operation: "purchase",
      date: today(),
      party: "Fornecedor",
      items: [
        { productId: "p", quantity: 10, unitPrice: 8200 },
        { productId: "p", quantity: 20, unitPrice: 4200 },
      ],
    },
    user,
    "lote",
  );
  assert.equal(s.products[0].stock, 40);
  assert.equal(s.products[0].cost, 5700);
});
test("lote falho não altera o estoque de nenhum item", () => {
  const before = twoProducts();
  assert.throws(() =>
    applyCommand(
      before,
      {
        kind: "batch",
        operation: "sale",
        date: today(),
        party: "Cliente",
        items: [
          { productId: "p", quantity: 2, unitPrice: 11000 },
          { productId: "q", quantity: 99, unitPrice: 32000 },
        ],
      },
      user,
      "lote",
    ),
  );
  assert.equal(before.products.find((x) => x.id === "p")!.stock, 10);
  assert.equal(before.movements.filter((m) => m.kind === "sale").length, 0);
});
test("venda em lote soma unidades vendidas no período", () => {
  const s = applyCommand(
    twoProducts(),
    {
      kind: "batch",
      operation: "sale",
      date: today(),
      party: "Condomínio Planalto",
      items: [{ productId: "p", quantity: 3, unitPrice: 11000 }],
    },
    user,
    "lote",
  );
  assert.equal(summarize(s, today(), today()).unitsSold, 3);
});

// ---- Calendário de validades
const sale = (extra: Record<string, unknown> = {}) => ({
  kind: "sale",
  productId: "p",
  quantity: 2,
  unitPrice: 11000,
  date: today(),
  party: "Condomínio Planalto",
  ...extra,
});
test("venda agenda a validade de 12 meses para o cliente", () => {
  const s = applyCommand(stocked(), sale({ phone: "(11) 98888-7777" }), user, "venda");
  assert.equal(s.validities.length, 1);
  const v = s.validities[0];
  assert.equal(v.client, "Condomínio Planalto");
  assert.equal(v.phone, "(11) 98888-7777");
  assert.equal(v.item, "Extintor · 4 kg");
  assert.equal(v.quantity, 2);
  assert.equal(v.dueDate, addMonths(today(), 12));
  assert.equal(v.movementId, "venda");
  assert.equal(v.status, "pending");
});
test("venda sem agendamento não cria lembrete", () => {
  const s = applyCommand(stocked(), sale({ track: false }), user, "venda");
  assert.equal(s.validities.length, 0);
  assert.equal(s.products[0].stock, 8);
});
test("compra nunca agenda validade", () => {
  assert.equal(stocked().validities.length, 0);
});
test("venda em lote agenda uma validade por item", () => {
  const s = applyCommand(
    twoProducts(),
    {
      kind: "batch",
      operation: "purchase",
      date: today(),
      party: "Fornecedor",
      items: [{ productId: "q", quantity: 5, unitPrice: 18500 }],
    },
    user,
    "entrada",
  );
  const sold = applyCommand(
    s,
    {
      kind: "batch",
      operation: "sale",
      date: today(),
      party: "Hotel Serra Azul",
      items: [
        { productId: "p", quantity: 3, unitPrice: 11000 },
        { productId: "q", quantity: 1, unitPrice: 32000 },
      ],
    },
    user,
    "lote",
  );
  assert.deepEqual(
    sold.validities.map((v) => [v.client, v.quantity]),
    [
      ["Hotel Serra Azul", 3],
      ["Hotel Serra Azul", 1],
    ],
  );
});
test("vencimento corta o fim do mês como o Postgres", () => {
  assert.equal(addMonths("2024-02-29", 12), "2025-02-28");
  assert.equal(addMonths("2025-01-31", 12), "2026-01-31");
  assert.equal(addMonths("2025-12-15", 12), "2026-12-15");
});
test("renovação encerra o lembrete e abre o próximo ciclo", () => {
  const start = daysBefore(today(), 360);
  let s = applyCommand(
    emptyStore(),
    { kind: "validity", client: "Clínica Vida", item: "CO2 · 6 kg", quantity: 3, startDate: start },
    user,
    "manual",
  );
  assert.equal(s.validities[0].dueDate, addMonths(start, 12));
  s = applyCommand(s, { kind: "validity_renew", validityId: "manual", date: today() }, user, "renova");
  const [old, next] = s.validities;
  assert.equal(old.status, "renewed");
  assert.equal(old.resolvedAt, today());
  assert.equal(next.status, "pending");
  assert.equal(next.client, "Clínica Vida");
  assert.equal(next.dueDate, addMonths(today(), 12));
  assert.throws(() =>
    applyCommand(s, { kind: "validity_renew", validityId: "manual", date: today() }, user, "de-novo"),
  );
});
test("dispensar tira o lembrete da lista pendente", () => {
  const s = applyCommand(
    applyCommand(stocked(), sale(), user, "venda"),
    { kind: "validity_dismiss", validityId: "venda-validade" },
    user,
    "dispensa",
  );
  assert.equal(s.validities[0].status, "dismissed");
});
test("telefone com letras é recusado", () => {
  assert.throws(() => applyCommand(stocked(), sale({ phone: "ligar amanhã" }), user, "venda"));
});
