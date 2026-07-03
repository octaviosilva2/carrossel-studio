// Validacao e leitura de upload de imagem (S2). Primeira borda de input do
// projeto. `validateImageFile` e PURA (recebe File, retorna resultado) — testavel
// sem DOM. `readFileAsDataUrl` usa FileReader (API de browser), so acionada no client.

/** Limite de tamanho do upload — 6 MB (fixado na story). */
export const MAX_IMAGE_BYTES = 6 * 1024 * 1024;

/** Resultado da validacao — uniao discriminada (o compilador exige narrowing). */
export type ImageValidation = { ok: true } | { ok: false; error: string };

/**
 * Valida tipo (so imagem) e tamanho (<= 6 MB). Pura — testavel sem DOM.
 * Falha fechado: qualquer entrada invalida devolve `{ ok:false }` e o chamador
 * NAO deve mutar o estado do carrossel.
 */
export function validateImageFile(file: File): ImageValidation {
  if (!file.type.startsWith("image/")) {
    return { ok: false, error: "Envie um arquivo de imagem." };
  }
  if (file.size > MAX_IMAGE_BYTES) {
    return { ok: false, error: "Imagem acima de 6 MB." };
  }
  return { ok: true };
}

/**
 * Le um File (ja validado) como data-URL via FileReader. Resolve com a string
 * `data:...`; rejeita em `onerror`. data-URL e same-origin (zero CORS no export).
 */
export function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      // readAsDataURL sempre produz string; narrowing honesto mesmo assim.
      if (typeof result === "string") {
        resolve(result);
      } else {
        reject(new Error("Falha ao ler o arquivo."));
      }
    };
    reader.onerror = () => reject(new Error("Falha ao ler o arquivo."));
    reader.readAsDataURL(file);
  });
}
