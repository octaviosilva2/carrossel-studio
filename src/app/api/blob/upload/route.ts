// Route handler que recebe a imagem e a envia ao MinIO/S3 PELO SERVIDOR (proxy).
// Antes o upload saia direto do browser via presigned PUT — mas isso exige CORS
// liberado no bucket, e as chaves atuais nao tem permissao pra configurar CORS.
// Passando pelo servidor eliminamos o CORS do browser (server->MinIO nao sofre CORS)
// e mantemos toda a validacao: falha fechado (so usuario logado sobe), tipo e
// tamanho reforcados no SERVIDOR, e a `key` derivada aqui (randomUUID), nunca vinda
// do cliente. Runtime Node (o SDK AWS precisa de Node). Erro interno nunca vaza
// detalhe: so console.error. A URL publica final casa com a allowlist do export.

import { randomUUID } from "node:crypto";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { env } from "@/lib/env";
import { MAX_IMAGE_BYTES } from "@/lib/image-upload";

export const runtime = "nodejs";

// Tipos de imagem aceitos (reforco server do que o client valida). Cada um mapeia
// para a extensao usada na key do objeto (derivada no server, nao do filename).
const CONTENT_TYPE_TO_EXT = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
} as const;

type AllowedContentType = keyof typeof CONTENT_TYPE_TO_EXT;

function isAllowedContentType(value: string): value is AllowedContentType {
  return value in CONTENT_TYPE_TO_EXT;
}

// Client S3 apontando ao MinIO. `forcePathStyle` porque o MinIO atras de proxy
// unico serve os objetos como `<endpoint>/<bucket>/<key>` (nao virtual-hosted).
const s3 = new S3Client({
  endpoint: env.S3_ENDPOINT,
  region: env.S3_REGION,
  forcePathStyle: true,
  credentials: {
    accessKeyId: env.S3_ACCESS_KEY,
    secretAccessKey: env.S3_SECRET_KEY,
  },
});

export async function POST(request: Request): Promise<NextResponse> {
  // Gate de sessao: sem usuario logado, nenhum upload (falha fechado).
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }

  try {
    // O corpo vem como multipart/form-data com o campo `file`. FormData pode nem
    // existir (body invalido); o try externo cobre isso.
    const form = await request.formData();
    const file = form.get("file");

    // Precisa ser um arquivo (File/Blob com bytes). Excluir string/ausente estreita
    // o tipo para File — evita `instanceof File`, que falha entre realms (ex.: jsdom
    // nos testes) mesmo o valor sendo um arquivo valido em runtime.
    if (file === null || typeof file === "string") {
      return NextResponse.json({ error: "Falha no upload." }, { status: 400 });
    }

    // Reforco server do tipo: so a allowlist de imagem passa.
    const contentType = file.type;
    if (!isAllowedContentType(contentType)) {
      return NextResponse.json({ error: "Falha no upload." }, { status: 400 });
    }

    // Reforco server do tamanho (<= 6 MB): o client valida, mas nao se confia nele.
    if (file.size <= 0 || file.size > MAX_IMAGE_BYTES) {
      return NextResponse.json({ error: "Falha no upload." }, { status: 400 });
    }

    // Key derivada no SERVER (nunca confia em path do cliente). Prefixo `slides/`
    // por paridade com o pathname antigo; unicidade pelo randomUUID.
    const ext = CONTENT_TYPE_TO_EXT[contentType];
    const key = `slides/${randomUUID()}.${ext}`;

    // Le os bytes e envia ao MinIO pelo servidor (server->MinIO: sem CORS).
    const body = new Uint8Array(await file.arrayBuffer());
    await s3.send(
      new PutObjectCommand({
        Bucket: env.S3_BUCKET,
        Key: key,
        Body: body,
        ContentType: contentType,
        ContentLength: body.byteLength,
      }),
    );

    // URL publica final path-style: <host>/<bucket>/<key>. Casa com a allowlist do
    // export (isAllowedBlobHost) que aceita o host exato de S3_PUBLIC_HOST.
    const url = `https://${env.S3_PUBLIC_HOST}/${env.S3_BUCKET}/${key}`;

    return NextResponse.json({ url });
  } catch (error) {
    // Detalhe tecnico so no log do servidor (sem PII/segredo); usuario ve generico.
    console.error("Falha ao subir imagem:", error);
    return NextResponse.json({ error: "Falha no upload." }, { status: 400 });
  }
}
