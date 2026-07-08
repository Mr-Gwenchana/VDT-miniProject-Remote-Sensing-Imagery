/** @type {import('next').NextConfig} */
const nextConfig = {
  turbopack: {},
  webpack: (config, { isServer }) => {
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        path: false,
        http: false,
        https: false,
        url: false,
        buffer: false,
      };
    }
    return config;
  },
};

export default nextConfig;
