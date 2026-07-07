"use server";

// Action de configuracao da identidade padrao do cliente (S6). Edita a tabela
// `clients` — a marca herdada por todo carrossel novo (overrides null herdam).
// Mesma superficie de seguranca das actions da S3: (1) requireUser() no topo,
// (2) Zod na borda, (3) query SEMPRE filtrando por ownerId da sessao. Este arquivo
// "use server" exporta SOMENTE funcoes async; schema/tipos vivem em settings-types.ts.

import { compare, hash } from "bcryptjs";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { clients, users } from "@/db/schema";
import { requireUser } from "@/lib/auth-guard";
import { getDefaultClient } from "@/lib/client-repo";
import {
  ChangePasswordSchema,
  ClientSettingsSchema,
  type AccountInfo,
  type ChangePasswordInput,
  type ChangePasswordResult,
  type ClientSettings,
  type ClientSettingsWithOnboarding,
  type CompleteOnboardingResult,
  type UpdateClientSettingsResult,
} from "@/lib/actions/settings-types";

const BCRYPT_COST = 12;

/**
 * Le a identidade padrao do dono (client mais antigo) + estado de onboarding.
 * requireUser + filtro por ownerId dentro de getDefaultClient => nunca retorna
 * a marca de outro dono.
 */
export async function getClientSettings(): Promise<ClientSettingsWithOnboarding> {
  const user = await requireUser();
  const client = await getDefaultClient(user.id);

  return {
    name: client.name,
    handle: client.handle,
    avatarUrl: client.avatarUrl,
    verified: client.verified,
    // theme no banco e text; normaliza para o union fechado (default light).
    theme: client.theme === "dark" ? "dark" : "light",
    onboardingCompletedAt: client.onboardingCompletedAt
      ? client.onboardingCompletedAt.toISOString()
      : null,
  };
}

/**
 * Atualiza a identidade padrao do dono. Valida a entrada (borda) ANTES de tocar o
 * banco; escreve com WHERE id AND ownerId (defesa em profundidade: usuario so
 * altera a propria marca). Carrosseis com overrides null passam a herdar os novos
 * valores automaticamente (nao materializamos herdados — ver carousel-mapping).
 * Se o onboarding ainda nao foi concluido (cliente pulou o fluxo dedicado), salvar
 * a identidade aqui TAMBEM marca onboardingCompletedAt — o usuario ja fez o que o
 * onboarding pedia, so nao pelo caminho dedicado (evita o aviso preso pra sempre).
 */
export async function updateClientSettings(
  input: ClientSettings,
): Promise<UpdateClientSettingsResult> {
  const user = await requireUser();

  // Borda: rejeicao lanca ZodError antes de qualquer efeito colateral.
  const data = ClientSettingsSchema.parse(input);

  // Resolve o client do dono (mais antigo). Filtro por ownerId no helper.
  const client = await getDefaultClient(user.id);

  const now = new Date();
  await db
    .update(clients)
    .set({
      name: data.name,
      handle: data.handle,
      avatarUrl: data.avatarUrl,
      verified: data.verified,
      theme: data.theme,
      onboardingCompletedAt: client.onboardingCompletedAt ?? now,
      updatedAt: now,
    })
    // ownerId reforcado na escrita (nunca edita marca de outro dono).
    .where(and(eq(clients.id, client.id), eq(clients.ownerId, user.id)));

  return { ok: true, updatedAt: now.toISOString() };
}

/**
 * Le dados da conta (tabela `users`, fora da identidade da marca). Hoje so
 * passwordChangedAt — exibido na aba Conta como "ultima alteracao de senha".
 */
export async function getAccountInfo(): Promise<AccountInfo> {
  const user = await requireUser();

  const rows = await db
    .select({ passwordChangedAt: users.passwordChangedAt })
    .from(users)
    .where(eq(users.id, user.id))
    .limit(1);

  const row = rows[0];
  return {
    passwordChangedAt: row?.passwordChangedAt
      ? row.passwordChangedAt.toISOString()
      : null,
  };
}

/**
 * Igual a updateClientSettings, mas tambem marca o onboarding como concluido
 * (onboardingCompletedAt = now). Usada pela tela de onboarding do cliente novo
 * (identidade placeholder criada por createClientAccount) para sair do estado
 * "pendente" na primeira configuracao da marca.
 */
export async function completeOnboarding(
  input: ClientSettings,
): Promise<CompleteOnboardingResult> {
  const user = await requireUser();

  // Borda: rejeicao lanca ZodError antes de qualquer efeito colateral.
  const data = ClientSettingsSchema.parse(input);

  const client = await getDefaultClient(user.id);

  const now = new Date();
  await db
    .update(clients)
    .set({
      name: data.name,
      handle: data.handle,
      avatarUrl: data.avatarUrl,
      verified: data.verified,
      theme: data.theme,
      onboardingCompletedAt: now,
      updatedAt: now,
    })
    // ownerId reforcado na escrita (nunca edita marca de outro dono).
    .where(and(eq(clients.id, client.id), eq(clients.ownerId, user.id)));

  return {
    ok: true,
    updatedAt: now.toISOString(),
    onboardingCompletedAt: now.toISOString(),
  };
}

/**
 * Troca a senha do usuario logado. Confirma a senha ATUAL antes de gravar a
 * nova (nunca troca sem provar posse da senha antiga). Hash bcrypt custo 12
 * (mesmo padrao de auth.ts/create-client.mjs/seed.mjs). Nunca loga senha em
 * texto — nem a atual nem a nova.
 */
export async function changePassword(
  input: ChangePasswordInput,
): Promise<ChangePasswordResult> {
  const user = await requireUser();

  // Borda: rejeicao lanca ZodError antes de qualquer efeito colateral.
  const data = ChangePasswordSchema.parse(input);

  const rows = await db
    .select({ passwordHash: users.passwordHash })
    .from(users)
    .where(eq(users.id, user.id))
    .limit(1);

  const row = rows[0];
  if (!row) {
    throw new Error("Usuário não encontrado.");
  }

  const currentOk = await compare(data.currentPassword, row.passwordHash);
  if (!currentOk) {
    throw new Error("Senha atual incorreta.");
  }

  const newHash = await hash(data.newPassword, BCRYPT_COST);
  const now = new Date();

  await db
    .update(users)
    .set({ passwordHash: newHash, passwordChangedAt: now })
    // ownerId (o proprio id do usuario logado) reforcado na escrita.
    .where(eq(users.id, user.id));

  return { ok: true, passwordChangedAt: now.toISOString() };
}
