// Wrapper client do upload de imagem. Roda no browser (client component). Valida o
// arquivo antes (mesma regra 6 MB/tipo) e envia ao handler /api/blob/upload, que
// exige sessao, reforca as regras no server e repassa ao MinIO (proxy server-side).
// Antes o browser fazia um PUT direto no MinIO — mas isso exigia CORS liberado no
// bucket. Agora o upload e same-origin (browser -> /api do Next), entao nao ha CORS.
// Contrato publico (UploadResult, uploadImageToBlob) INALTERADO — consumido por
// settings-form, onboarding-form, identity-panel e slide-editor.

import { validateImageFile } from "@/lib/image-upload";

/** Resultado do upload — union discriminada (obriga narrowing no chamador). */
export type UploadResult =
  | { ok: true; url: string }
  | { ok: false; error: string };

/** Resposta do handler de upload. Validada na borda antes de usar. */
type UploadResponse = { url: string };

/** Type guard: confirma o shape da resposta do handler (dado externo = unknown). */
function isUploadResponse(value: unknown): value is UploadResponse {
  if (typeof value !== "object" || value === null) return false;
  return typeof (value as Record<string, unknown>).url === "string";
}

/** Mensagem generica de falha (nao vaza detalhe tecnico ao usuario). */
const GENERIC_ERROR = "Falha ao enviar a imagem. Tente de novo.";

/**
 * Valida e envia uma imagem ao MinIO via proxy do servidor. Retorna a URL publica
 * em sucesso. Falha fechado: validacao invalida ou erro de rede => `{ ok:false }`,
 * sem mutar estado. A key do objeto e derivada no server (nao no client); a
 * unicidade vem do randomUUID do handler.
 */
export async function uploadImageToBlob(file: File): Promise<UploadResult> {
  const validation = validateImageFile(file);
  if (!validation.ok) {
    return { ok: false, error: validation.error };
  }

  try {
    // Envia o arquivo como multipart/form-data ao handler (same-origin: sem CORS).
    // O browser define o boundary do Content-Type sozinho ao receber um FormData.
    const form = new FormData();
    form.append("file", file);

    const res = await fetch("/api/blob/upload", {
      method: "POST",
      body: form,
    });
    if (!res.ok) {
      return { ok: false, error: GENERIC_ERROR };
    }

    const data: unknown = await res.json();
    if (!isUploadResponse(data)) {
      return { ok: false, error: GENERIC_ERROR };
    }

    return { ok: true, url: data.url };
  } catch {
    // Mensagem generica ao usuario; detalhe fica no console do browser (rede).
    return { ok: false, error: GENERIC_ERROR };
  }
}
