/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // No outbound calls at build or run time — see README, "Security posture".
  output: 'standalone',
  // @node-rs/argon2 is a native addon. Webpack must not bundle it — doing so
  // kills the server process on first use with no error logged.
  serverExternalPackages: ['@node-rs/argon2'],
};
export default nextConfig;
