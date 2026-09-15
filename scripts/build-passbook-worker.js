const fs = require("node:fs");
const path = require("node:path");

const rootDir = path.join(__dirname, "..");
const htmlPath = path.join(rootDir, "passbook.html");
const outPath = path.join(rootDir, "worker.js");

const html = fs.readFileSync(htmlPath, "utf8");

const header = `// ============================================================
// 小黑的財務存摺 - Cloudflare Worker (含 KV 雲端同步)
// 這份檔案由 scripts/build-passbook-worker.js 從 passbook.html 自動產生
// 若要修改網頁內容/樣式，請改 passbook.html 再重新執行:
//   node scripts/build-passbook-worker.js
// 記得先建立 KV Namespace 並綁定變數名稱為 PASSBOOK_KV
// ============================================================

`;

const backend = `
const KV_KEY = "passbook-data";

function jsonResponse(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: {
      "Content-Type": "application/json; charset=UTF-8",
      "Access-Control-Allow-Origin": "*",
    },
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/api/data") {
      if (request.method === "GET") {
        const stored = await env.PASSBOOK_KV.get(KV_KEY);
        if (!stored) {
          return jsonResponse({});
        }
        return new Response(stored, {
          status: 200,
          headers: {
            "Content-Type": "application/json; charset=UTF-8",
            "Access-Control-Allow-Origin": "*",
          },
        });
      }

      if (request.method === "POST") {
        try {
          const body = await request.text();
          JSON.parse(body); // 驗證是合法 JSON 才存
          await env.PASSBOOK_KV.put(KV_KEY, body);
          return jsonResponse({ ok: true });
        } catch (e) {
          return jsonResponse({ ok: false, error: "invalid json" }, 400);
        }
      }

      return new Response("Method Not Allowed", { status: 405 });
    }

    // 其他所有路徑都回傳網頁本體
    return new Response(HTML_PAGE, {
      status: 200,
      headers: { "Content-Type": "text/html; charset=UTF-8" },
    });
  },
};
`;

const source = header + `const HTML_PAGE = ${JSON.stringify(html)};\n` + backend;

fs.writeFileSync(outPath, source, "utf8");
console.log(`Wrote ${outPath} (${html.length} chars of HTML embedded)`);
