import { createServerClient } from "@supabase/ssr";
import { NextRequest, NextResponse } from "next/server";
import { contentSecurityPolicy, newNonce } from "@/lib/security";

// Rotas que usam a sessão: renovam o token e, nas privadas, exigem login.
const SESSION = ["/app", "/admin", "/login"];
const PRIVATE = ["/app", "/admin"];

export async function proxy(request: NextRequest) {
  const path = request.nextUrl.pathname;
  const https = (process.env.APP_ORIGIN ?? "").startsWith("https://");
  const nonce = newNonce();
  const csp = contentSecurityPolicy(nonce, {
    dev: process.env.NODE_ENV === "development",
    https,
  });
  // O Next lê o CSP do pedido e aplica o nonce aos próprios scripts.
  const next = () => {
    const headers = new Headers(request.headers);
    headers.set("x-nonce", nonce);
    headers.set("content-security-policy", csp);
    return NextResponse.next({ request: { headers } });
  };
  let response = next();
  const session = path.startsWith("/api/") || SESSION.includes(path);
  if (session && process.env.SUPABASE_URL && process.env.SUPABASE_PUBLISHABLE_KEY) {
    const client = createServerClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_PUBLISHABLE_KEY,
      {
        cookieOptions: { httpOnly: true, sameSite: "lax", secure: https },
        cookies: {
          getAll: () => request.cookies.getAll(),
          setAll(values) {
            values.forEach(({ name, value }) => request.cookies.set(name, value));
            response = next();
            values.forEach(({ name, value, options }) =>
              response.cookies.set(name, value, options),
            );
          },
        },
      },
    );
    const { data, error } = await client.auth.getClaims();
    if (PRIVATE.includes(path) && (error || !data?.claims?.sub)) {
      const redirect = NextResponse.redirect(new URL("/login", request.url));
      response.cookies.getAll().forEach((cookie) => redirect.cookies.set(cookie));
      redirect.headers.set("Cache-Control", "private, no-store");
      return redirect;
    }
    response.headers.set("Cache-Control", "private, no-store");
  }
  response.headers.set("Content-Security-Policy", csp);
  return response;
}
// Tudo menos arquivos estáticos e pré-carregamentos de link, que não precisam
// de CSP nem de sessão.
export const config = {
  matcher: [
    {
      source: "/((?!_next/static|_next/image|favicon.ico|icon.svg|apple-icon.png|fonts/).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
