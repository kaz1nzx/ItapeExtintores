import { z } from "zod";

export type Product = {
  id: string;
  name: string;
  sku: string;
  type: string;
  capacity: string;
  cost: number;
  price: number;
  tax: number;
  stock: number;
  minimum: number;
  active: boolean;
};
export type Movement = {
  id: string;
  productId: string;
  productName: string;
  kind: "sale" | "purchase";
  quantity: number;
  unitPrice: number;
  unitCost: number;
  tax: number;
  date: string;
  party: string;
  actor: string;
  createdAt: string;
};
export type Expense = {
  id: string;
  description: string;
  amount: number;
  date: string;
  actor: string;
  createdAt: string;
};
export type Store = {
  version: number;
  products: Product[];
  movements: Movement[];
  expenses: Expense[];
};
export type User = { id: string; name: string; role: "admin" | "operator" };
export const emptyStore = (): Store => ({
  version: 0,
  products: [],
  movements: [],
  expenses: [],
});
export const money = (cents: number) =>
  (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
export function today() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}
export function daysBefore(date: string, days: number) {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}
const text = z.string().trim().min(1).max(120);
const cents = z.number().int().min(0).max(100_000_000);
const quantity = z.number().int().min(1).max(100_000);
const date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((v) => {
    const d = new Date(`${v}T12:00:00Z`);
    return (
      !isNaN(d.getTime()) &&
      d.toISOString().slice(0, 10) === v &&
      v <= today() &&
      v >= "2000-01-01"
    );
  }, "Informe uma data válida, até hoje.");
