import test from "node:test";
import assert from "node:assert/strict";
import { sameOrigin } from "../src/lib/http";

function check(configured: string | undefined, origin: string | undefined) {
  const previous = process.env.APP_ORIGIN;
  try {
    if (configured === undefined) delete process.env.APP_ORIGIN;
    else process.env.APP_ORIGIN = configured;
    return sameOrigin(new Request("http://127.0.0.1:3000/api/auth", {
      method: "POST",
      headers: origin === undefined ? {} : { origin },
    }));
  } finally {
    if (previous === undefined) delete process.env.APP_ORIGIN;
    else process.env.APP_ORIGIN = previous;
  }
}

test("aceita a origem exata configurada", () => {
  assert.doesNotThrow(() => check("https://gestao.example", "https://gestao.example"));
});
test("aceita aliases e portas de loopback no desenvolvimento local", () => {
  for (const host of ["localhost", "127.0.0.1", "[::1]"])
    for (const port of ["3000", "3001"])
      assert.doesNotThrow(() => check("http://127.0.0.1:3000", `http://${host}:${port}`));
});
test("bloqueia protocolo diferente mesmo em loopback", () => {
  assert.throws(() => check("http://127.0.0.1:3000", "https://localhost:3000"), /não autorizada/);
});
test("bloqueia domínios externos e nomes parecidos com localhost", () => {
  for (const origin of ["https://evil.example", "http://localhost.evil.example:3000", "http://127.0.0.2:3000"])
    assert.throws(() => check("http://127.0.0.1:3000", origin), /não autorizada/);
});
test("não aceita localhost quando a origem configurada é pública", () => {
  assert.throws(() => check("https://gestao.example", "http://localhost:3000"), /não autorizada/);
});
test("bloqueia origens ausentes, opacas ou malformadas", () => {
  for (const origin of [undefined, "null", "invalid", "http://localhost:3000/path", "http://user@localhost:3000"])
    assert.throws(() => check("http://127.0.0.1:3000", origin), /não autorizada/);
});
test("configuração ausente ou inválida não libera acesso", () => {
  for (const configured of [undefined, "invalid"])
    assert.throws(() => check(configured, "http://localhost:3000"), /não autorizada/);
});
