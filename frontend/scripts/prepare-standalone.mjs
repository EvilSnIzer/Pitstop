import { cpSync } from "node:fs";

if (!process.env.VERCEL) {
  cpSync("public", ".next/standalone/public", { recursive: true });
  cpSync(".next/static", ".next/standalone/.next/static", { recursive: true });
}
