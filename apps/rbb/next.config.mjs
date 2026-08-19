/** @type {import('next').NextConfig} */
const nextConfig = {
  // @jff/db ships TypeScript source rather than a build step, so Next compiles it.
  // Only its row *types* are imported now — the site reads a committed JSON
  // snapshot rather than a database — but the package is still transpiled because
  // type-only imports resolve through it.
  transpilePackages: ['@jff/db'],
  // pg is a Node library and must never be bundled for the browser. Nothing in the
  // app imports it any more, but the guard costs nothing and stops a stray import
  // from silently breaking the build.
  serverExternalPackages: ['pg'],
  eslint: { ignoreDuringBuilds: true },
  typescript: { ignoreBuildErrors: false },
};

export default nextConfig;
