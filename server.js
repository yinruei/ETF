const http = require("node:http");
const fs = require("node:fs/promises");
const path = require("node:path");
const { URL } = require("node:url");

const PORT = Number(process.env.PORT || 4173);
const HOST = process.env.HOST || "0.0.0.0";
const PUBLIC_DIR = path.join(__dirname, "public");
const STATIC_DATA_DIR = path.join(PUBLIC_DIR, "static-data");
const DATA_DIR = path.join(__dirname, "data");
const SNAPSHOT_DIR = path.join(DATA_DIR, "snapshots");
const ETF_CODE = "00981A";
const SOURCE_ORIGIN = "https://zdsetf.com";
const CACHE_TTL_MS = 10 * 60 * 1000;
const cache = new Map();

const tabLabels = {
  increase: "加碼",
  new: "新增",
  decrease: "減碼",
  removed: "刪除",
  all: "全部持股"
};

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon"
};

function json(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store"
  });
  res.end(body);
}

function getCached(key) {
  const hit = cache.get(key);
  if (!hit || hit.expiresAt < Date.now()) return null;
  return hit.value;
}

function setCached(key, value) {
  cache.set(key, {
    value,
    expiresAt: Date.now() + CACHE_TTL_MS
  });
}

async function fetchText(url) {
  const key = `fetch:${url}`;
  const cached = getCached(key);
  if (cached) return cached;

  const response = await fetch(url, {
    headers: {
      "accept": "text/html,application/xhtml+xml",
      "user-agent": "00981A local research dashboard"
    },
    signal: AbortSignal.timeout(15000)
  });

  if (!response.ok) {
    throw new Error(`Source returned HTTP ${response.status}`);
  }

  const html = await response.text();
  setCached(key, html);
  return html;
}

function sourceUrlFor(date) {
  const url = new URL(`/etf/${ETF_CODE}`, SOURCE_ORIGIN);
  if (date) url.searchParams.set("on", date);
  return url.toString();
}

async function getSnapshot(date, options = {}) {
  const includePrevious = options.includePrevious !== false;
  const key = `snapshot:${date || "latest"}:${includePrevious ? "with-prev" : "single"}`;
  const cached = getCached(key);
  if (cached) return cached;

  const url = sourceUrlFor(date);
  const html = await fetchText(url);
  const snapshot = parseSnapshot(html, url);

  if (includePrevious) {
    const previousDate = findPreviousDate(snapshot.dates, snapshot.date);
    snapshot.previousDate = previousDate;

    if (previousDate) {
      try {
        const previous = await getSnapshot(previousDate, { includePrevious: false });
        annotatePreviousWeights(snapshot, previous);
      } catch (error) {
        snapshot.previousLoadError = error.message;
      }
    }
  }

  setCached(key, snapshot);
  return snapshot;
}

async function getHistory(days) {
  const count = Math.max(2, Math.min(Number(days) || 7, 30));
  const key = `history:${count}`;
  const cached = getCached(key);
  if (cached) return cached;

  const latest = await getSnapshot(null, { includePrevious: false });
  const dates = latest.dates.slice(0, count);
  const snapshots = await Promise.all(
    dates.map((date) => getSnapshot(date, { includePrevious: false }))
  );

  const payload = {
    etf: ETF_CODE,
    dates,
    generatedAt: new Date().toISOString(),
    source: latest.source,
    snapshots: snapshots.map(toHistoryItem)
  };
  setCached(key, payload);
  return payload;
}

function snapshotArchivePath(date) {
  return path.join(SNAPSHOT_DIR, `${ETF_CODE}-${date}.json`);
}

async function saveSnapshot(snapshot) {
  if (!snapshot.date) {
    throw new Error("Snapshot has no date and cannot be archived");
  }

  await fs.mkdir(SNAPSHOT_DIR, { recursive: true });
  const snapshotPath = snapshotArchivePath(snapshot.date);
  const latestPath = path.join(DATA_DIR, "latest.json");
  const body = `${JSON.stringify(snapshot, null, 2)}\n`;

  await fs.writeFile(snapshotPath, body, "utf8");
  await fs.writeFile(latestPath, body, "utf8");

  return { snapshotPath, latestPath };
}

