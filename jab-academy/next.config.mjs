/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    outputFileTracingIncludes: {
      "/api/**/*": ["./prisma/seed.db"],
    },
  },
};

export default nextConfig;
