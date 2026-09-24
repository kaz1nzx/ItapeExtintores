import test from "node:test";
import assert from "node:assert/strict";
import { applyCommand, companySchema, emptyStore, QUOTATION_COMPANY, today, withDefaults, type Store, type User } from "../src/lib/domain";

const user: User = { id: "owner", name: "Administrador", role: "admin" };
const company = { ...QUOTATION_COMPANY, name: "Empresa A", cnpj: "48.936.509/0001-77", email: "contato@example.com", address: "Rua Um, 10", city: "São Paulo / SP", contact: "Contato A", phone: "(11) 99999-9999" };

test("cadastro pertence ao estado da conta e não altera outros registros", () => {
  const before = emptyStore();
  const after = applyCommand(before, { kind: "company", company }, user, "perfil");
  assert.deepEqual(after.company, company);
  assert.equal(before.company, null);
  assert.equal(emptyStore().company, null);
  assert.equal(after.version, 1);
  assert.deepEqual(after.products, before.products);
  assert.deepEqual(after.movements, before.movements);
  assert.deepEqual(after.quotations, before.quotations);
});

test("cada orçamento preserva a empresa da emissão após editar o cadastro", () => {
  const state = applyCommand(emptyStore(), { kind: "company", company }, user, "perfil");
  state.products.push({ id: "p", name: "Extintor", capacity: "4 kg", sku: "P1", type: "ABC", cost: 5000, price: 10000, tax: 0, stock: 3, minimum: 0, active: true });
  const sale = { kind: "sale", productId: "p", quantity: 1, unitPrice: 10000, party: "Cliente", date: today(), track: false };
  const first = applyCommand(state, sale, user, "primeira");
  const edited = applyCommand(first, { kind: "company", company: { ...company, name: "Empresa B" } }, user, "edicao");
  const second = applyCommand(edited, sale, user, "segunda");
  assert.equal(second.quotations[0].company.name, "Empresa A");
  assert.equal(second.quotations[1].company.name, "Empresa B");
  assert.equal(second.quotations[1].company.phone, company.phone);
  assert.equal(first.company?.name, "Empresa A");
});

test("cadastro valida campos sem exigir informações ainda desconhecidas", () => {
  assert.ok(companySchema.safeParse({ ...QUOTATION_COMPANY, name: "Empresa" }).success);
  assert.equal(companySchema.safeParse({ ...company, name: " " }).success, false);
  assert.equal(companySchema.safeParse({ ...company, email: "invalido" }).success, false);
  assert.equal(companySchema.safeParse({ ...company, phone: "abc" }).success, false);
  assert.equal(companySchema.safeParse({ ...company, address: "x".repeat(241) }).success, false);
  assert.throws(() => applyCommand(emptyStore(), { kind: "company", company }, { ...user, role: "operator" }, "proibido"), /administradores/);
});

test("conta antiga sem cadastro continua acessível", () => {
  const { company: _company, ...legacy } = emptyStore();
  assert.equal(withDefaults(legacy as Store).company, null);
});
