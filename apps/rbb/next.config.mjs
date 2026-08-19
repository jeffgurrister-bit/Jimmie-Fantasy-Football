/** @type {import('next').NextConfig} */
const nextConfig = {
  // @jff/db ships TypeScript source rather than a build step, so Next compiles it.
  transpilePackages: ['@jff/db'],
  // pg is a Node library and must not be bundled for the browser or the edge.
  serverExternalPackages: ['pg'],
  eslint: { ignoreDuringBuilds: true },
  typescript: { ignoreBuildErrors: false },
};

export default nextConfig;
