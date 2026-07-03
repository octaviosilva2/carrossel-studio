/** @type {import('next').NextConfig} */
const nextConfig = {
  // ESLint fora do gate de build da S1 — o gate objetivo e type-check + build + vitest.
  // (Config de lint entra numa fatia futura, sem bloquear a fundacao.)
  eslint: {
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;
