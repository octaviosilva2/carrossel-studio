// Repositorio FINO sobre a tabela login_attempts (I/O do rate limit). server-only
// por transitividade (importa @/db, que declara `import "server-only"`), reforcado
// aqui explicitamente. A logica de decisao NAO vive aqui — mora em rate-limit.ts
// (puro). Este modulo so faz SELECT count / INSERT / DELETE parametrizados (Drizzle
// nunca concatena SQL — o IP e o e-mail sao texto opaco, zero risco de injecao).

import "server-only";
import { and, count, eq, gte } from "drizzle-orm";
import { db } from "@/db";
import { loginAttempts } from "@/db/schema";

/**
 * Conta falhas na janela por e-mail e por IP (dois SELECT count(*)). O corte da
 * janela (`windowStart`) vem pronto do call site — este repo nao decide a janela.
 * Se `email` e null (entrada sem e-mail valido — decisao 5), retorna `email: 0`
 * sem consultar. PROPAGA o erro: o call site (signInAction) decide fail-closed
 * (trata falha do SELECT como bloqueio — decisao 6).
 */
export async function countRecentFailures(
  email: string | null,
  ip: string,
  windowStart: Date,
): Promise<{ email: number; ip: number }> {
  // Contagem por e-mail — so quando ha chave de e-mail.
  const emailCount = email
    ? await db
        .select({ value: count() })
        .from(loginAttempts)
        .where(
          and(
            eq(loginAttempts.email, email),
            gte(loginAttempts.createdAt, windowStart),
          ),
        )
    : null;

  // Contagem por IP — sempre (o sentinel "unknown" tambem e uma chave valida).
  const ipCount = await db
    .select({ value: count() })
    .from(loginAttempts)
    .where(
      and(
        eq(loginAttempts.ipAddress, ip),
        gte(loginAttempts.createdAt, windowStart),
      ),
    );

  return {
    email: emailCount?.[0]?.value ?? 0,
    ip: ipCount[0]?.value ?? 0,
  };
}

/**
 * Registra UMA tentativa falha (INSERT). Best-effort (decisao 6): captura e loga o
 * erro internamente, NUNCA lanca para o call site — um write secundario nao pode
 * derrubar a resposta ao usuario. Loga so a mensagem tecnica, sem PII sensivel
 * (nunca a senha; e-mail em log de servidor interno e aceitavel — nao e segredo).
 */
export async function recordFailure(
  email: string | null,
  ip: string,
): Promise<void> {
  try {
    await db.insert(loginAttempts).values({ email, ipAddress: ip });
  } catch (error) {
    // Best-effort: log e segue. Nao lanca.
    console.error(
      "[login-attempts] falha ao registrar tentativa:",
      error instanceof Error ? error.message : error,
    );
  }
}

/**
 * Limpa (DELETE) as falhas de um e-mail apos login bem-sucedido — reset da janela
 * so daquele e-mail (nao toca linhas de IP: pode haver outros e-mails legitimos
 * atras do mesmo NAT — decisao 4). O e-mail JA vem normalizado do call site.
 * Best-effort: se o DELETE falhar, loga e nao impede o login (o usuario ja provou
 * a senha; as falhas antigas saem sozinhas da janela em <=15 min de qualquer forma).
 */
export async function clearFailuresForEmail(email: string): Promise<void> {
  try {
    await db.delete(loginAttempts).where(eq(loginAttempts.email, email));
  } catch (error) {
    // Best-effort: log e segue. Nao lanca.
    console.error(
      "[login-attempts] falha ao limpar tentativas do e-mail:",
      error instanceof Error ? error.message : error,
    );
  }
}
