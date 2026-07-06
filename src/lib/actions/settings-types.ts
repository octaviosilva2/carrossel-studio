// Tipos e schema Zod da action de configuracao da identidade padrao (S6). Modulo
// NEUTRO (sem "use server"): um arquivo "use server" so exporta funcoes async,
// entao o schema (objeto Zod) e as interfaces vivem aqui e sao consumidos tanto
// pela action (servidor) quanto pelo form de /settings (client, so os tipos).

import { z } from "zod";

/**
 * Schema da identidade padrao do cliente (tabela `clients`). Validacao de borda:
 * roda no servidor antes de tocar o banco (falha fechado). Limites coerentes com
 * o que o slide renderiza sem estourar (nome/handle em 1 linha, whiteSpace nowrap).
 */
export const ClientSettingsSchema = z.object({
  // Nome de exibicao: 1..80 (trim). Vazio nao faz sentido no header do slide.
  name: z.string().trim().min(1, "Nome obrigatorio").max(80),
  // Handle sem "@": so [A-Za-z0-9_], 1..30 (padrao Twitter/X). O "@" e prefixado
  // na render; o form ja faz strip, mas a borda reforca (nao confiar no client).
  handle: z
    .string()
    .trim()
    .min(1, "Handle obrigatorio")
    .max(30)
    .regex(/^[A-Za-z0-9_]+$/, "Handle invalido (use letras, numeros e _)"),
  // Avatar: URL https do Blob OU data-URL (o default e um SVG data-URL same-origin).
  avatarUrl: z
    .string()
    .min(1)
    .refine(
      (v) => v.startsWith("https://") || v.startsWith("data:image/"),
      "Avatar deve ser uma URL https ou data-URL de imagem",
    ),
  verified: z.boolean(),
  theme: z.enum(["light", "dark"]),
});

/** Identidade padrao (payload do form e retorno da leitura). */
export type ClientSettings = z.infer<typeof ClientSettingsSchema>;

/** Resultado de updateClientSettings. */
export interface UpdateClientSettingsResult {
  ok: true;
  updatedAt: string;
}

/**
 * Retorno de getClientSettings: identidade + estado de onboarding. Interface
 * SEPARADA de ClientSettings (nao estende o schema Zod de entrada) — onboarding
 * e um campo derivado/servidor, nunca faz parte do payload que o form envia em
 * updateClientSettings.
 */
export interface ClientSettingsWithOnboarding extends ClientSettings {
  /** null = onboarding ainda nao concluido. */
  onboardingCompletedAt: string | null;
}

/** Resultado de completeOnboarding. */
export interface CompleteOnboardingResult {
  ok: true;
  updatedAt: string;
  onboardingCompletedAt: string;
}

/**
 * Payload de changePassword. Nova senha com o mesmo piso minimo usado em
 * createClientAccount (admin-types.ts) — nao ha padrao de forca preexistente
 * no projeto alem de "nao vazio".
 */
export const ChangePasswordSchema = z.object({
  currentPassword: z.string().min(1, "Senha atual obrigatória"),
  newPassword: z.string().min(8, "Nova senha deve ter ao menos 8 caracteres"),
});

export type ChangePasswordInput = z.infer<typeof ChangePasswordSchema>;

export interface ChangePasswordResult {
  ok: true;
}
