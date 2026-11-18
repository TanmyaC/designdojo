import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // The start route reads questions/*.md at runtime for the hidden spec; make sure they ship with it.
  outputFileTracingIncludes: { "/api/start": ["./questions/**/*.md"] },
};

export default nextConfig;
