/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  allowedDevOrigins: ['127.0.0.1'],
  // Allow OneChain SDK WASM modules
  serverExternalPackages: ['@onelabs/sui'],
  async rewrites() {
    return [
      {
        source: '/favicon.ico',
        destination: '/favicon.svg',
      },
    ];
  },
};

module.exports = nextConfig;
