// Política de conteúdo por requisição. Script só roda com o nonce desta página
// (e o que ele carregar, via 'strict-dynamic'): um script injetado não tem o
// nonce e é bloqueado. Estilo inline segue permitido porque os componentes
// usam style={...}; o risco que a política fecha é o de script.
export function contentSecurityPolicy(
  nonce: string,
  { dev, https }: { dev: boolean; https: boolean },
) {
  return [
    "default-src 'self'",
    // Em desenvolvimento o React usa eval para mostrar erros; em produção, não.
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${dev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",
    "font-src 'self'",
    "connect-src 'self'",
    "frame-ancestors 'none'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    ...(https ? ["upgrade-insecure-requests"] : []),
  ].join("; ");
}

export const newNonce = () => btoa(crypto.randomUUID());
