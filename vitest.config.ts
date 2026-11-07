import { cloudflareTest } from "@cloudflare/vitest-plugin";
import { generateKeyPairSync } from "node:crypto";
import { defineConfig } from "vitest/config";

// A throwaway VAPID key pair for tests, made fresh on every run.
const { publicKey, privateKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
const pub = publicKey.export({ format: "jwk" });
const raw = Buffer.concat([Buffer.from([4]), Buffer.from(pub.x!, "base64url"), Buffer.from(pub.y!, "base64url")]);
const vapid = {
  VAPID_PUBLIC_KEY: raw.toString("base64url"),
  VAPID_PRIVATE_KEY: privateKey.export({ format: "jwk" }).d!,
  VAPID_SUBJECT: "mailto:test@aboard.test",
};

export default defineConfig({
  test: { include: ["test/**/*.test.ts"] },
  plugins: [
    cloudflareTest({
      wrangler: { configPath: "./wrangler.jsonc" },
      miniflare: { bindings: { JWT_KEY: "test-jwt-key", ADMIN_SECRET: "test-admin-secret", ...vapid } },
    }),
  ],
});
