// Tipos e schema Zod das actions de carrossel. Modulo NEUTRO (sem "use server"):
// um arquivo "use server" so pode exportar funcoes async, entao o schema (objeto
// Zod) e as interfaces vivem aqui e sao consumidos tanto pelas actions (servidor)
// quanto pelo editor (client, so os tipos). Contrato inalterado — apenas relocado.

import { z } from "zod";

const uuidSchema = z.string().uuid();

const identitySchema = z.object({
  name: z.string().max(120),
  handle: z.string().max(120),
  avatarUrl: z.string().min(1), // data-URL (placeholder) ou URL https do Blob
  verified: z.boolean(),
});

const slideInputSchema = z.object({
  body: z.string().max(2000),
  imageUrl: z.url().optional(),
});

/** Payload de saveCarousel (o editor manda o estado inteiro; replace-all). */
export const SaveCarouselSchema = z.object({
  id: uuidSchema,
  title: z.string().min(1).max(120),
  theme: z.enum(["light", "dark"]),
  identity: identitySchema,
  slides: z.array(slideInputSchema).min(1),
});

export type SaveCarouselInput = z.infer<typeof SaveCarouselSchema>;

export interface CreateCarouselResult {
  id: string;
}

export interface SaveCarouselResult {
  ok: true;
  updatedAt: string;
}

export interface CarouselListItem {
  id: string;
  title: string;
  updatedAt: string;
  createdAt: string;
  slideCount: number;
  /** Snippet do body do slide na position 0 (truncado ~60 chars), para thumbnail textual. */
  firstSlideBody: string;
}

export interface DeleteCarouselResult {
  ok: true;
}
