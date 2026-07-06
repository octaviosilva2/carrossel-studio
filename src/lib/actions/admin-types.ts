// Tipos e schema Zod das actions administrativas (gestao de contas de cliente,
// modelo done-for-you). Modulo NEUTRO (sem "use server"): um arquivo "use server"
// so pode exportar funcoes async, entao o schema Zod e os tipos vivem aqui.

import { z } from "zod";

/**
 * Payload de createClientAccount. Senha minima de 8 caracteres — nao ha padrao
 * de forca de senha preexistente no projeto (seed/scripts so exigem nao-vazio via
 * env); 8 e o piso razoavel de uma baseline de seguranca.
 */
export const CreateClientAccountSchema = z.object({
  email: z.email(),
  password: z.string().min(8, "Senha deve ter ao menos 8 caracteres"),
});

export type CreateClientAccountInput = z.infer<typeof CreateClientAccountSchema>;

/** Nunca inclui a senha — so o id do user criado. */
export interface CreateClientAccountResult {
  userId: string;
}

/**
 * Item da listagem de clientes do admin. Sem tracking de uso/custo de tokens —
 * fatia futura (nao existe tabela para isso ainda).
 */
export interface AdminClientListItem {
  id: string;
  name: string;
  handle: string;
  email: string;
  carouselCount: number;
}

export interface DeleteClientAccountResult {
  ok: true;
}
