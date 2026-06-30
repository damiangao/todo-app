/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone", // Docker 镜像小
  experimental: {},
  webpack: (config) => {
    // 显式声明 .tsx 是有效扩展名
    config.resolve.extensions = [...config.resolve.extensions, '.tsx', '.ts'];
    return config;
  },
};

module.exports = nextConfig;
