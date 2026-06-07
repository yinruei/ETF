const fs = require("node:fs/promises");
const path = require("node:path");

const rootDir = path.join(__dirname, "..");
const publicDir = path.join(rootDir, "public");
const outputFile = path.join(rootDir, "dist", "server", "index.js");

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon"
};

async function walk(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...await walk(fullPath));
    } else {
      files.push(fullPath);
    }
  }

  return files;
}

function routeFor(filePath) {
  const relative = path.relative(publicDir, filePath).replace(/\\/g, "/");
  return `/${relative}`;
}

async function main() {
  const files = await walk(publicDir);
  const assets = {};

  for (const filePath of files) {
    const route = routeFor(filePath);
    assets[route] = {
      body: await fs.readFile(filePath, "utf8"),
      type: mimeTypes[path.extname(filePath)] || "text/plain; charset=utf-8"
    };
  }

  assets["/"] = assets["/index.html"];

  const source = `const assets = ${JSON.stringify(assets)};\n\n` +
`function response(body, type = "text/plain; charset=utf-8", status = 200) {\n` +
`  return new Response(body, {\n` +
`    status,\n` +
`    headers: {\n` +
`      "content-type": type,\n` +
`      "cache-control": "no-cache"\n` +
`    }\n` +
`  });\n` +
`}\n\n` +
`function json(payload, status = 200) {\n` +
`  return response(JSON.stringify(payload), "application/json; charset=utf-8", status);\n` +
`}\n\n` +
`function getJsonAsset(pathname) {\n` +
`  const asset = assets[pathname];\n` +
`  if (!asset) return null;\n` +
`  return JSON.parse(asset.body);\n` +
`}\n\n` +
`export default {\n` +
`  async fetch(request) {\n` +
`    const url = new URL(request.url);\n` +
`    const pathname = url.pathname;\n\n` +
`    if (pathname === "/api/health") {\n` +
`      return json({ ok: true, etf: "00981A", mode: "worker-static" });\n` +
`    }\n\n` +
`    if (pathname === "/api/snapshot") {\n` +
`      const date = url.searchParams.get("date");\n` +
`      const assetPath = date ? \`/static-data/snapshots/00981A-\${date}.json\` : "/static-data/snapshot-latest.json";\n` +
`      const snapshot = getJsonAsset(assetPath);\n` +
`      return snapshot ? json(snapshot) : json({ error: "Snapshot not found" }, 404);\n` +
`    }\n\n` +
`    if (pathname === "/api/history") {\n` +
`      const days = Math.max(2, Math.min(Number(url.searchParams.get("days")) || 10, 30));\n` +
`      const history = getJsonAsset("/static-data/history.json");\n` +
`      if (!history) return json({ error: "History not found" }, 404);\n` +
`      return json({\n` +
`        ...history,\n` +
`        dates: history.dates.slice(0, days),\n` +
`        snapshots: history.snapshots.slice(0, days)\n` +
`      });\n` +
`    }\n\n` +
`    const asset = assets[pathname] || (pathname.endsWith("/") ? assets[\`\${pathname}index.html\`] : null);\n` +
`    if (asset) return response(asset.body, asset.type);\n` +
`    return response("Not found", "text/plain; charset=utf-8", 404);\n` +
`  }\n` +
`};\n`;

  await fs.mkdir(path.dirname(outputFile), { recursive: true });
  await fs.writeFile(outputFile, source, "utf8");
  console.log(`Wrote ${outputFile} with ${Object.keys(assets).length} routes`);
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
