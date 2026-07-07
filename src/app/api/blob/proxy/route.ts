// Proxy GET same-origin dos bytes de imagem do MinIO, usado pelo EXPORT para
// converter a imagem em data-URL canvas-safe SEM depender de CORS no bucket. O
// browser busca deste endpoint (same-origin: sem CORS); o servidor busca do MinIO
// (server->MinIO: sem CORS) e devolve os bytes. NAO e um proxy aberto: exige sessao
// e so aceita URLs cujo hostname casa com S3_PUBLIC_HOST (bloqueia SSRF para host
// arbitrario). Runtime Node. Erro interno nunca vaza detalhe: so console.error.

import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { env } from "@/lib/env";

export const runtime = "nodejs";

// So o host publico do storage passa. Match por rotulo: o ponto na frente de
// `.${base}` barra `evil-storage.evoiatecnologia.com`; o host exato tambem casa.
function isAllowedHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  const base = env.S3_PUBLIC_HOST.toLowerCase();
  return host === base || host.endsWith(`.${base}`);
}

export async function GET(request: Request): Promise<Response> {
  // Gate de sessao: sem usuario logado, nenhum proxy (falha fechado).
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }

  const raw = new URL(request.url).searchParams.get("url");
  if (!raw) {
    return NextResponse.json({ error: "Parâmetro url ausente." }, { status: 400 });
  }

  // URL alvo precisa ser https E do host do storage (defesa contra SSRF).
  let target: URL;
  try {
    target = new URL(raw);
  } catch {
    return NextResponse.json({ error: "URL inválida." }, { status: 400 });
  }
  if (target.protocol !== "https:" || !isAllowedHost(target.hostname)) {
    return NextResponse.json({ error: "Origem não permitida." }, { status: 400 });
  }

  try {
    const upstream = await fetch(target.toString());
    if (!upstream.ok) {
      return NextResponse.json({ error: "Falha ao buscar imagem." }, { status: 502 });
    }

    // So repassa imagens (defesa extra: o storage serve imagens de avatar/slide).
    const contentType =
      upstream.headers.get("content-type") ?? "application/octet-stream";
    if (!contentType.startsWith("image/")) {
      return NextResponse.json({ error: "Conteúdo não permitido." }, { status: 400 });
    }

    const body = await upstream.arrayBuffer();
    return new NextResponse(body, {
      status: 200,
      headers: {
        "content-type": contentType,
        // Cache curto e privado: os bytes sao os mesmos durante uma sessao de export.
        "cache-control": "private, max-age=60",
      },
    });
  } catch (error) {
    // Detalhe tecnico so no log do servidor; usuario ve generico.
    console.error("Falha no proxy de imagem:", error);
    return NextResponse.json({ error: "Falha ao buscar imagem." }, { status: 502 });
  }
}
