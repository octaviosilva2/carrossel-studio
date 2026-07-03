"use server";

// CRUD de carrosseis via server actions (Next 15). Regra de seguranca aplicada em
// TODA action: (1) requireUser() no topo, (2) Zod na entrada, (3) ownerId SEMPRE
// da sessao — nunca vindo do client. Queries de carousel SEMPRE filtram por
// ownerId (falha fechado: id de outro dono => notFound, nao vaza dado alheio).

import { notFound } from "next/navigation";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { carousels, clients, slides } from "@/db/schema";
import { requireUser } from "@/lib/auth-guard";
import { getDefaultClient } from "@/lib/client-repo";
import {
  identityToOverride,
  rowToEditorState,
  themeToOverride,
} from "@/lib/carousel-mapping";
import type { EditorState } from "@/lib/editor-state";
import { DEFAULT_CAROUSEL_TITLE } from "@/lib/editor-state";
import type { MappedGeneratedCarousel } from "@/lib/generate-sanitize";
import {
  SaveCarouselSchema,
  type CarouselListItem,
  type CreateCarouselResult,
  type DeleteCarouselResult,
  type SaveCarouselInput,
  type SaveCarouselResult,
} from "@/lib/actions/carousel-types";

// Schema/tipos vivem em `carousel-types.ts` (modulo neutro): um arquivo
// "use server" so pode exportar funcoes async, entao o schema Zod e os tipos
// ficam fora daqui. Consumidores (client) importam os tipos direto de
// `carousel-types.ts`; este arquivo exporta SOMENTE funcoes async.

// --- Schema de borda local (uuid avulso) --------------------------------------

const uuidSchema = z.string().uuid();

// getDefaultClient vive em `@/lib/client-repo` (reusado por settings.ts na S6).

// --- Actions ------------------------------------------------------------------

/**
 * Cria um carrossel novo herdando a identidade do client padrao (todos os
 * overrides null). Retorna o id. ownerId sempre da sessao.
 */
export async function createCarousel(): Promise<CreateCarouselResult> {
  const user = await requireUser();
  const client = await getDefaultClient(user.id);

  const inserted = await db
    .insert(carousels)
    .values({
      ownerId: user.id,
      clientId: client.id,
      title: DEFAULT_CAROUSEL_TITLE,
      // overrides null => herda tudo do client na abertura.
    })
    .returning({ id: carousels.id });

  const row = inserted[0];
  if (!row) {
    throw new Error("Falha ao criar o carrossel.");
  }

  // Um carrossel novo comeca com 1 slide vazio (coerente com o editor da S2).
  await db.insert(slides).values({
    carouselId: row.id,
    position: 0,
    body: "",
    imageUrl: null,
  });

  return { id: row.id };
}

/**
 * Cria um carrossel NOVO ja populado com os slides gerados pela IA (S5). Variante
 * de createCarousel: mesma superficie de seguranca (requireUser + ownerId da sessao
 * + getDefaultClient), mas insere N slides em vez de 1 vazio. Recebe a estrutura JA
 * validada (Zod nosso) e sanitizada (emojis/markdown removidos, dica de imagem
 * aplicada, bodies vazios descartados) pela action de geracao — aqui so persiste.
 *
 * Insere em TRANSACAO: 1 linha em carousels (title gerado; overrides null => herda
 * a identidade e o tema default do client, AC-4) + N linhas em slides (position =
 * indice, body sanitizado, imageUrl null). Retorna o id para o redirect ao editor.
 */
export async function createGeneratedCarousel(
  generated: MappedGeneratedCarousel,
): Promise<CreateCarouselResult> {
  const user = await requireUser();
  const client = await getDefaultClient(user.id);

  // Guarda defensiva: a action ja garante >=1 slide, mas nao criamos carrossel
  // sem slide (invariante do editor: todo carrossel abre com ao menos 1 slide).
  if (generated.slides.length === 0) {
    throw new Error("Geracao sem slides — nao cria carrossel vazio.");
  }

  const id = await db.transaction(async (tx) => {
    const inserted = await tx
      .insert(carousels)
      .values({
        ownerId: user.id,
        clientId: client.id,
        title: generated.title,
        // overrides null => herda identidade/tema do client (tema herda default).
      })
      .returning({ id: carousels.id });

    const row = inserted[0];
    if (!row) {
      throw new Error("Falha ao criar o carrossel gerado.");
    }

    await tx.insert(slides).values(
      generated.slides.map((slide) => ({
        carouselId: row.id,
        position: slide.position,
        body: slide.body,
        imageUrl: slide.imageUrl,
      })),
    );

    return row.id;
  });

  return { id };
}

/**
 * Lista os carrosseis do dono (id, title, updatedAt), mais recentes primeiro.
 * Filtra por ownerId — nunca lista de outro dono.
 */
