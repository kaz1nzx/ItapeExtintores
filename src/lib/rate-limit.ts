// Limite de tentativas em memória, com janela deslizante. Vale por processo:
// suficiente para um servidor (npm start). Com várias instâncias, cada uma
// conta as suas, e o limite do Supabase continua valendo por trás.
export function createLimiter({
  limit,
  windowMs,
  maxKeys = 10_000,
}: {
  limit: number;
  windowMs: number;
  maxKeys?: number;
}) {
  const hits = new Map<string, number[]>();
  function recent(key: string, now: number) {
    const list = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
    if (list.length) hits.set(key, list);
    else hits.delete(key);
    return list;
  }
  return {
    // Segundos até poder tentar de novo; 0 quando está liberado.
    wait(key: string, now = Date.now()) {
      const list = recent(key, now);
      return list.length >= limit
        ? Math.max(1, Math.ceil((list[list.length - limit] + windowMs - now) / 1000))
        : 0;
    },
    fail(key: string, now = Date.now()) {
      const list = recent(key, now);
      list.push(now);
      hits.set(key, list);
      // Muitas chaves (vários IPs ou e-mails) não crescem a memória sem fim:
      // a mais antiga sai primeiro.
      if (hits.size > maxKeys) hits.delete(hits.keys().next().value!);
    },
    reset(key: string) {
      hits.delete(key);
    },
  };
}
