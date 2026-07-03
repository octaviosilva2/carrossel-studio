"use server";

// Action de configuracao da identidade padrao do cliente (S6). Edita a tabela
// `clients` — a marca herdada por todo carrossel novo (overrides null herdam).
// Mesma superficie de seguranca das actions da S3: (1) requireUser() no topo,
// (2) Zod na borda, (3) query SEMPRE filtrando por ownerId da sessao. Este arquivo
// "use server" exporta SOMENTE funcoes async; schema/tipos vivem em settings-types.ts.

import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { clients } from "@/db/schema";
import { requireUser } from "@/lib/auth-guard";
import { getDefaultClient } from "@/lib/client-repo";
import {
  ClientSettingsSchema,
  type ClientSettings,
  type UpdateClientSettingsResult,
} from "@/lib/actions/settings-types";

/**
 * Le a identidade padrao do dono (client mais antigo). requireUser + filtro por
 * ownerId dentro de getDefaultClient => nunca retorna a marca de outro dono.
 */
export async function getClientSettings(): Promise<ClientSettings> {
  const user = await requireUser();
  const client = await getDefaultClient(user.id);

  return {
    name: client.name,
    handle: client.handle,
    avatarUrl: client.avatarUrl,
    verified: client.verified,
    // theme no banco e text; normaliza para o union fechado (default light).
    theme: client.theme === "dark" ? "dark" : "light",
  };
}

/**
 * Atualiza a identidade padrao do dono. Valida a entrada (borda) ANTES de tocar o
 * banco; escreve com WHERE id AND ownerId (defesa em profundidade: usuario so
 * altera a propria marca). Carrosseis com overrides null passam a herdar os novos
 * valores automaticamente (nao materializamos herdados — ver carousel-mapping).
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
      updatedAt: now,
    })
    // ownerId reforcado na escrita (nunca edita marca de outro dono).
    .where(and(eq(clients.id, client.id), eq(clients.ownerId, user.id)));

  return { ok: true, updatedAt: now.toISOString() };
}
