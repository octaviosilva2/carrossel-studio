// Route handler que gera uma presigned PUT do MinIO/S3 (upload direto do browser).
// Falha fechado: so usuario logado recebe URL assinada. Reforca tipo e tamanho no
// SERVIDOR (o client tambem valida, mas nao se confia so nele) — o tamanho e
// assinado no ContentLength, entao o MinIO recusa um PUT que divirja. A `key` do
// objeto e derivada no server (randomUUID), nunca vinda do cliente. Runtime Node
// (o SDK AWS precisa de Node). Erro interno nunca vaza detalhe: so console.error.

import { randomUUID } from "node:crypto";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { NextResponse } from "next/server";
import { z } from "zod";
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

// Validacao da borda (Zod). `filename` so serve pra existir (a extensao real vem
// do contentType, nao do nome). `contentType` restrito a allowlist. `size` inteiro
// positivo e <= limite (6 MB) — reforco server, replicado depois no ContentLength.
const uploadRequestSchema = z.object({
  filename: z.string().min(1),
  contentType: z.enum(
    Object.keys(CONTENT_TYPE_TO_EXT) as [AllowedContentType, ...AllowedContentType[]],
  ),
  size: z.number().int().positive().max(MAX_IMAGE_BYTES),
});

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
  // Gate de sessao: sem usuario logado, nenhuma presigned e emitida (falha fechado).
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }

  try {
    // Body pode nem ser JSON valido; parse defensivo -> unknown, validado pelo Zod.
    const raw: unknown = await request.json();
    const parsed = uploadRequestSchema.safeParse(raw);
    if (!parsed.success) {
      // Payload/tipo/tamanho invalido -> 400 generico (nao vaza qual campo).
      return NextResponse.json({ error: "Falha no upload." }, { status: 400 });
    }

    const { contentType, size } = parsed.data;

    // Key derivada no SERVER (nunca confia em path do cliente). Prefixo `slides/`
    // por paridade com o pathname antigo; unicidade pelo randomUUID.
    const ext = CONTENT_TYPE_TO_EXT[contentType];
    const key = `slides/${randomUUID()}.${ext}`;

    // ContentLength assinado = reforco server do tamanho: o MinIO recusa um PUT cujo
    // Content-Length divirja do assinado, mesmo com o upload saindo direto do browser.
    const command = new PutObjectCommand({
      Bucket: env.S3_BUCKET,
      Key: key,
      ContentType: contentType,
      ContentLength: size,
    });

    // Janela curta: a URL vale so pro upload imediato que segue no client.
    const uploadUrl = await getSignedUrl(s3, command, { expiresIn: 300 });

    // URL publica final path-style: <host>/<bucket>/<key>. Casa com a allowlist do
    // export (isAllowedBlobHost) que aceita o host exato de S3_PUBLIC_HOST.
    const publicUrl = `https://${env.S3_PUBLIC_HOST}/${env.S3_BUCKET}/${key}`;

    // `contentType` ecoado: o client PRECISA usar exatamente este no header do PUT,
    // senao a assinatura nao bate e o MinIO rejeita (Content-Type faz parte dela).
    return NextResponse.json({ uploadUrl, publicUrl, contentType });
  } catch (error) {
    // Detalhe tecnico so no log do servidor (sem PII/segredo); usuario ve generico.
    console.error("Falha ao gerar presigned upload:", error);
    return NextResponse.json({ error: "Falha no upload." }, { status: 400 });
  }
}
