"use server";

// Actions administrativas (modelo done-for-you): provisionamento e gestao das
// contas de cliente pelo admin. Seguranca aplicada em TODA action: (1)
// requireAdmin() no topo (falha fechado — so admin acessa), (2) Zod na borda,
// (3) nunca retorna senha em texto. Provisionamento espelha scripts/create-client.mjs
// (bcrypt custo 12, idempotente por e-mail), agora acessivel pela UI do admin.

import { hash } from "bcryptjs";
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { carousels, clients, users } from "@/db/schema";
import { requireAdmin } from "@/lib/auth-guard";
import { DEFAULT_AVATAR_DATA_URL } from "@/lib/editor-state";
import {
  CreateClientAccountSchema,
  type AdminClientListItem,
  type CreateClientAccountInput,
  type CreateClientAccountResult,
  type DeleteClientAccountResult,
} from "@/lib/actions/admin-types";

const BCRYPT_COST = 12;

// --- Schema de borda local (uuid avulso) --------------------------------------
const uuidSchema = z.string().uuid();

/**
 * Provisiona uma conta de cliente nova: 1 user (role 'client') + 1 client com
 * identidade placeholder vazia (name/handle "", avatar default, onboarding
 * pendente). Idempotente por e-mail — se ja existir, lanca erro claro (nao
 * sobrescreve senha nem identidade). Nunca retorna a senha em texto.
 */
export async function createClientAccount(
  input: CreateClientAccountInput,
): Promise<CreateClientAccountResult> {
  await requireAdmin();

  const data = CreateClientAccountSchema.parse(input);

  const existing = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, data.email))
    .limit(1);

  if (existing.length > 0) {
    throw new Error("Já existe uma conta com esse e-mail.");
  }

  const passwordHash = await hash(data.password, BCRYPT_COST);

  const userId = await db.transaction(async (tx) => {
    const inserted = await tx
      .insert(users)
      .values({ email: data.email, passwordHash, role: "client" })
      .returning({ id: users.id });

    const row = inserted[0];
    if (!row) {
      throw new Error("Falha ao criar a conta do cliente.");
    }

    // Identidade placeholder — o proprio cliente preenche no onboarding.
    await tx.insert(clients).values({
      ownerId: row.id,
      name: "",
      handle: "",
      avatarUrl: DEFAULT_AVATAR_DATA_URL,
      verified: false,
      theme: "light",
      onboardingCompletedAt: null,
    });

    return row.id;
  });

  return { userId };
}

/**
 * Lista todos os clientes (role 'client') com a identidade padrao e a contagem
 * de carrosseis. So admin acessa. Segunda query (contagem) so roda se houver
 * clientes — evita ida ao banco a toa com a lista vazia.
 */
export async function listClientsAdmin(): Promise<AdminClientListItem[]> {
  await requireAdmin();

  const rows = await db
    .select({
      id: users.id,
      email: users.email,
      name: clients.name,
      handle: clients.handle,
    })
    .from(users)
    .innerJoin(clients, eq(clients.ownerId, users.id))
    .where(eq(users.role, "client"));

  if (rows.length === 0) return [];

  const ownerIds = rows.map((r) => r.id);

  const carouselRows = await db
    .select({ ownerId: carousels.ownerId })
    .from(carousels)
    .where(inArray(carousels.ownerId, ownerIds));

  const countByOwner = new Map<string, number>();
  for (const c of carouselRows) {
    countByOwner.set(c.ownerId, (countByOwner.get(c.ownerId) ?? 0) + 1);
  }

  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    handle: r.handle,
    email: r.email,
    carouselCount: countByOwner.get(r.id) ?? 0,
  }));
}

/**
 * Remove a conta de um cliente (user + client + carrosseis via cascade, ver
 * onDelete: "cascade" no schema). So admin acessa. Filtro reforca role='client'
 * (defesa em profundidade): esta action nunca apaga uma conta admin, mesmo que
 * o id passado seja de um admin. Id invalido/inexistente => erro claro.
 */
export async function deleteClientAccount(
  userId: string,
): Promise<DeleteClientAccountResult> {
  await requireAdmin();

  const parsed = uuidSchema.safeParse(userId);
  if (!parsed.success) {
    throw new Error("Id de usuário inválido.");
  }

  const deleted = await db
    .delete(users)
    .where(and(eq(users.id, parsed.data), eq(users.role, "client")))
    .returning({ id: users.id });

  if (deleted.length === 0) {
    throw new Error("Cliente não encontrado.");
  }

  return { ok: true };
}
