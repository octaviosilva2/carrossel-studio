"use server";

// Server actions finas de autenticacao. Validam a entrada com Zod e delegam ao
// Auth.js. Erro de login e sempre GENERICO (nao revela se o email existe, nem se
// a causa foi excesso de tentativas — AC anti-enumeracao). O rate limit por
// e-mail/IP e orquestrado aqui: le o IP, checa bloqueio (fail-closed) antes de
// chamar signIn, e grava a falha (best-effort) no AuthError. A limpeza em sucesso
// vive no authorize (src/auth.ts) — unico ponto que sabe que a senha bateu.

import { headers } from "next/headers";
import { AuthError } from "next-auth";
import { z } from "zod";
import { signIn, signOut } from "@/auth";
import {
  countRecentFailures,
  recordFailure,
} from "@/lib/login-attempts-repo";
import {
  isBlocked,
  normalizeEmail,
  parseClientIp,
  windowStart,
} from "@/lib/rate-limit";

// Borda: credenciais vindas do form.
const signInSchema = z.object({
  email: z.email(),
  password: z.string().min(1),
});

// Valida SO o e-mail de forma isolada (decisao 5): grava falha pro e-mail apenas
// quando ele e sintaticamente valido; senao a tentativa conta so pro IP.
const emailSchema = z.email();

/** Mensagem unica em toda recusa — identica em todos os casos (anti-enumeracao). */
const GENERIC_ERROR = "E-mail ou senha inválidos";

/** Resultado do signInAction consumido pelo form (erro inline ou redirect). */
export interface SignInResult {
  error: string;
}

/**
 * Le o IP de origem via headers() (x-forwarded-for populado pela Vercel). NUNCA
 * lanca: fora de contexto de request, ou header ausente/vazio, cai para o sentinel
 * "unknown". A leitura do IP jamais pode derrubar o login.
 */
async function readClientIp(): Promise<string> {
  try {
    const headerList = await headers();
    return parseClientIp(headerList.get("x-forwarded-for"));
  } catch {
    // headers() fora de contexto de request lanca — cai para o sentinel.
    return parseClientIp(null);
  }
}

/**
 * Faz login por credenciais com rate limit. Ordem fixada (spec, decisao 2):
 * 1) le o IP (nunca lanca); 2) valida com Zod — se invalido, grava falha
 * (IP sempre; e-mail so se sintaticamente valido) e retorna generico sem chamar
 * signIn; 3) checa bloqueio (e-mail OU IP) fail-closed — se o SELECT lancar, trata
 * como bloqueado; 4) chama signIn; 5) em AuthError grava a falha (best-effort) e
 * retorna generico. Em sucesso, signIn redireciona (lanca) — o reset das falhas do
 * e-mail acontece no authorize. Nunca vaza detalhe: mensagem sempre generica.
 */
export async function signInAction(
  _prevState: SignInResult | undefined,
  formData: FormData,
): Promise<SignInResult> {
  // 1) IP de origem — antes de tudo, nunca lanca.
  const ip = await readClientIp();

  // Valor bruto de e-mail (pode nao ser string) — usado para decidir a chave.
  const rawEmail = formData.get("email");

  // 2) Valida a entrada completa com Zod.
  const parsed = signInSchema.safeParse({
    email: rawEmail,
    password: formData.get("password"),
  });

  if (!parsed.success) {
    // Entrada invalida conta como tentativa falha (decisao 5): IP sempre; e-mail
    // so se o valor for uma string sintaticamente valida.
    const emailKey =
      typeof rawEmail === "string" && emailSchema.safeParse(rawEmail).success
        ? normalizeEmail(rawEmail)
        : null;
    await recordFailure(emailKey, ip); // best-effort (nunca lanca)
    return { error: GENERIC_ERROR };
  }

  const email = normalizeEmail(parsed.data.email);

  // 3) Checa bloqueio (e-mail OU IP) na janela deslizante. FAIL-CLOSED (decisao 6):
  // se o SELECT lancar (Postgres indisponivel), trata como bloqueado e recusa.
  try {
    const counts = await countRecentFailures(email, ip, windowStart(new Date()));
    if (isBlocked(counts.email, counts.ip)) {
      // Bloqueado: recusa SEM chamar signIn (nao chega a validar a senha).
      return { error: GENERIC_ERROR };
    }
  } catch (error) {
    // Falha da checagem => fail-closed: recusa com o erro generico. Loga a mensagem
    // tecnica (sem PII sensivel — nunca a senha).
    console.error(
      "[login-attempts] falha ao checar bloqueio (fail-closed):",
      error instanceof Error ? error.message : error,
    );
    return { error: GENERIC_ERROR };
  }

  // 4) Tenta autenticar. Em sucesso, signIn redireciona (lanca) e o reset do e-mail
  // acontece no authorize (src/auth.ts).
  try {
    await signIn("credentials", {
      email: parsed.data.email,
      password: parsed.data.password,
      redirectTo: "/dashboard",
    });
    // Inatingivel em sucesso (signIn redireciona). Mantido por exaustividade.
    return { error: "" };
  } catch (error) {
    // AuthError (ex.: CredentialsSignin) => credencial errada / e-mail inexistente:
    // registra a falha (best-effort, decisao 6) e retorna generico.
    if (error instanceof AuthError) {
      await recordFailure(email, ip); // best-effort (nunca lanca)
      return { error: GENERIC_ERROR };
    }
    // Qualquer outro erro (inclui o redirect que o Next propaga como throw) e
    // re-lancado — comportamento atual preservado.
    throw error;
  }
}

/** Encerra a sessao (limpa o cookie JWT) e redireciona para /login. */
export async function signOutAction(): Promise<void> {
  await signOut({ redirectTo: "/login" });
}
