/** @type {import('next').NextConfig} */
const nextConfig = {
  // ESLint fora do gate de build da S1 — o gate objetivo e type-check + build + vitest.
  // (Config de lint entra numa fatia futura, sem bloquear a fundacao.)
  eslint: {
    ignoreDuringBuilds: true,
  },
  // Headers de seguranca HTTP aplicados a todas as rotas (ADR 0003, item 2.3).
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
