/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Allow @mysten/sui WASM modules
  experimental: {
    serverComponentsExternalPackages: ['@mysten/sui'],
  },
};

module.exports = nextConfig;
