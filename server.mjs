import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { dirname, extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const publicDir = join(__dirname, "public");
const port = Number(process.env.PORT || 5206);
const host = process.env.HOST || "127.0.0.1";

const mime = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml"
};

function safePath(url) {
  const parsed = new URL(url, `http://${host}:${port}`);
  const pathname = parsed.pathname === "/" ? "/index.html" : parsed.pathname;
  const clean = normalize(decodeURIComponent(pathname)).replace(/^(\.\.[/\\])+/, "");
  return join(publicDir, clean);
}

const server = createServer(async (req, res) => {
  try {
    const filePath = safePath(req.url || "/");
    if (!filePath.startsWith(publicDir)) {
      res.writeHead(403);
      res.end("Forbidden");
      return;
    }

    const data = await readFile(filePath);
    res.writeHead(200, {
      "Content-Type": mime[extname(filePath)] || "application/octet-stream",
      "Cache-Control": "no-store"
    });
    res.end(data);
  } catch {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Not found");
  }
});

server.listen(port, host, () => {
  console.log("土耳其跳棋已启动：");
  console.log(`本机访问：http://localhost:${port}`);
});