async function updateArchive(date = null) {
  const snapshot = await getSnapshot(date, { includePrevious: true });
  const paths = await saveSnapshot(snapshot);
  return {
    date: snapshot.date,
    counts: snapshot.counts,
    totalMarketValueText: snapshot.totalMarketValueText,
    source: snapshot.source,
    ...paths
  };
}

async function writeJsonFile(filePath, payload) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

async function exportStaticData(days = 30) {
  const count = Math.max(2, Math.min(Number(days) || 30, 60));
  const latest = await getSnapshot(null, { includePrevious: true });
  const dates = latest.dates.slice(0, count);
  const snapshots = [];

  for (const date of dates) {
    snapshots.push(await getSnapshot(date, { includePrevious: true }));
  }

  const history = {
    etf: ETF_CODE,
    dates,
    generatedAt: new Date().toISOString(),
    source: latest.source,
    snapshots: snapshots.map(toHistoryItem)
  };

  await writeJsonFile(path.join(STATIC_DATA_DIR, "snapshot-latest.json"), latest);
  await writeJsonFile(path.join(STATIC_DATA_DIR, "history.json"), history);

  for (const snapshot of snapshots) {
    await writeJsonFile(
      path.join(STATIC_DATA_DIR, "snapshots", `${ETF_CODE}-${snapshot.date}.json`),
      snapshot
    );
  }

  return {
    latestDate: latest.date,
    days: dates.length,
    outputDir: STATIC_DATA_DIR
  };
}

function toHistoryItem(snapshot) {
  const changes = [
    ...snapshot.changes.increase,
    ...snapshot.changes.new,
    ...snapshot.changes.decrease,
    ...snapshot.changes.removed
  ].sort((a, b) => Math.abs(b.changeLots) - Math.abs(a.changeLots));

  return {
    date: snapshot.date,
    counts: snapshot.counts,
    totalMarketValueText: snapshot.totalMarketValueText,
    changes: changes.slice(0, 12)
  };
}

function parseSnapshot(html, source) {
  const title = text(matchOne(html, /<h1>([\s\S]*?)<\/h1>/));
  const selectedDate =
    attrMatch(html, /<input[^>]+name="on"[^>]+value="([^"]+)"/) ||
    attrMatch(html, /<span class="muted">(\d{4}-\d{2}-\d{2})<\/span>/);

  const dates = unique(
    [...html.matchAll(/<option value="(\d{4}-\d{2}-\d{2})">/g)].map((m) => m[1])
  );

  const totalMarketValueText = text(
    matchOne(html, /持股市值合計\s*<strong>([\s\S]*?)<\/strong>/)
  );

  const premium = parsePremium(html);
  const performance = parsePerformance(html);
  const panes = parsePanes(html);
  const holdings = parseHoldings(panes.all || "");
  const holdingsByCode = new Map(holdings.map((item) => [item.code, item]));

  const changes = {
    increase: parseChangeRows(panes.increase || "", "increase", holdingsByCode),
    new: parseChangeRows(panes.new || "", "new", holdingsByCode),
    decrease: parseChangeRows(panes.decrease || "", "decrease", holdingsByCode),
    removed: parseChangeRows(panes.removed || "", "removed", holdingsByCode)
  };

  const counts = {
    increase: changes.increase.length,
    new: changes.new.length,
    decrease: changes.decrease.length,
    removed: changes.removed.length,
    all: holdings.length
  };

  return {
    etf: ETF_CODE,
    title,
    date: selectedDate || dates[0] || null,
    dates,
    premium,
    performance,
    totalMarketValueText,
    counts,
    changes,
    holdings,
    source,
    fetchedAt: new Date().toISOString()
  };
}

