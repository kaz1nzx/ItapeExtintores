import test from "node:test";
import assert from "node:assert/strict";
import { applyCommand, commandSchema, emptyStore, reminderNeedsAttention, withDefaults, type Store, type User } from "../src/lib/domain";

const user: User = { id: "owner", name: "Administrador", role: "admin" };
const command = { kind: "reminder", title: "  Orçamento para cliente X  ", notes: "  Confirmar medidas  ", date: "2028-10-21" };

test("salva lembrete futuro na data escolhida, sem alterar estoque ou validades", () => {
  const before = emptyStore();
  const after = applyCommand(before, command, user, "reminder-1");
  assert.equal(after.reminders[0].date, "2028-10-21");
  assert.equal(after.reminders[0].title, "Orçamento para cliente X");
  assert.equal(after.reminders[0].notes, "Confirmar medidas");
  assert.equal(after.reminders[0].status, "pending");
  assert.equal(after.version, 1);
  assert.equal(before.reminders.length, 0);
  assert.deepEqual(after.validities, []);
  assert.deepEqual(after.movements, []);
});

test("avisa com 29 dias, hoje e atrasados, mas não com 30 ou 31 dias", () => {
  const reminder = applyCommand(emptyStore(), command, user, "r").reminders[0];
  for (const [now, expected] of [["2028-09-20", false], ["2028-09-21", false], ["2028-09-22", true], ["2028-10-20", true], ["2028-10-21", true], ["2028-10-22", true]] as const)
    assert.equal(reminderNeedsAttention(reminder, now), expected, now);
  assert.equal(reminderNeedsAttention({ ...reminder, status: "done" }, "2028-10-21"), false);
});

test("concluir mantém histórico e remove aviso, rejeitando conclusão repetida", () => {
  const before = applyCommand(emptyStore(), command, user, "r");
  const after = applyCommand(before, { kind: "reminder_complete", reminderId: "r" }, user, "done");
  assert.equal(after.reminders.length, 1);
  assert.equal(after.reminders[0].status, "done");
  assert.equal(before.reminders[0].status, "pending");
  assert.equal(reminderNeedsAttention(after.reminders[0], "2028-10-21"), false);
  assert.throws(() => applyCommand(after, { kind: "reminder_complete", reminderId: "r" }, user, "again"), /já concluído/);
});

test("valida texto, limites e datas reais (inclusive ano bissexto)", () => {
  for (const change of [{ title: "  " }, { title: "x".repeat(121) }, { notes: "x".repeat(1001) }, { date: "2027-02-29" }, { date: "2028-02-30" }, { date: "2101-01-01" }, { date: "1999-12-31" }])
    assert.equal(commandSchema.safeParse({ ...command, ...change }).success, false);
  assert.equal(commandSchema.safeParse({ ...command, date: "2028-02-29" }).success, true);
});

test("aceita dados antigos sem lembretes", () => {
  const { reminders, ...legacy } = emptyStore();
  assert.deepEqual(withDefaults(legacy as Store).reminders, reminders);
});
