import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // 隐藏 Next.js 默认开发菜单，改用项目自定义 API 链接菜单
  devIndicators: false,
};

export default nextConfig;
