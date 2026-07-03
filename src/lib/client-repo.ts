// Acesso compartilhado a tabela `clients` (marca padrao do dono). Extraido de
// carousels.ts na S6 para ser reusado pela action de settings SEM duplicar a regra
// "1o client do dono". server-only por transitividade: importa `@/db`, que declara
// `import "server-only"` — qualquer bundle client que puxe este modulo quebra o build.

import { eq } from "drizzle-orm";
import { db } from "@/db";
import { clients, type ClientRow } from "@/db/schema";

/**
 * Busca o client padrao (mais antigo) de um dono. Sem client configurado =>
 * estado invalido (seed/provisionamento sempre cria um) => lanca. Falha fechado:
 * nao inventa identidade. O chamador SEMPRE passa o ownerId da sessao — nunca do
 * client — garantindo o isolamento por dono.
 */
export async function getDefaultClient(ownerId: string): Promise<ClientRow> {
  const found = await db
    .select()
    .from(clients)
    .where(eq(clients.ownerId, ownerId))
    .orderBy(clients.createdAt)
    .limit(1);

  const client = found[0];
  if (!client) {
    throw new Error("Nenhum client configurado para o usuario.");
  }
  return client;
}