function parsePremium(html) {
  const entries = {};
  const premiumRe = /<div class="premium-label muted">([\s\S]*?)<\/div>\s*<div class="premium-value[^"]*">([\s\S]*?)<\/div>\s*<div class="premium-sub muted">([\s\S]*?)<\/div>/g;
  for (const match of html.matchAll(premiumRe)) {
    const label = text(match[1]);
    entries[label] = {
      value: text(match[2]),
      note: text(match[3])
    };
  }
  return entries;
}

function parsePerformance(html) {
  const items = [];
  const metricRe = /<div class="metric">\s*<div class="metric-label">([\s\S]*?)<\/div>\s*<div class="metric-value[^"]*">([\s\S]*?)<\/div>\s*<\/div>/g;
  for (const match of html.matchAll(metricRe)) {
    items.push({
      label: text(match[1]),
      value: text(match[2])
    });
  }
  return items;
}

function parsePanes(html) {
  const panes = {};
  const bodyMatch = html.match(/<div class="tab-body">([\s\S]*?)<section class="faq">/);
  const body = bodyMatch ? bodyMatch[1] : html;
  const starts = [...body.matchAll(/<div class="tab-pane" data-tab="(increase|new|decrease|removed|all)"[^>]*>/g)]
    .map((match) => ({
      tab: match[1],
      start: match.index,
      contentStart: match.index + match[0].length
    }));

  for (let index = 0; index < starts.length; index += 1) {
    const current = starts[index];
    const next = starts[index + 1];
    panes[current.tab] = body.slice(current.contentStart, next ? next.start : body.length);
  }

  return panes;
}

function parseHoldings(html) {
  return parseRows(firstTableWithClass(html, "holdings")).map((cells) => ({
    code: cells[0],
    name: cells[1],
    sharesText: cells[2],
    shares: parseNumber(cells[2]),
    weightText: formatPercent(cells[3]),
    weight: parseNumber(cells[3]),
    marketValueText: cells[4],
    marketValueYi: parseNumber(cells[4])
  })).filter((row) => row.code);
}

function parseChangeRows(html, type, holdingsByCode) {
  return parseRows(firstTableWithClass(html, "changes")).map((cells) => {
    const holding = holdingsByCode.get(cells[0]);
    const hasPrice = cells.length >= 7;
    const row = {
      type,
      typeLabel: tabLabels[type],
      code: cells[0],
      name: cells[1],
      previousSharesText: cells[2],
      previousShares: parseNumber(cells[2]),
      currentSharesText: cells[3],
      currentShares: parseNumber(cells[3]),
      changeText: cells[4],
      changeLots: parseLots(cells[4]),
      estimatedPriceText: hasPrice ? cells[5] : "",
      estimatedPrice: hasPrice ? parseNumber(cells[5]) : null,
      marketValueText: hasPrice ? cells[6] : cells[5],
      currentWeightText: holding ? holding.weightText : "0.00%",
      currentWeight: holding ? holding.weight : 0,
      currentMarketValueYi: holding ? holding.marketValueYi : 0,
      currentHoldingShares: holding ? holding.shares : 0
    };
    return row;
  }).filter((row) => row.code);
}

function firstTableWithClass(html, className) {
  const tableRe = new RegExp(`<table[^>]*class="[^"]*\\b${className}\\b[^"]*"[^>]*>[\\s\\S]*?<\\/table>`);
  const match = html.match(tableRe);
  return match ? match[0] : "";
}

function parseRows(html) {
  const rows = [];
  for (const rowMatch of html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)) {
    const cells = [...rowMatch[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)]
      .map((cell) => text(cell[1]));
    if (cells.length) rows.push(cells);
  }
  return rows;
}

function annotatePreviousWeights(snapshot, previous) {
  const previousByCode = new Map(previous.holdings.map((item) => [item.code, item]));
  for (const group of Object.values(snapshot.changes)) {
    for (const row of group) {
      const previousHolding = previousByCode.get(row.code);
      row.previousWeight = previousHolding ? previousHolding.weight : 0;
      row.previousWeightText = previousHolding ? previousHolding.weightText : "0.00%";
      row.weightDelta = round(row.currentWeight - row.previousWeight, 4);
      row.weightDeltaText = formatSignedPercent(row.weightDelta);
    }
  }
}

