import test from "node:test";
import assert from "node:assert/strict";
import { createLimiter } from "../src/lib/rate-limit";
import { clientIp, readBody } from "../src/lib/http";
import { contentSecurityPolicy } from "../src/lib/security";

test("limite de tentativas bloqueia na N-ésima falha e libera quando a janela passa", () => {
  const limiter = createLimiter({ limit: 3, windowMs: 60_000 });
  const t = 1_000_000;
  limiter.fail("a@x.com", t);
  limiter.fail("a@x.com", t + 1000);
  assert.equal(limiter.wait("a@x.com", t + 2000), 0);
  limiter.fail("a@x.com", t + 2000);
  // Bloqueado até a primeira falha sair da janela de 60 s.
  assert.equal(limiter.wait("a@x.com", t + 2000), 58);
  assert.equal(limiter.wait("a@x.com", t + 59_999), 1);
  assert.equal(limiter.wait("a@x.com", t + 60_000), 0);
  // Outra chave não é afetada; sucesso zera a chave.
  assert.equal(limiter.wait("b@x.com", t + 2000), 0);
  limiter.reset("a@x.com");
  assert.equal(limiter.wait("a@x.com", t + 2000), 0);
});

test("limite de tentativas não cresce a memória sem fim", () => {
  const limiter = createLimiter({ limit: 1, windowMs: 60_000, maxKeys: 3 });
  for (const key of ["1", "2", "3", "4"]) limiter.fail(key, 0);
  // A chave mais antiga saiu para caber a nova.
  assert.equal(limiter.wait("1", 1), 0);
  assert.ok(limiter.wait("4", 1) > 0);
});

const post = (body: BodyInit | null, headers: Record<string, string> = {}) =>
  new Request("http://127.0.0.1:3000/api/store", { method: "POST", body, headers, duplex: "half" } as RequestInit);

test("leitura do corpo para no limite, mesmo sem Content-Length", async () => {
  assert.equal(await readBody(post('{"ok":true}'), 100), '{"ok":true}');
  assert.equal(await readBody(post("x".repeat(101)), 100), null);
  assert.equal(await readBody(post("", { "content-length": "999999" }), 100), null);
  // Corpo em partes, sem tamanho declarado: corta ao passar do limite.
  const stream = new ReadableStream({
    start(controller) {
      for (let i = 0; i < 50; i++) controller.enqueue(new TextEncoder().encode("x".repeat(10)));
      controller.close();
    },
  });
  assert.equal(await readBody(post(stream), 100), null);
  assert.equal(await readBody(post("ação ✓"), 100), "ação ✓");
});

test("IP do visitante vem do proxy; sem ele, fica desconhecido", () => {
  const req = (headers: Record<string, string>) => new Request("http://x/", { headers });
  assert.equal(clientIp(req({ "x-forwarded-for": "203.0.113.7, 10.0.0.1" })), "203.0.113.7");
  assert.equal(clientIp(req({ "x-real-ip": "198.51.100.2" })), "198.51.100.2");
  assert.equal(clientIp(req({})), null);
});

test("CSP: script só com nonce, sem inline nem eval em produção", () => {
  const csp = contentSecurityPolicy("abc123", { dev: false, https: true });
  assert.match(csp, /script-src 'self' 'nonce-abc123' 'strict-dynamic';/);
  assert.doesNotMatch(csp, /script-src[^;]*'unsafe-inline'/);
  assert.doesNotMatch(csp, /unsafe-eval/);
  assert.match(csp, /frame-ancestors 'none'/);
  assert.match(csp, /object-src 'none'/);
  assert.match(csp, /upgrade-insecure-requests/);
  const dev = contentSecurityPolicy("abc123", { dev: true, https: false });
  assert.match(dev, /'unsafe-eval'/);
  assert.doesNotMatch(dev, /upgrade-insecure-requests/);
});

test("telefone: a regra do campo é válida no navegador e igual à do servidor", async () => {
  const { PHONE_PATTERN, commandSchema } = await import("../src/lib/domain");
  // O navegador compila o atributo pattern com a flag v; regra inválida é ignorada.
  const field = new RegExp(`^(?:${PHONE_PATTERN})$`, "v");
  const server = (phone: string) =>
    commandSchema.safeParse({ kind: "validity", client: "C", phone, item: "I", quantity: 1, startDate: "2026-01-10" }).success;
  for (const phone of ["(11) 98765-4321", "+55 11 3333.4444", "", "11987654321", "ligar amanhã", "11#999", "abc"])
    assert.equal(field.test(phone), server(phone), phone);
});

test("formulário inválido mostra mensagem em português, não o detalhe do validador", async () => {
  const { applyCommand, emptyStore } = await import("../src/lib/domain");
  const user = { id: "u", name: "Adm", role: "admin" as const };
  const expense = { kind: "expense", description: "   ", amount: 100, date: "2026-01-10" };
  assert.throws(() => applyCommand(emptyStore(), expense, user, "x"), (e: Error) =>
    e.message.startsWith("Confira os campos") && !e.message.includes("{"));
  const validity = { kind: "validity", client: "C", phone: "ligar amanhã", item: "I", quantity: 1, startDate: "2026-01-10" };
  assert.throws(() => applyCommand(emptyStore(), validity, user, "y"), /^Error: Informe um telefone válido\.$/);
});

test("erro de rede ou resposta que não é JSON vira aviso claro", async () => {
  const { problem } = await import("../src/components/primitives");
  const offline = "Sem resposta do servidor. Verifique a conexão e tente novamente.";
  assert.equal(problem(new TypeError("Failed to fetch")), offline);
  assert.equal(problem(new SyntaxError("Unexpected token '<'")), offline);
  assert.equal(problem(Object.assign(new Error("signal timed out"), { name: "TimeoutError" })), offline);
  assert.equal(problem(new Error("")), offline);
  assert.equal(problem(new Error("Estoque insuficiente.")), "Estoque insuficiente.");
});
