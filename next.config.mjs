/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverComponentsExternalPackages: ["googleapis", "@react-pdf/renderer"],
  },
};

export default nextConfig;
