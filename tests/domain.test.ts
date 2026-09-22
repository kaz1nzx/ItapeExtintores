import test from "node:test";
import assert from "node:assert/strict";
import {
  applyCommand,
  emptyStore,
  summarize,
  today,
  daysBefore,
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
