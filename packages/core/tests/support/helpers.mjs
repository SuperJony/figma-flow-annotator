import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

export async function importCoreModule() {
  return import(`${resolve(packageRoot, "src/index.ts")}?cache=${Date.now()}-${Math.random()}`);
}