export async function listCarousels(): Promise<CarouselListItem[]> {
  const user = await requireUser();

  const rows = await db
    .select({
      id: carousels.id,
      title: carousels.title,
      updatedAt: carousels.updatedAt,
    })
    .from(carousels)
    .where(eq(carousels.ownerId, user.id))
    .orderBy(desc(carousels.updatedAt));

  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    updatedAt: r.updatedAt.toISOString(),
  }));
}

/**
 * Carrega um carrossel do dono e monta o EditorState (identidade/tema resolvidos,
 * slides ordenados). id de outro dono ou inexistente => notFound() (404), sem
 * vazar existencia do recurso alheio (AC 23).
 */
export async function getCarousel(rawId: string): Promise<EditorState> {
  const user = await requireUser();

  const parsed = uuidSchema.safeParse(rawId);
  if (!parsed.success) notFound();
  const id = parsed.data;

  const carouselRows = await db
    .select()
    .from(carousels)
    // Filtro por id AND ownerId: dono errado nao encontra.
    .where(and(eq(carousels.id, id), eq(carousels.ownerId, user.id)))
    .limit(1);

  const carousel = carouselRows[0];
  if (!carousel) notFound();

  const clientRows = await db
    .select()
    .from(clients)
    .where(eq(clients.id, carousel.clientId))
    .limit(1);

  const client = clientRows[0];
  if (!client) notFound();

  const slideRows = await db
    .select({
      position: slides.position,
      body: slides.body,
      imageUrl: slides.imageUrl,
    })
    .from(slides)
    .where(eq(slides.carouselId, carousel.id));

  return rowToEditorState(client, carousel, slideRows);
}

/**
 * Salva um carrossel (replace-all atomico). Verifica posse por ownerId; converte
 * a identidade em overrides por campo (herdados ficam null); persiste em transacao:
 * UPDATE carousels -> DELETE slides -> INSERT slides na ordem (position = indice).
 * id de outro dono => notFound. Entrada malformada => Zod lanca antes de qualquer
 * efeito colateral (AC 22).
 */
export async function saveCarousel(
  input: SaveCarouselInput,
): Promise<SaveCarouselResult> {
  const user = await requireUser();

  // Valida a entrada (borda). Rejeicao lanca ZodError antes de tocar o banco.
  const data = SaveCarouselSchema.parse(input);

  // Confirma posse e obtem o client (para calcular os overrides por heranca).
  const carouselRows = await db
    .select({ id: carousels.id, clientId: carousels.clientId })
    .from(carousels)
    .where(and(eq(carousels.id, data.id), eq(carousels.ownerId, user.id)))
    .limit(1);

  const carousel = carouselRows[0];
  if (!carousel) notFound();

  const clientRows = await db
    .select()
    .from(clients)
    .where(eq(clients.id, carousel.clientId))
    .limit(1);

  const client = clientRows[0];
  if (!client) notFound();

  const overrides = identityToOverride(data.identity, client);
  const overrideTheme = themeToOverride(data.theme, client);
  // Persiste na ordem do array: position = indice (replace-all resolve reorder).
  const slideRows = data.slides.map((s, index) => ({
    position: index,
    body: s.body,
    imageUrl: s.imageUrl ?? null,
  }));
  const now = new Date();

  // Transacao: replace-all. Driver Neon serverless (Pool + ws) suporta.
  await db.transaction(async (tx) => {
    await tx
      .update(carousels)
      .set({
        title: data.title,
        overrideName: overrides.overrideName,
        overrideHandle: overrides.overrideHandle,
        overrideAvatarUrl: overrides.overrideAvatarUrl,
        overrideVerified: overrides.overrideVerified,
        overrideTheme,
        updatedAt: now,
      })
      // Reforca ownerId na escrita (defesa em profundidade).
      .where(and(eq(carousels.id, data.id), eq(carousels.ownerId, user.id)));

    await tx.delete(slides).where(eq(slides.carouselId, data.id));

    await tx.insert(slides).values(
      slideRows.map((row) => ({
        carouselId: data.id,
        position: row.position,
        body: row.body,
        imageUrl: row.imageUrl,
      })),
    );
  });

  return { ok: true, updatedAt: now.toISOString() };
}

/**
 * Remove um carrossel do dono (slides caem por cascade). id de outro dono =>
 * notFound (nenhuma linha afetada, sem vazar existencia).
 */
export async function deleteCarousel(
  rawId: string,
): Promise<DeleteCarouselResult> {
  const user = await requireUser();

  const parsed = uuidSchema.safeParse(rawId);
  if (!parsed.success) notFound();
  const id = parsed.data;

  const deleted = await db
    .delete(carousels)
    .where(and(eq(carousels.id, id), eq(carousels.ownerId, user.id)))
    .returning({ id: carousels.id });

  if (deleted.length === 0) notFound();

  return { ok: true };
}
