/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  allowedDevOrigins: ['127.0.0.1'],
  // Allow OneChain SDK WASM modules
  serverExternalPackages: ['@onelabs/sui'],
};

module.exports = nextConfig;
