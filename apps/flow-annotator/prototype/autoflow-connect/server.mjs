import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { createServer } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));
const port = Number.parseInt(process.env.PORT || "4177", 10);

const mimeTypes = new Map([
  [".css", "text/css; charset=utf-8"],
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".svg", "image/svg+xml"],
]);

const server = createServer(async (request, response) => {
  const url = new URL(request.url || "/", `http://${request.headers.host || "127.0.0.1"}`);
  const pathname = url.pathname === "/" ? "/index.html" : url.pathname;
  const candidate = path.normalize(path.join(root, pathname));

  if (!candidate.startsWith(root)) {
    response.writeHead(403);
    response.end("Forbidden");
    return;
  }

  try {
    const fileStat = await stat(candidate);
    if (!fileStat.isFile()) {
      throw new Error("Not a file");
    }
    response.writeHead(200, {
      "Cache-Control": "no-store",
      "Content-Type": mimeTypes.get(path.extname(candidate)) || "application/octet-stream",
    });
    createReadStream(candidate).pipe(response);
  } catch {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Not found");
  }
});

server.listen(port, "127.0.0.1", () => {
  console.log(`Autoflow Connect prototype: http://127.0.0.1:${port}/?variant=A`);
});
