import { z } from "zod";

// Sem compilar validações com eval: o CSP do site bloqueia eval, e o zod nem
// chega a testar (o teste gera um alerta de violação no navegador).
z.config({ jitless: true });

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
  quotationId?: string | null;
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
// Vencimento da recarga de extintores de um cliente. Nasce de uma venda (ou é
// registrado à mão, para recargas feitas fora do sistema) e fica pendente até
// ser renovado ou dispensado.
export type Validity = {
  id: string;
  client: string;
  phone: string;
  item: string;
  quantity: number;
  startDate: string;
  dueDate: string;
  status: "pending" | "renewed" | "dismissed";
  movementId: string | null;
  resolvedAt: string | null;
  createdAt: string;
};
export type Reminder = {
  id: string;
  title: string;
  notes: string;
  date: string;
  status: "pending" | "done";
  createdAt: string;
};
// Preferências da conta. A meta vale do mês em que foi definida em diante,
// até ser trocada: mudar a meta de outubro não reescreve a de setembro.
export type Settings = {
  goals?: Record<string, number>;
  rechargePrice?: number;
};
export type Store = {
  version: number;
  company: Company | null;
  settings: Settings;
  products: Product[];
  movements: Movement[];
  expenses: Expense[];
  validities: Validity[];
  reminders: Reminder[];
  quotations: Quotation[];
};
export type Company = {
  name: string; suffix: string; cnpj: string; address: string;
  city: string; email: string; contact: string; phone: string;
};
export type Quotation = {
  id: string;
  number: number;
  date: string;
  client: string;
  phone: string;
  paymentTerms: string;
  notes: string;
  company: Company;
  items: { productId: string; name: string; quantity: number; unitPrice: number }[];
  createdAt: string;
};
// Padrão para contas sem cadastro. Cada orçamento preserva os dados da emissão.
export const QUOTATION_COMPANY: Quotation["company"] = {
  name: "",
  suffix: "",
  cnpj: "",
  address: "",
  city: "",
  email: "",
  contact: "",
  phone: "",
};
export const DEFAULT_PAYMENT_TERMS = "PIX, Transferência Bancária, Boleto 28 dias";
export type User = { id: string; name: string; role: "admin" | "operator" };
export const emptyStore = (): Store => ({
  version: 0,
  company: null,
  settings: {},
  products: [],
  movements: [],
  expenses: [],
  validities: [],
  reminders: [],
  quotations: [],
});
// Um banco ainda sem a atualização de validades não devolve a lista.
export const withDefaults = (store: Store): Store => ({
  ...store,
  company: store.company ? { ...QUOTATION_COMPANY, ...store.company } : null,
  settings: store.settings ?? {},
  validities: store.validities ?? [],
  reminders: store.reminders ?? [],
  quotations: store.quotations ?? [],
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
// Validade da recarga, contada a partir da venda ou da recarga.
export const VALIDITY_MONTHS = 12;
// A partir de quantos dias antes do vencimento o cliente entra na lista de
// contato.
export const ALERT_DAYS = 30;
// Lembretes entram no aviso com menos de 30 dias e permanecem até a conclusão.
export function reminderNeedsAttention(reminder: Reminder, now = today()) {
  return reminder.status === "pending" && daysBetween(now, reminder.date) < ALERT_DAYS;
}
export function addMonths(date: string, months: number) {
  const [y, m, d] = date.split("-").map(Number);
  const index = y * 12 + (m - 1) + months;
  const year = Math.floor(index / 12);
  const month = index % 12;
  // Mesmo corte de fim de mês do Postgres em date + interval: 29/02 + 12
  // meses vira 28/02, e o servidor e a tela sempre concordam na data.
  const last = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(Math.min(d, last)).padStart(2, "0")}`;
}
export const daysBetween = (from: string, to: string) =>
  Math.round(
    (Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) /
      86400000,
  );
export type Urgency = "overdue" | "soon" | "upcoming" | "later";
export function urgency(dueDate: string, now = today()): Urgency {
  const d = daysBetween(now, dueDate);
  return d < 0
    ? "overdue"
    : d <= ALERT_DAYS
      ? "soon"
      : d <= 90
        ? "upcoming"
        : "later";
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
const phone = z
  .string()
  .trim()
  .max(30)
  .regex(/^[0-9+(). -]*$/, "Informe um telefone válido.");
const quotationFields = z.object({
  paymentTerms: z.string().trim().min(1).max(240),
  notes: z.string().trim().max(1000),
});
export const companySchema = z.object({
  name: text,
  suffix: z.string().trim().max(40),
  cnpj: z.string().trim().max(30),
  address: z.string().trim().max(240),
  city: z.string().trim().max(120),
  email: z.union([z.literal(""), z.email().max(254)]),
  contact: z.string().trim().max(120),
  phone,
});
const month = z
  .string()
  .regex(/^\d{4}-(0[1-9]|1[0-2])$/)
  .refine((v) => v >= "2000-01" && v <= "2100-12", "Informe um mês válido.");
export const commandSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("company"), company: companySchema }),
  // Meta de vendas a partir do mês; 0 encerra a meta desse mês em diante.
  z.object({ kind: z.literal("goal"), month, amount: cents }),
  // Valor médio da recarga, usado no potencial da previsão de recargas.
  z.object({ kind: z.literal("recharge_price"), amount: cents }),
  z.object({
    kind: z.literal("reminder"),
    title: text,
    notes: z.string().trim().max(1000),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((v) => {
      const d = new Date(`${v}T12:00:00Z`);
      return !isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v &&
        v >= "2000-01-01" && v <= "2100-12-31";
    }, "Informe uma data válida para o lembrete."),
  }),
  z.object({ kind: z.literal("reminder_complete"), reminderId: text }),
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
  // Em vendas, `track` (padrão: sim) agenda a validade de 12 meses para o
  // cliente, e `phone` guarda o contato para o aviso. Compras ignoram ambos.
  z.object({
    kind: z.enum(["sale", "purchase"]),
    productId: text,
    quantity,
    unitPrice: cents,
    date,
    party: text,
    phone: phone.optional(),
    track: z.boolean().optional(),
    quotation: quotationFields.optional(),
  }),
  // Vários produtos na mesma remessa. A data e a contraparte são
  // compartilhadas; cada item vira uma movimentação, tudo em uma transação.
  z.object({
    kind: z.literal("batch"),
    operation: z.enum(["sale", "purchase"]),
    date,
    party: text,
    phone: phone.optional(),
    track: z.boolean().optional(),
    quotation: quotationFields.optional(),
    items: z
      .array(z.object({ productId: text, quantity, unitPrice: cents }))
      .min(1)
      .max(20),
  }),
  // Validade registrada à mão: recargas e extintores que não passaram por uma
  // venda no sistema.
  z.object({
    kind: z.literal("validity"),
    client: text,
    phone: phone.optional(),
    item: text,
    quantity,
    startDate: date,
  }),
  z.object({ kind: z.literal("validity_renew"), validityId: text, date }),
  z.object({ kind: z.literal("validity_dismiss"), validityId: text }),
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
  next.validities ??= [];
  next.reminders ??= [];
  next.quotations ??= [];
  next.settings ??= {};
  if (cmd.kind === "company") {
    next.company = { ...cmd.company };
  } else if (cmd.kind === "goal") {
    next.settings.goals = { ...next.settings.goals, [cmd.month]: cmd.amount };
  } else if (cmd.kind === "recharge_price") {
    next.settings.rechargePrice = cmd.amount;
  } else if (cmd.kind === "product") {
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
  } else if (cmd.kind === "reminder")
    next.reminders.push({ id, title: cmd.title, notes: cmd.notes, date: cmd.date, status: "pending", createdAt });
  else if (cmd.kind === "reminder_complete") {
    const reminder = next.reminders.find((r) => r.id === cmd.reminderId && r.status === "pending");
    if (!reminder) throw new Error("Lembrete não encontrado ou já concluído.");
    reminder.status = "done";
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
  else if (cmd.kind === "validity")
    next.validities.push({
      id,
      client: cmd.client,
      phone: cmd.phone ?? "",
      item: cmd.item,
      quantity: cmd.quantity,
      startDate: cmd.startDate,
      dueDate: addMonths(cmd.startDate, VALIDITY_MONTHS),
      status: "pending",
      movementId: null,
      resolvedAt: null,
      createdAt,
    });
  else if (cmd.kind === "validity_renew" || cmd.kind === "validity_dismiss") {
    const v = next.validities.find(
      (v) => v.id === cmd.validityId && v.status === "pending",
    );
    if (!v) throw new Error("Validade não encontrada ou já resolvida.");
    if (cmd.kind === "validity_dismiss") {
      v.status = "dismissed";
      v.resolvedAt = today();
    } else {
      if (cmd.date < v.startDate)
        throw new Error(
          "A renovação deve ser igual ou posterior ao início da validade.",
        );
      v.status = "renewed";
      v.resolvedAt = cmd.date;
      // A recarga reinicia o ciclo: um novo lembrete para o mesmo cliente.
      next.validities.push({
        ...v,
        id,
        startDate: cmd.date,
        dueDate: addMonths(cmd.date, VALIDITY_MONTHS),
        status: "pending",
        movementId: null,
        resolvedAt: null,
        createdAt,
      });
    }
  } else registerMovement(next, cmd, cmd.kind, cmd, actor, id, createdAt);
  if (cmd.kind === "sale" || (cmd.kind === "batch" && cmd.operation === "sale")) {
    const items = cmd.kind === "batch" ? cmd.items : [cmd];
    next.quotations.push({
      id,
      number: next.quotations.filter((q) => q.date.slice(0, 4) === cmd.date.slice(0, 4))
        .reduce((max, q) => Math.max(max, q.number), 0) + 1,
      date: cmd.date,
      client: cmd.party,
      phone: cmd.phone ?? "",
      paymentTerms: cmd.quotation?.paymentTerms ?? DEFAULT_PAYMENT_TERMS,
      notes: cmd.quotation?.notes ?? "",
      company: { ...(next.company ?? QUOTATION_COMPANY) },
      items: items.map((item) => {
        const product = next.products.find((p) => p.id === item.productId)!;
        return { productId: product.id, name: `${product.name} · ${product.capacity}`, quantity: item.quantity, unitPrice: item.unitPrice };
      }),
      createdAt,
    });
    const movementIds = new Set(items.map((_, i) => cmd.kind === "batch" ? `${id}-${i}` : id));
    next.movements.forEach((movement) => { if (movementIds.has(movement.id)) movement.quotationId = id; });
  }
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
  shared: { date: string; party: string; phone?: string; track?: boolean },
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
  // Cada extintor vendido volta a ser negócio em 12 meses: a validade já nasce
  // agendada para o cliente da venda.
  if (kind === "sale" && shared.track !== false)
    store.validities.push({
      id: `${id}-validade`,
      client: shared.party,
      phone: shared.phone ?? "",
      item: `${p.name} · ${p.capacity}`,
      quantity: item.quantity,
      startDate: shared.date,
      dueDate: addMonths(shared.date, VALIDITY_MONTHS),
      status: "pending",
      movementId: id,
      resolvedAt: null,
      createdAt,
    });
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
  // Vendas do mês anterior, para a comparação com o período anterior ter base.
  const earlier: Movement[] = Array.from({ length: 20 }, (_, i) => {
    const p = products[(i + 2) % 5];
    return {
      id: `demo-anterior-${i}`,
      productId: p.id,
      productName: p.name,
      kind: "sale",
      quantity: [2, 1, 3, 2, 1, 3, 2][i % 7],
      unitPrice: p.price,
      unitCost: p.cost,
      tax: p.tax,
      date: daysBefore(today(), 45 - i),
      party: [
        "Padaria Pão Quente",
        "Clínica Vida",
        "Oficina do Zé",
        "Hotel Serra Azul",
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
  // Carteira fictícia de clientes. Os vencimentos do histórico caem entre
  // algumas semanas atrás e os próximos meses, para o calendário da
  // demonstração ter vencidos, avisos e próximos.
  const book: [string, string][] = [
    ["Mercado Bom Preço", "(11) 98761-2040"],
    ["Auto Peças Silva", "(11) 97654-3321"],
    ["Condomínio Planalto", "(11) 99812-7765"],
    ["Farmácia Popular", "(11) 96543-1188"],
    ["Escola Municipal Aurora", "(11) 3345-9087"],
    ["Padaria Pão Quente", "(11) 98420-5566"],
    ["Clínica Vida", "(11) 97731-4402"],
    ["Oficina do Zé", "(11) 99108-2290"],
    ["Restaurante Sabor Caseiro", "(11) 96690-7713"],
    ["Hotel Serra Azul", "(11) 3021-4455"],
    ["Academia Movimento", "(11) 98877-6610"],
  ];
  const phoneOf = new Map(book);
  const history: Validity[] = [383, 371, 366, 362, 355, 349, 341, 330, 318, 301, 290].map(
    (ago, i) => {
      const [client, phone] = book[(i + 4) % book.length];
      const p = products[i % products.length];
      const startDate = daysBefore(today(), ago);
      return {
        id: `demo-validade-${i}`,
        client,
        phone,
        item: `${p.name} · ${p.capacity}`,
        quantity: [4, 2, 6, 1, 3, 8, 2, 5, 3, 2, 4][i],
        startDate,
        dueDate: addMonths(startDate, VALIDITY_MONTHS),
        status: "pending",
        movementId: null,
        resolvedAt: null,
        createdAt: new Date().toISOString(),
      };
    },
  );
  const fromSales: Validity[] = [...earlier, ...movements].map((m) => {
    const p = products.find((x) => x.id === m.productId)!;
    return {
      id: `${m.id}-validade`,
      client: m.party,
      phone: phoneOf.get(m.party) ?? "",
      item: `${p.name} · ${p.capacity}`,
      quantity: m.quantity,
      startDate: m.date,
      dueDate: addMonths(m.date, VALIDITY_MONTHS),
      status: "pending",
      movementId: m.id,
      resolvedAt: null,
      createdAt: new Date().toISOString(),
    };
  });
  return {
    version: 0,
    company: null,
    settings: { goals: { [today().slice(0, 7)]: 1800000 }, rechargePrice: 4500 },
    products,
    validities: [...history, ...fromSales],
    reminders: [],
    quotations: [],
    movements: [...earlier, ...movements, ...restocks].sort((a, b) =>
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
