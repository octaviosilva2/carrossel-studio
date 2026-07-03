// Logica PURA de rate limit no login (sem I/O). A decisao de contar/bloquear vive
// aqui, isolada de headers()/signIn/Postgres — e o alvo dos testes unitarios do
// projeto (vitest, sem banco). O I/O fica no repositorio (login-attempts-repo.ts)
// e a orquestracao no signInAction. Falha fechado por design: o call site trata
// erro de leitura como bloqueio.

/** Numero de falhas na janela que dispara o bloqueio (por e-mail E por IP). */
export const MAX_ATTEMPTS = 5;

/** Tamanho da janela deslizante de contagem, em minutos. */
export const WINDOW_MINUTES = 15;

/** Sentinel de IP quando o x-forwarded-for esta ausente/vazio (decisao 1). */
export const UNKNOWN_IP = "unknown";

/**
 * Normaliza a chave de e-mail (trim + lowercase). Aplicada nos TRES pontos —
 * gravacao, contagem e limpeza — senao `User@x.com` e `user@x.com` viram chaves
 * distintas e o atacante contorna o limite alternando maiusculas. Idempotente.
 */
export function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

/**
 * Extrai o IP de origem do valor bruto do cabecalho `x-forwarded-for`. Pega o
 * PRIMEIRO IP da cadeia (o cliente original; os seguintes sao proxies). Cabecalho
 * ausente/vazio ou sem IP util => sentinel `"unknown"`. Funcao pura (nao le
 * headers()) — testavel sem contexto de request.
 */
export function parseClientIp(headerValue: string | null): string {
  if (!headerValue) {
    return UNKNOWN_IP;
  }
  // Primeiro IP da cadeia "1.2.3.4, 5.6.7.8" -> "1.2.3.4".
  const first = headerValue.split(",")[0]?.trim();
  return first ? first : UNKNOWN_IP;
}

/**
 * Decide o bloqueio a partir das duas contagens de falha na janela. Bloqueia se
 * QUALQUER uma atingir o limite (e-mail OU IP), independentemente da outra. Limite
 * e `>=` (o 5o ja bloqueia).
 */
export function isBlocked(emailFailCount: number, ipFailCount: number): boolean {
  return emailFailCount >= MAX_ATTEMPTS || ipFailCount >= MAX_ATTEMPTS;
}

/**
 * Corte da janela deslizante: o instante a partir do qual as falhas contam. Retorna
 * `now - WINDOW_MINUTES`. A consulta filtra `created_at >= windowStart(now)`.
 */
export function windowStart(now: Date): Date {
  return new Date(now.getTime() - WINDOW_MINUTES * 60 * 1000);
}
