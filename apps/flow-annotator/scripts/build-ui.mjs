import { spawnSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outputDir = path.join(packageRoot, ".panel-build");
const scriptOutput = path.join(outputDir, "panel.js");
const styleOutput = path.join(outputDir, "panel.css");
const tailwindBin = path.join(packageRoot, "node_modules", ".bin", "tailwindcss");

await mkdir(outputDir, { recursive: true });

runTailwind();
await bundleReactPanel();
await writePanelHtml();

function runTailwind() {
  const result = spawnSync(
    tailwindBin,
    ["-i", "src/panel/styles.css", "-o", styleOutput, "--minify"],
    {
      cwd: packageRoot,
      stdio: "inherit",
    },
  );

  if (result.status !== 0) {
    throw new Error("Tailwind failed to build the plugin panel stylesheet.");
  }
}

async function bundleReactPanel() {
  await build({
    bundle: true,
    define: {
      "process.env.NODE_ENV": '"production"',
    },
    entryPoints: ["src/panel/index.tsx"],
    format: "iife",
    jsx: "automatic",
    minify: true,
    outfile: scriptOutput,
    platform: "browser",
    target: "es2019",
    treeShaking: true,
    write: true,
  });
}

async function writePanelHtml() {
  const [script, style] = await Promise.all([
    readFile(scriptOutput, "utf8"),
    readFile(styleOutput, "utf8"),
  ]);
  await writeFile(
    path.join(packageRoot, "ui.html"),
    `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <style>${style}</style>
</head>
<body>
  <div id="root"></div>
  <script>${script}</script>
</body>
</html>
`,
  );
}