function findPreviousDate(dates, selectedDate) {
  const index = dates.indexOf(selectedDate);
  if (index === -1) return null;
  return dates[index + 1] || null;
}

function unique(values) {
  return [...new Set(values)];
}

function matchOne(value, regex) {
  const match = value.match(regex);
  return match ? match[1] : "";
}

function attrMatch(value, regex) {
  const match = value.match(regex);
  return match ? match[1] : "";
}

function text(value) {
  return decodeHtml(String(value || ""))
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function decodeHtml(value) {
  return value
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'");
}

function parseNumber(value) {
  const normalized = String(value || "")
    .replace(/,/g, "")
    .replace(/%/g, "")
    .replace(/[^\d.+-]/g, "");
  if (!normalized || normalized === "-" || normalized === "+") return 0;
  const number = Number(normalized);
  return Number.isFinite(number) ? number : 0;
}

function parseLots(value) {
  return parseNumber(value);
}

function formatPercent(value) {
  const number = parseNumber(value);
  return `${number.toFixed(2)}%`;
}

function formatSignedPercent(value) {
  const number = Number(value) || 0;
  const prefix = number > 0 ? "+" : "";
  return `${prefix}${number.toFixed(2)}%`;
}

function round(value, decimals) {
  const factor = 10 ** decimals;
  return Math.round((Number(value) || 0) * factor) / factor;
}

async function serveStatic(req, res, url) {
  let pathname = decodeURIComponent(url.pathname);
  if (pathname === "/") pathname = "/index.html";

  const filePath = path.normalize(path.join(PUBLIC_DIR, pathname));
  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  try {
    const body = await fs.readFile(filePath);
    const ext = path.extname(filePath);
    res.writeHead(200, {
      "content-type": mimeTypes[ext] || "application/octet-stream",
      "cache-control": "no-cache"
    });
    res.end(body);
  } catch (error) {
    if (error.code === "ENOENT") {
      res.writeHead(404);
      res.end("Not found");
    } else {
      res.writeHead(500);
      res.end("Server error");
    }
  }
}

async function handleApi(req, res, url) {
  try {
    if (url.pathname === "/api/health") {
      json(res, 200, { ok: true, etf: ETF_CODE });
      return;
    }

    if (url.pathname === "/api/snapshot") {
      const date = url.searchParams.get("date");
      const snapshot = await getSnapshot(date || null);
      json(res, 200, snapshot);
      return;
    }

    if (url.pathname === "/api/history") {
      const days = url.searchParams.get("days");
      const history = await getHistory(days);
      json(res, 200, history);
      return;
    }

    json(res, 404, { error: "Unknown API endpoint" });
  } catch (error) {
    json(res, 502, {
      error: "無法讀取 00981A 持股資料",
      detail: error.message
    });
  }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  if (url.pathname.startsWith("/api/")) {
    await handleApi(req, res, url);
    return;
  }
  await serveStatic(req, res, url);
});

if (process.argv.includes("--export-static")) {
  const daysArg = process.argv.find((arg) => /^--days=\d+$/.test(arg));
  const days = daysArg ? Number(daysArg.split("=")[1]) : 30;
  exportStaticData(days)
    .then((result) => {
      console.log(JSON.stringify(result, null, 2));
    })
    .catch((error) => {
      console.error(error.stack || error.message);
      process.exitCode = 1;
    });
} else if (process.argv.includes("--update")) {
  const dateArg = process.argv.find((arg) => /^\d{4}-\d{2}-\d{2}$/.test(arg));
  updateArchive(dateArg || null)
    .then((result) => {
      console.log(JSON.stringify(result, null, 2));
    })
    .catch((error) => {
      console.error(error.stack || error.message);
      process.exitCode = 1;
    });
} else {
  server.listen(PORT, HOST, () => {
    console.log(`00981A dashboard running on http://${HOST}:${PORT}`);
  });
}
