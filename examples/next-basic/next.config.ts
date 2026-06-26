import type { NextConfig } from "next";
import path from "node:path";
import { fileURLToPath } from "node:url";

const nextConfig: NextConfig = {
  outputFileTracingRoot: path.resolve(fileURLToPath(new URL("../..", import.meta.url))),
};

export default nextConfig;
