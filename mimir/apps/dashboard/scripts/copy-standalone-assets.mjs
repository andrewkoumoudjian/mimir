import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const appDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const standaloneAppDir = resolve(
  appDir,
  ".next/standalone/apps/dashboard",
);

const copies = [
  {
    from: resolve(appDir, ".next/static"),
    to: resolve(standaloneAppDir, ".next/static"),
    required: true,
  },
  {
    from: resolve(appDir, "public"),
    to: resolve(standaloneAppDir, "public"),
    required: false,
  },
];

mkdirSync(standaloneAppDir, { recursive: true });

for (const { from, to, required } of copies) {
  if (!existsSync(from)) {
    if (required) {
      throw new Error(`Missing standalone asset source: ${from}`);
    }

    continue;
  }

  rmSync(to, { force: true, recursive: true });
  mkdirSync(dirname(to), { recursive: true });
  cpSync(from, to, { recursive: true });
}
