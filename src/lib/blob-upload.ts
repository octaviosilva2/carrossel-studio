// Wrapper client do upload no MinIO/S3. Roda no browser (client component).
// Valida o arquivo antes (mesma regra 6 MB/tipo) e pede ao handler /api/blob/upload
// uma presigned PUT (que exige sessao e reforca as regras no server); depois faz o
// PUT direto no MinIO. Contrato publico (UploadResult, uploadImageToBlob) inalterado
// — consumido por settings-form, identity-panel e slide-editor.

import { validateImageFile } from "@/lib/image-upload";

/** Resultado do upload — union discriminada (obriga narrowing no chamador). */
export type UploadResult =
  | { ok: true; url: string }
  | { ok: false; error: string };

/** Resposta do handler de presigned. Validada na borda antes de usar. */
type PresignResponse = {
  uploadUrl: string;
  publicUrl: string;
  contentType: string;
};

/** Type guard: confirma o shape da resposta do handler (dado externo = unknown). */
function isPresignResponse(value: unknown): value is PresignResponse {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.uploadUrl === "string" &&
    typeof v.publicUrl === "string" &&
    typeof v.contentType === "string"
  );
}

/** Mensagem generica de falha (nao vaza detalhe tecnico ao usuario). */
const GENERIC_ERROR = "Falha ao enviar a imagem. Tente de novo.";

/**
 * Valida e envia uma imagem ao MinIO via presigned PUT. Retorna a URL publica em
 * sucesso. Falha fechado: validacao invalida ou erro de rede => `{ ok:false }`, sem
 * mutar estado. A key do objeto e derivada no server (nao no client); a unicidade
 * vem do randomUUID do handler.
 */
export async function uploadImageToBlob(file: File): Promise<UploadResult> {
  const validation = validateImageFile(file);
  if (!validation.ok) {
    return { ok: false, error: validation.error };
  }

  try {
    // 1) Pede a presigned ao handler (que exige sessao e revalida tipo/tamanho).
    const presignRes = await fetch("/api/blob/upload", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        filename: file.name,
        contentType: file.type,
        size: file.size,
      }),
    });
    if (!presignRes.ok) {
      return { ok: false, error: GENERIC_ERROR };
    }

    const data: unknown = await presignRes.json();
    if (!isPresignResponse(data)) {
      return { ok: false, error: GENERIC_ERROR };
    }
    const { uploadUrl, publicUrl, contentType } = data;

    // 2) PUT direto no MinIO. O header Content-Type usa o `contentType` ECOADO pelo
    //    handler (o mesmo que foi assinado) — nao o file.type reinferido — senao a
    //    assinatura nao bate.
    const putRes = await fetch(uploadUrl, {
      method: "PUT",
      headers: { "content-type": contentType },
      body: file,
    });
    if (!putRes.ok) {
      return { ok: false, error: GENERIC_ERROR };
    }

    return { ok: true, url: publicUrl };
  } catch {
    // Mensagem generica ao usuario; detalhe fica no console do browser (rede/CORS).
    return { ok: false, error: GENERIC_ERROR };
  }
}
