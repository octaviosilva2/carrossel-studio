import { BADGE } from "./slide-tokens";

// Selo verificado: circulo azul solido (#1D9BF0 via token) + check branco.
// REGRA INVIOLAVEL: sempre circulo azul com check, NUNCA estrela.
// SVG inline (nao imagem externa) para o canvas capturar sem CORS.
export function VerifiedBadge({ size = BADGE }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      role="img"
      aria-label="Conta verificada"
      style={{ display: "block", flexShrink: 0 }}
    >
      {/* Circulo azul preenchido pelo token do tema */}
      <circle cx="12" cy="12" r="12" fill="var(--slide-badge)" />
      {/* Check branco por cima */}
      <path
        d="M17.6 8.2 10.4 15.4 6.4 11.4l1.5-1.5 2.5 2.5 5.7-5.7z"
        fill="#ffffff"
      />
    </svg>
  );
}
