// Marca do produto (cards sobrepostos + dots), reaproveitada do mockup aprovado
// (docs/mockups/redesign-v1.html) como componente React em vez de SVG cru.

interface LogoProps {
  className?: string;
}

export function Logo({ className }: LogoProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      <rect x="6.5" y="4" width="11" height="14" rx="2.5" fill="currentColor" opacity="0.28" />
      <rect x="4" y="6" width="11" height="14" rx="2.5" fill="currentColor" />
      <circle cx="9.5" cy="21.5" r="0.9" fill="currentColor" />
      <circle cx="13" cy="21.5" r="0.9" fill="currentColor" opacity="0.5" />
      <circle cx="16.5" cy="21.5" r="0.9" fill="currentColor" opacity="0.5" />
    </svg>
  );
}