export const commandSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("product"),
    id: z.string().optional(),
    name: text,
    sku: text,
    type: text,
    capacity: text,
    cost: cents,
    price: cents,
    tax: z.number().min(0).max(100).multipleOf(0.01),
    minimum: z.number().int().min(0).max(100_000),
  }),
  z.object({ kind: z.literal("archive"), productId: text }),
  z.object({
    kind: z.enum(["sale", "purchase"]),
    productId: text,
    quantity,
    unitPrice: cents,
    date,
    party: text,
  }),
  // Vários produtos na mesma remessa. A data e a contraparte são
  // compartilhadas; cada item vira uma movimentação, tudo em uma transação.
  z.object({
    kind: z.literal("batch"),
    operation: z.enum(["sale", "purchase"]),
    date,
    party: text,
    items: z
      .array(z.object({ productId: text, quantity, unitPrice: cents }))
      .min(1)
      .max(20),
  }),
  z.object({
    kind: z.literal("expense"),
    description: text,
    amount: cents.refine((v) => v > 0),
    date,
  }),
]);
export type Command = z.infer<typeof commandSchema>;
export function applyCommand(
  store: Store,
  input: unknown,
  actor: User,
  id: string,
  createdAt = new Date().toISOString(),
): Store {
  const cmd = commandSchema.parse(input);
  const selling =
    cmd.kind === "sale" || (cmd.kind === "batch" && cmd.operation === "sale");
  if (actor.role !== "admin" && !selling)
    throw new Error("Somente administradores podem executar esta ação.");
  const next = structuredClone(store);
  if (cmd.kind === "product") {
    if (
      next.products.some(
        (p) => p.sku.toLowerCase() === cmd.sku.toLowerCase() && p.id !== cmd.id,
      )
    )
      throw new Error("Este código já está cadastrado.");
    if (cmd.id) {
      const p = next.products.find((p) => p.id === cmd.id && p.active);
      if (!p) throw new Error("Produto não encontrado.");
      // Average inventory cost changes only through purchases while stock exists.
      if (p.stock > 0 && cmd.cost !== p.cost)
        throw new Error(
          "Com estoque disponível, o custo é atualizado pelas entradas de compra.",
        );
      Object.assign(p, { ...cmd, id: p.id });
    } else next.products.push({ ...cmd, id, stock: 0, active: true });
  } else if (cmd.kind === "archive") {
    const p = next.products.find((p) => p.id === cmd.productId && p.active);
    if (!p) throw new Error("Produto não encontrado.");
    if (p.stock !== 0)
      throw new Error("Só é possível arquivar produtos sem estoque.");
    p.active = false;
  } else if (cmd.kind === "expense")
    next.expenses.push({ ...cmd, id, actor: actor.name, createdAt });
  else if (cmd.kind === "batch")
    cmd.items.forEach((item, i) =>
      registerMovement(
        next,
        item,
        cmd.operation,
        cmd,
        actor,
        `${id}-${i}`,
        createdAt,
      ),
    );
  else registerMovement(next, cmd, cmd.kind, cmd, actor, id, createdAt);
  next.version += 1;
  return next;
}
// Uma movimentação, compartilhada pelo comando simples e pelo lote. Os itens de
// um lote são aplicados em sequência: o custo médio e o estoque de cada linha já
// enxergam as linhas anteriores da mesma remessa.
function registerMovement(
  store: Store,
  item: { productId: string; quantity: number; unitPrice: number },
  kind: "sale" | "purchase",
  shared: { date: string; party: string },
  actor: User,
  id: string,
  createdAt: string,
) {
  const p = store.products.find((p) => p.id === item.productId && p.active);
  if (!p) throw new Error("Produto não encontrado.");
  if (kind === "sale" && p.stock < item.quantity)
    throw new Error(
      `Estoque insuficiente de ${p.name}. Disponível: ${p.stock} unidades.`,
    );
  const lastDate = store.movements
    .filter((m) => m.productId === p.id)
    .reduce((last, m) => (m.date > last ? m.date : last), "");
  if (shared.date < lastDate)
    throw new Error(
      "A data deve ser igual ou posterior à última movimentação deste produto.",
    );
  if (kind === "purchase") {
    if (p.stock + item.quantity > 100_000)
      throw new Error("Limite de estoque excedido.");
    p.cost = Math.round(
      (p.stock * p.cost + item.quantity * item.unitPrice) /
        (p.stock + item.quantity),
    );
  }
  store.movements.push({
    id,
    productId: p.id,
    productName: p.name,
    kind,
    quantity: item.quantity,
    unitPrice: item.unitPrice,
    unitCost: kind === "sale" ? p.cost : item.unitPrice,
    tax: kind === "sale" ? p.tax : 0,
    date: shared.date,
    party: shared.party,
    actor: actor.name,
    createdAt,
  });
  p.stock += kind === "sale" ? -item.quantity : item.quantity;
}
export function summarize(store: Store, from: string, to: string) {
  const movements = store.movements.filter(
    (m) => m.date >= from && m.date <= to,
  );
  const sales = movements.filter((m) => m.kind === "sale");
  const revenue = sales.reduce((a, m) => a + m.quantity * m.unitPrice, 0);
  const cogs = sales.reduce((a, m) => a + m.quantity * m.unitCost, 0);
  const taxes = sales.reduce(
    (a, m) => a + Math.round((m.quantity * m.unitPrice * m.tax) / 100),
    0,
  );
  const expenses = store.expenses
    .filter((e) => e.date >= from && e.date <= to)
    .reduce((a, e) => a + e.amount, 0);
  const restocks = movements.filter((m) => m.kind === "purchase");
  const purchases = restocks.reduce((a, m) => a + m.quantity * m.unitPrice, 0);
  return {
    revenue,
    cogs,
    taxes,
    expenses,
    purchases,
    profit: revenue - cogs - taxes - expenses,
    cash: revenue - purchases - taxes - expenses,
    unitsSold: sales.reduce((a, m) => a + m.quantity, 0),
    unitsBought: restocks.reduce((a, m) => a + m.quantity, 0),
    sales,
    restocks,
  };
}
export function demoStore(): Store {
  const products: Product[] = [
    {
      id: "abc4",
      name: "Extintor Pó ABC",
      sku: "EXT-001",
      type: "Pó ABC",
      capacity: "4 kg",
      cost: 6200,
      price: 11000,
      tax: 12,
      stock: 28,
      minimum: 10,
      active: true,
    },
    {
      id: "co2",
      name: "Extintor CO₂",
      sku: "EXT-002",
      type: "CO₂",
      capacity: "6 kg",
      cost: 18500,
      price: 32000,
      tax: 12,
      stock: 14,
      minimum: 5,
      active: true,
    },
    {
      id: "abc6",
      name: "Extintor Pó ABC",
      sku: "EXT-003",
      type: "Pó ABC",
      capacity: "6 kg",
      cost: 7800,
      price: 13500,
      tax: 12,
      stock: 20,
      minimum: 8,
      active: true,
    },
    {
      id: "agua",
      name: "Extintor Água",
      sku: "EXT-004",
      type: "Água",
      capacity: "10 L",
      cost: 9500,
      price: 16500,
      tax: 12,
      stock: 4,
      minimum: 5,
      active: true,
    },
    {
      id: "espuma",
      name: "Extintor Espuma",
      sku: "EXT-005",
      type: "Espuma",
      capacity: "9 L",
      cost: 11000,
      price: 19000,
      tax: 12,
      stock: 3,
      minimum: 5,
      active: true,
    },
  ];
  const movements: Movement[] = Array.from({ length: 24 }, (_, i) => {
    const p = products[i % 5];
    return {
      id: `demo-${i}`,
      productId: p.id,
      productName: p.name,
      kind: "sale",
      quantity: [3, 2, 5, 1, 4, 2, 3][i % 7],
      unitPrice: p.price,
      unitCost: p.cost,
      tax: p.tax,
      date: daysBefore(today(), 23 - i),
      party: [
        "Mercado Bom Preço",
        "Auto Peças Silva",
        "Condomínio Planalto",
        "Farmácia Popular",
      ][i % 4],
      actor: "Demonstração",
      createdAt: new Date().toISOString(),
    };
  });
  // Algumas entradas de estoque para a demonstração mostrar também o volume
  // comprado no período, e não só o vendido.
  const restocks: Movement[] = (
    [
      ["abc4", 12, 6100, 18],
      ["co2", 6, 18200, 14],
      ["agua", 10, 9400, 9],
      ["espuma", 8, 10800, 4],
    ] as const
  ).map(([productId, quantity, unitPrice, ago], i) => {
    const p = products.find((x) => x.id === productId)!;
    return {
      id: `demo-entrada-${i}`,
      productId: p.id,
      productName: p.name,
      kind: "purchase",
      quantity,
      unitPrice,
      unitCost: unitPrice,
      tax: 0,
      date: daysBefore(today(), ago),
      party: ["Distribuidora Central", "Extintores Brasil"][i % 2],
      actor: "Demonstração",
      createdAt: new Date().toISOString(),
    };
  });
  return {
    version: 0,
    products,
    movements: [...movements, ...restocks].sort((a, b) =>
      a.date.localeCompare(b.date),
    ),
    expenses: [
      {
        id: "demo-exp",
        description: "Transporte e entregas",
        amount: 14500,
        date: daysBefore(today(), 2),
        actor: "Demonstração",
        createdAt: new Date().toISOString(),
      },
    ],
  };
}
