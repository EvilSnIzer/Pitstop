import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  workers: 1,
  testMatch: "**/*.spec.ts",
  webServer: process.env.CI
    ? [
        {
          command:
            "python ../backend/manage.py runserver 0.0.0.0:8000 --noreload",
          url: "http://127.0.0.1:8000/api/schema/",
          env: {
            ALLOWED_HOSTS: "localhost,127.0.0.1",
            GEMINI_API_KEY: "",
            AUTH_THROTTLE_RATE: "1000/minute",
            CORS_ALLOWED_ORIGINS: "http://localhost:3000,http://127.0.0.1:3000",
          },
          timeout: 60_000,
        },
        {
          command: "npm run start",
          env: { HOSTNAME: "0.0.0.0", PORT: "3000" },
          url: "http://127.0.0.1:3000/login",
          timeout: 60_000,
        },
      ]
    : undefined,
  use: {
    baseURL: process.env.PREVIEW_URL ?? "http://127.0.0.1:3000",
  },
});
