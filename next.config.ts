

/** @type {import('next').NextConfig} */

const withPWA = require('@ducanh2912/next-pwa').default({
  dest: 'public',
  sw: 'sw.js',
});

// Fix EventEmitter MaxListeners warning in development
if (process.env.NODE_ENV === 'development') {
  require('events').EventEmitter.defaultMaxListeners = 20;
}

const nextConfig = {
  experimental: {
    serverActions: {
      bodySizeLimit: '10mb',
    },
  },
  serverExternalPackages: ['zod'],
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'placehold.co',
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'firebasestorage.googleapis.com',
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'storage.googleapis.com',
        port: '',
        pathname: '/**',
      },
    ],
  },
  webpack: (config) => {
    config.experiments = { ...config.experiments, asyncWebAssembly: true };
    config.resolve.alias = {
      ...config.resolve.alias,
      handlebars: 'handlebars/dist/handlebars.js',
    };
    return config;
  },
  devIndicators: {
    allowedDevOrigins: [
      'https://6000-firebase-studio-1750545756427.cluster-3gc7bglotjgwuxlqpiut7yyqt4.cloudworkstations.dev',
    ],
  },
};

module.exports = withPWA(nextConfig);
