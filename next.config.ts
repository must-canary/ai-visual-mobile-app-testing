import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: [
    "webdriverio",
    "webdriver",
    "@wdio/protocols",
    "@wdio/logger",
    "@wdio/types",
    "@wdio/globals",
    "@wdio/utils",
    "@wdio/config",
    "@wdio/repl",
    "sharp",
    "mongodb",
  ],
};

export default nextConfig;
