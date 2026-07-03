import type { CSSProperties } from "react";

import { VerifiedBadge } from "./verified-badge";
import type { SlideProps, SlideTheme } from "./types";
import {
  AVATAR,
  BADGE_GAP,
  BODY_LINE_MULT,
  BODY_SIZE_IMG,
  BODY_SIZE_NOIMG,
  CANVAS_H,
  CANVAS_W,
  CONTENT_W,
  HANDLE_SIZE,
  HEADER_GAP,
  IMG_BORDER,
  IMG_GAP,
  IMG_RADIUS,
  MARGIN,
  NAME_GAP,
  NAME_SIZE,
  NOIMG_CENTER_SHIFT,
  PARAGRAPH_MULT,
  SLIDE_FONT_STACK,
  VERT_PAD,
} from "./slide-tokens";

// Cores por tema — valores EXATOS de docs/REFERENCIA-VISUAL.md (espelhados em
// slide-tokens.css, a doc canonica). Aplicados inline como CSS custom properties
// para nao depender de import de .css de componente no App Router.
const THEME_VARS: Record<SlideTheme, CSSProperties> = {
  light: {
    ["--slide-bg" as string]: "#ffffff",
    ["--slide-text" as string]: "#14171a",
    ["--slide-handle" as string]: "#536471",
    ["--slide-badge" as string]: "#1d9bf0",
    ["--slide-img-border" as string]: "#cfd9de",
  },
  dark: {
    ["--slide-bg" as string]: "#000000",
    ["--slide-text" as string]: "#ffffff",
    ["--slide-handle" as string]: "#71767b",
    ["--slide-badge" as string]: "#1d9bf0",
    ["--slide-img-border" as string]: "#2f3336",
  },
};

/**
 * Slide do carrossel (modelo Octavio). Server Component puro de markup: recebe
 * props, devolve o no em 1080x1350 fiel a docs/REFERENCIA-VISUAL.md. Deterministico.
 * Este e o "motor de render" reusado por S2 (preview), S4 (export) e S5 (IA).
 */
export function Slide({ data }: SlideProps) {
  const { name, handle, avatarUrl, verified, body, imageUrl, theme } = data;

  const hasImage = Boolean(imageUrl);
  const bodySize = hasImage ? BODY_SIZE_IMG : BODY_SIZE_NOIMG;
  const paragraphGap = bodySize * PARAGRAPH_MULT;

  // "\n\n" separa blocos de ideia; dentro do bloco, quebra natural por largura.
  const paragraphs = body
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);

  return (
    <div
      className="slide"
      data-theme={theme}
      style={{
        ...THEME_VARS[theme],
        width: CANVAS_W,
        height: CANVAS_H,
        position: "relative",
        overflow: "hidden",
        background: "var(--slide-bg)",
        color: "var(--slide-text)",
        fontFamily: SLIDE_FONT_STACK,
        boxSizing: "border-box",
      }}
    >
      {/* Bloco unico (header + corpo + imagem) centralizado na vertical (opcao A:
          flex). O deslocamento -20 do caso sem imagem replica o Python. */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          paddingTop: VERT_PAD,
          paddingBottom: VERT_PAD,
          paddingLeft: MARGIN,
          paddingRight: MARGIN,
          boxSizing: "border-box",
          transform: hasImage ? undefined : `translateY(-${NOIMG_CENTER_SHIFT}px)`,
        }}
      >
        {/* HEADER: avatar + (nome + selo / handle) */}
        <div style={{ display: "flex", alignItems: "center", gap: NAME_GAP }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={avatarUrl}
            alt=""
            width={AVATAR}
            height={AVATAR}
            style={{
              width: AVATAR,
              height: AVATAR,
              borderRadius: "50%",
              objectFit: "cover",
              flexShrink: 0,
              display: "block",
            }}
          />
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              justifyContent: "center",
              minWidth: 0,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: BADGE_GAP }}>
              <span
                style={{
                  fontSize: NAME_SIZE,
                  fontWeight: 700,
                  lineHeight: 1.2,
                  whiteSpace: "nowrap",
                }}
              >
                {name}
              </span>
              {verified && <VerifiedBadge />}
            </div>
            <span
              style={{
                fontSize: HANDLE_SIZE,
                fontWeight: 400,
                color: "var(--slide-handle)",
                lineHeight: 1.2,
                whiteSpace: "nowrap",
              }}
            >
              @{handle}
            </span>
          </div>
        </div>

        {/* CORPO: blocos de ideia, alinhados a esquerda, largura util 920 */}
        <div style={{ marginTop: HEADER_GAP }}>
          {paragraphs.map((paragraph, index) => (
            <p
              key={index}
              style={{
                margin: 0,
                marginBottom: index < paragraphs.length - 1 ? paragraphGap : 0,
                fontSize: bodySize,
                fontWeight: 400,
                lineHeight: BODY_LINE_MULT,
                whiteSpace: "normal",
                wordBreak: "break-word",
              }}
            >
              {paragraph}
            </p>
          ))}
        </div>

        {/* IMAGEM opcional: escala pela largura (920), radius 28 + borda 2px */}
        {hasImage && imageUrl ? (
          <div
            style={{
              marginTop: IMG_GAP,
              width: CONTENT_W,
              border: `${IMG_BORDER}px solid var(--slide-img-border)`,
              borderRadius: IMG_RADIUS + IMG_BORDER,
              overflow: "hidden",
              boxSizing: "border-box",
              lineHeight: 0,
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={imageUrl}
              alt=""
              style={{
                width: "100%",
                height: "auto",
                display: "block",
                borderRadius: IMG_RADIUS,
              }}
            />
          </div>
        ) : null}
      </div>
    </div>
  );
}
