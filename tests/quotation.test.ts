import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { applyCommand, emptyStore, commandSchema, today, QUOTATION_COMPANY, type Quotation, type User } from "../src/lib/domain";
import { createQuotationPdf, quotationFilename, quotationTotal } from "../src/lib/quotation-pdf";

const user: User = { id: "owner", name: "Administrador", role: "admin" };
function stocked() {
  const state = emptyStore();
  state.products.push({ id: "p", name: "Extintor CO₂", capacity: "6 kg", sku: "CO2", type: "CO₂", cost: 5000, price: 11099, tax: 10, stock: 20, minimum: 2, active: true });
  return state;
}
const sale = { kind: "sale", productId: "p", quantity: 2, unitPrice: 11099, date: today(), party: "Clínica São João", phone: "(15) 99999-9999", quotation: { paymentTerms: "PIX à vista", notes: "Entregar após confirmação." } };

test("venda salva orçamento com dados históricos e valores em centavos", () => {
  const before = stocked();
  const after = applyCommand(before, sale, user, "venda");
  const q = after.quotations[0];
  assert.equal(q.number, 1);
  assert.equal(q.client, sale.party);
  assert.equal(q.phone, sale.phone);
  assert.equal(q.paymentTerms, sale.quotation.paymentTerms);
  assert.equal(q.notes, sale.quotation.notes);
  assert.equal(q.items[0].name, "Extintor CO₂ · 6 kg");
  assert.equal(quotationTotal(q), 22198);
  assert.equal(after.movements[0].quotationId, "venda");
  after.products[0].name = "Produto alterado";
  after.products[0].price = 99999;
  assert.equal(q.items[0].name, "Extintor CO₂ · 6 kg");
  assert.equal(quotationTotal(q), 22198);
  assert.equal(before.quotations.length, 0);
});

test("lote gera um único orçamento com todos os itens e vínculos", () => {
  const after = applyCommand(stocked(), { kind: "batch", operation: "sale", party: "Cliente", date: today(), items: [{ productId: "p", quantity: 2, unitPrice: 11099 }, { productId: "p", quantity: 1, unitPrice: 9999 }] }, user, "lote");
  assert.equal(after.quotations.length, 1);
  assert.equal(after.quotations[0].items.length, 2);
  assert.equal(quotationTotal(after.quotations[0]), 32197);
  assert.deepEqual(after.movements.map((m) => m.quotationId), ["lote", "lote"]);
  assert.equal(after.products[0].stock, 17);
});

test("numeração é sequencial por ano; compras e vendas recusadas não geram orçamento", () => {
  const first = applyCommand(stocked(), sale, user, "primeira");
  const second = applyCommand(first, sale, user, "segunda");
  assert.deepEqual(second.quotations.map((q) => q.number), [1, 2]);
  const otherYear = stocked();
  otherYear.quotations = [{ ...first.quotations[0], date: "2000-01-01", number: 98 }];
  assert.equal(applyCommand(otherYear, sale, user, "nova").quotations[1].number, 1);
  assert.throws(() => applyCommand(first, { ...sale, quantity: 999 }, user, "falha"), /Estoque insuficiente/);
  assert.equal(first.quotations.length, 1);
  assert.equal(applyCommand(stocked(), { ...sale, kind: "purchase" }, user, "compra").quotations.length, 0);
  assert.equal(commandSchema.safeParse({ ...sale, quotation: { paymentTerms: " ", notes: "" } }).success, false);
});

const fonts = {
  regular: readFileSync(new URL("../public/fonts/NotoSans-Regular.ttf", import.meta.url)).toString("base64"),
  bold: readFileSync(new URL("../public/fonts/NotoSans-Bold.ttf", import.meta.url)).toString("base64"),
};
export const sampleQuotation: Quotation = {
  id: "teste", number: 42, date: "2026-09-24", client: "Clínica São João", phone: "(15) 99999-9999",
  paymentTerms: "PIX à vista", notes: "Entrega em até 5 dias úteis.\nConfirmar com a recepção.", company: QUOTATION_COMPANY,
  items: [{ productId: "p", name: "Extintor CO₂ · 6 kg", quantity: 2, unitPrice: 11099 }], createdAt: "2026-09-24T12:00:00Z",
};

test("PDF A4 válido com fonte incorporada e nome consistente", async () => {
  const pdf = await createQuotationPdf(sampleQuotation, fonts);
  const bytes = Buffer.from(pdf.output("arraybuffer"));
  assert.equal(bytes.subarray(0, 5).toString(), "%PDF-");
  assert.equal(pdf.getNumberOfPages(), 1);
  assert.match(bytes.toString("latin1"), /FontFile2/);
  assert.equal(quotationFilename(sampleQuotation), "orcamento-2026-0042.pdf");
});

test("PDF pagina itens e observações longas sem perder o total", async () => {
  const quotation = { ...sampleQuotation, items: Array.from({ length: 20 }, (_, i) => ({ productId: `${i}`, name: `Item ${i + 1}: ${"Descrição de extintor para prevenção a incêndio ".repeat(5)}`, quantity: 100000, unitPrice: 100000000 })), notes: "Observação importante sobre entrega e pagamento. ".repeat(20) };
  const pdf = await createQuotationPdf(quotation, fonts);
  assert.ok(pdf.getNumberOfPages() > 1);
  assert.equal(quotationTotal(quotation), 200000000000000);
  assert.ok(pdf.output("arraybuffer").byteLength > 10000);
});
