const state = {
  snapshot: null,
  history: null,
  activeDashboard: null,
  activeTab: "all",
  tableMode: "changes",
  query: "",
  loading: false,
  booting: true
};

const els = {
  dateSelect: document.querySelector("#dateSelect"),
  historyDays: document.querySelector("#historyDays"),
  searchInput: document.querySelector("#searchInput"),
  refreshBtn: document.querySelector("#refreshBtn"),
  themeBtn: document.querySelector("#themeBtn"),
  dashboardMeta: document.querySelector("#dashboardMeta"),
  activeEtfCount: document.querySelector("#activeEtfCount"),
  commonSignalCount: document.querySelector("#commonSignalCount"),
  netFlowValue: document.querySelector("#netFlowValue"),
  signalList: document.querySelector("#signalList"),
  flowList: document.querySelector("#flowList"),
  rankingList: document.querySelector("#rankingList"),
  universeBody: document.querySelector("#universeBody"),
  sourceDate: document.querySelector("#sourceDate"),
  sourceLink: document.querySelector("#sourceLink"),
  priceValue: document.querySelector("#priceValue"),
  priceNote: document.querySelector("#priceNote"),
  navValue: document.querySelector("#navValue"),
  navNote: document.querySelector("#navNote"),
  premiumValue: document.querySelector("#premiumValue"),
  premiumNote: document.querySelector("#premiumNote"),
  marketValueTotal: document.querySelector("#marketValueTotal"),
  countChanged: document.querySelector("#countChanged"),
  countIncrease: document.querySelector("#countIncrease"),
  countNew: document.querySelector("#countNew"),
  countDecrease: document.querySelector("#countDecrease"),
  countRemoved: document.querySelector("#countRemoved"),
  countHoldings: document.querySelector("#countHoldings"),
  historyList: document.querySelector("#historyList"),
  tableTitle: document.querySelector("#tableTitle"),
  tableSubtitle: document.querySelector("#tableSubtitle"),
  tableHead: document.querySelector("#tableHead"),
  tableBody: document.querySelector("#tableBody"),
  emptyState: document.querySelector("#emptyState"),
  toast: document.querySelector("#toast")
};

const tabNames = {
  all: "全部異動",
  increase: "加碼",
  new: "新增",
  decrease: "減碼",
  removed: "刪除",
  holdings: "完整持股"
};

const typeOrder = {
  new: 1,
  increase: 2,
  decrease: 3,
  removed: 4
};

const basePath = new URL(".", document.baseURI).pathname;
const apiBase = basePath === "/" ? "/api" : `${basePath.replace(/\/$/, "")}/api`;
const assetVersion = Date.now().toString();

function appPath(path) {
  const url = new URL(path.replace(/^\//, ""), new URL(basePath, window.location.origin));
  url.searchParams.set("v", assetVersion);
  return url.toString();
}

init();

async function init() {
  bindEvents();
  await loadSnapshot();
  await loadHistory();
  await loadActiveDashboard();
  state.booting = false;
}

function bindEvents() {
  els.refreshBtn.addEventListener("click", async () => {
    await Promise.all([
      loadSnapshot(els.dateSelect.value || null),
      loadHistory(),
      loadActiveDashboard()
    ]);
  });

  els.dateSelect.addEventListener("change", async () => {
    if (state.booting) {
      if (state.snapshot?.date) els.dateSelect.value = state.snapshot.date;
      return;
    }
    await loadSnapshot(els.dateSelect.value);
  });

  els.historyDays.addEventListener("change", loadHistory);

  els.themeBtn.addEventListener("click", () => {
    const light = document.body.classList.toggle("light-theme");
    els.themeBtn.textContent = light ? "☾" : "☀";
    localStorage.setItem("active-etf-theme", light ? "light" : "dark");
  });

  if (localStorage.getItem("active-etf-theme") === "light") {
    document.body.classList.add("light-theme");
    els.themeBtn.textContent = "☾";
  }

  els.searchInput.addEventListener("input", () => {
    state.query = els.searchInput.value.trim().toLowerCase();
    renderTable();
  });

  document.querySelectorAll(".summary-tile").forEach((button) => {
    button.addEventListener("click", () => {
      const tab = button.dataset.tab;
      if (tab === "holdings") state.tableMode = "holdings";
      else state.tableMode = "changes";
      state.activeTab = tab === "holdings" ? "holdings" : tab;
      syncTabs();
      renderTable();
    });
  });

  document.querySelectorAll(".view-tab").forEach((button) => {
    button.addEventListener("click", () => {
      const tab = button.dataset.tab;
      state.tableMode = tab === "holdings" ? "holdings" : "changes";
      state.activeTab = tab === "holdings" ? "holdings" : "all";
      syncTabs();
      renderTable();
    });
  });
}

async function loadSnapshot(date = null) {
  setLoading(true);
  try {
    const url = new URL(`${apiBase}/snapshot`, window.location.origin);
    if (date) url.searchParams.set("date", date);
    const snapshot = await fetchJson(url);
    state.snapshot = snapshot;
    renderSnapshot();
    showToast(`已更新 ${snapshot.date} 持股資料`);
  } catch (error) {
    showToast(error.message || "讀取資料失敗");
  } finally {
    setLoading(false);
  }
}

async function loadHistory() {
  setLoading(true);
  try {
    const url = new URL(`${apiBase}/history`, window.location.origin);
    url.searchParams.set("days", els.historyDays.value || "10");
    state.history = await fetchJson(url);
    renderHistory();
  } catch (error) {
    showToast(error.message || "讀取歷史資料失敗");
  } finally {
    setLoading(false);
  }
}

async function loadActiveDashboard() {
  try {
    const staticResponse = await fetch(appPath("static-data/active-dashboard.json"));
    const dashboard = staticResponse.ok
      ? await staticResponse.json()
      : await fetchJson(new URL(`${apiBase}/active-dashboard`, window.location.origin));
    state.activeDashboard = dashboard;
    renderActiveDashboard();
  } catch (error) {
    els.dashboardMeta.textContent = "跨基金資料暫時無法載入。";
  }
}

async function fetchJson(url) {
  try {
    const response = await fetch(url);
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(data.detail || data.error || `HTTP ${response.status}`);
    }
    return data;
  } catch (error) {
    const fallback = await fetchStaticFallback(url);
    if (fallback) return fallback;
    throw error;
  }
}

async function fetchStaticFallback(url) {
  const requested = new URL(url, window.location.origin);

  if (requested.pathname.endsWith("/api/snapshot")) {
    const date = requested.searchParams.get("date");
    const fallbackPath = date
      ? appPath(`static-data/snapshots/00981A-${date}.json`)
      : appPath("static-data/snapshot-latest.json");
    return fetch(fallbackPath).then((response) => response.ok ? response.json() : null);
  }

  if (requested.pathname.endsWith("/api/history")) {
    const days = Number(requested.searchParams.get("days") || 10);
    const history = await fetch(appPath("static-data/history.json"))
      .then((response) => response.ok ? response.json() : null);
    if (!history) return null;
    return {
      ...history,
      dates: history.dates.slice(0, days),
      snapshots: history.snapshots.slice(0, days)
    };
  }

  if (requested.pathname.endsWith("/api/active-dashboard")) {
    return fetch(appPath("static-data/active-dashboard.json"))
      .then((response) => response.ok ? response.json() : null);
  }

  return null;
}

function renderActiveDashboard() {
  const dashboard = state.activeDashboard;
  if (!dashboard) return;
  const etfs = dashboard.etfs || [];
  const flows = dashboard.flows || [];
  const signals = dashboard.signals || [];
  const netFlow = etfs.reduce((total, item) => total + (item.flowProxyYi || 0), 0);
  els.dashboardMeta.textContent = `更新 ${formatTime(dashboard.generatedAt)} · 資料涵蓋 ${dashboard.etfCount || etfs.length} 檔已上市主動式 ETF`;
  els.activeEtfCount.textContent = dashboard.etfCount || etfs.length;
  els.commonSignalCount.textContent = signals.length;
  els.netFlowValue.textContent = `${netFlow >= 0 ? "+" : ""}${netFlow.toFixed(1)} 億`;
  els.netFlowValue.className = netFlow >= 0 ? "positive" : "negative";
  els.signalList.innerHTML = signals.slice(0, 6).map((item, index) => `<div class="signal-row"><strong>${index + 1}</strong><span><b>${escapeHtml(item.code)} ${escapeHtml(item.name)}</b><small>被 ${item.funds} 檔基金持有 · 平均 ${item.avgWeight.toFixed(2)}%</small></span><em>${item.funds} 檔</em></div>`).join("") || '<p class="empty-state">尚無共同持股資料。</p>';
  els.flowList.innerHTML = flows.slice(0, 6).map((item) => `<div class="flow-row"><span><b>${escapeHtml(item.code)} ${escapeHtml(item.name)}</b><small>買 ${item.buyProxyYi.toFixed(2)} / 賣 ${item.sellProxyYi.toFixed(2)} 億</small></span><strong class="${item.flowProxyYi >= 0 ? "positive" : "negative"}">${item.flowProxyYi >= 0 ? "+" : ""}${item.flowProxyYi.toFixed(2)} 億</strong></div>`).join("") || '<p class="empty-state">尚無持股調整資料。</p>';
  const ranked = etfs.filter((item) => Number.isFinite(item.monthReturn)).sort((a, b) => b.monthReturn - a.monthReturn).slice(0, 6);
  els.rankingList.innerHTML = ranked.map((item, index) => `<div class="ranking-row"><strong>${String(index + 1).padStart(2, "0")}</strong><span><b>${escapeHtml(item.code)} ${escapeHtml(item.name)}</b><small>${escapeHtml(item.type)}</small></span><em class="${item.monthReturn >= 0 ? "positive" : "negative"}">${escapeHtml(item.monthReturnText)}</em></div>`).join("") || '<p class="empty-state">來源未提供近一月績效。</p>';
  els.universeBody.innerHTML = etfs.map((item) => `<tr><td class="code">${escapeHtml(item.code)}</td><td>${escapeHtml(item.name)}</td><td><span class="type-chip">${escapeHtml(item.type)}</span></td><td class="num">${escapeHtml(item.price)}</td><td class="num ${item.monthReturn >= 0 ? "positive" : "negative"}">${escapeHtml(item.monthReturnText)}</td><td class="num ${item.flowProxyYi >= 0 ? "positive" : "negative"}">${item.flowProxyYi >= 0 ? "+" : ""}${item.flowProxyYi.toFixed(2)}</td><td class="num">${item.changeCount}</td></tr>`).join("");
}

function formatTime(value) {
  if (!value) return "--";
  return new Intl.DateTimeFormat("zh-TW", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

function renderSnapshot() {
  const snapshot = state.snapshot;
  if (!snapshot) return;

  renderDateSelect(snapshot);
  renderMetrics(snapshot);
  renderCounts(snapshot);
  renderTable();
  renderHistory();
}

function renderDateSelect(snapshot) {
  const currentOptions = [...els.dateSelect.options].map((option) => option.value);
  if (currentOptions.join("|") !== snapshot.dates.join("|")) {
    els.dateSelect.innerHTML = snapshot.dates
      .map((date) => `<option value="${escapeHtml(date)}">${escapeHtml(date)}</option>`)
      .join("");
  }
  els.dateSelect.value = snapshot.date;
}

function renderMetrics(snapshot) {
  const premium = snapshot.premium || {};
  setMetric(els.priceValue, els.priceNote, premium["最新市價"]);
  setMetric(els.navValue, els.navNote, premium["最新淨值 NAV"]);
  setMetric(els.premiumValue, els.premiumNote, premium["溢價 / 折價"]);
  els.marketValueTotal.textContent = snapshot.totalMarketValueText || "--";
  els.sourceDate.textContent = `資料日 ${snapshot.date}`;
  els.sourceLink.href = snapshot.source || "https://zdsetf.com/etf/00981A";
}

function setMetric(valueEl, noteEl, item) {
  valueEl.textContent = item?.value || "--";
  noteEl.textContent = item?.note || "--";
  valueEl.classList.toggle("positive", item?.value?.startsWith("+"));
  valueEl.classList.toggle("negative", item?.value?.startsWith("-"));
}

function renderCounts(snapshot) {
  const counts = snapshot.counts || {};
  const changed = (counts.increase || 0) + (counts.new || 0) + (counts.decrease || 0) + (counts.removed || 0);
  els.countChanged.textContent = changed;
  els.countIncrease.textContent = counts.increase || 0;
  els.countNew.textContent = counts.new || 0;
  els.countDecrease.textContent = counts.decrease || 0;
  els.countRemoved.textContent = counts.removed || 0;
  els.countHoldings.textContent = counts.all || 0;
}

function renderHistory() {
  const history = state.history;
  if (!history) return;

  els.historyList.innerHTML = history.snapshots.map((item) => {
    const chips = [
      ["加", item.counts.increase],
      ["新", item.counts.new],
      ["減", item.counts.decrease],
      ["刪", item.counts.removed]
    ].map(([label, value]) => `<span class="pill">${label} ${value || 0}</span>`).join("");

    const changes = item.changes.slice(0, 4).map((change) => `
      <div class="history-change">
        <span>${escapeHtml(change.code)} ${escapeHtml(change.name)}</span>
        <strong class="${change.changeLots >= 0 ? "positive" : "negative"}">${escapeHtml(change.changeText)}</strong>
      </div>
    `).join("");

    const active = state.snapshot?.date === item.date ? " is-active" : "";
    return `
      <article class="history-day${active}">
        <button type="button" data-date="${escapeHtml(item.date)}">
          <div class="history-date">
            <span>${escapeHtml(item.date)}</span>
            <span class="muted">${escapeHtml(item.totalMarketValueText || "")}</span>
          </div>
          <div class="pill-row">${chips}</div>
          <div class="history-changes">${changes || '<span class="muted">當日沒有異動</span>'}</div>
        </button>
      </article>
    `;
  }).join("");

  els.historyList.querySelectorAll("button[data-date]").forEach((button) => {
    button.addEventListener("click", async () => {
      await loadSnapshot(button.dataset.date);
    });
  });
}

function renderTable() {
  const snapshot = state.snapshot;
  if (!snapshot) return;

  const rows = state.tableMode === "holdings" ? getHoldingRows(snapshot) : getChangeRows(snapshot);
  const filtered = filterRows(rows);

  if (state.tableMode === "holdings") {
    renderHoldingsTable(filtered);
  } else {
    renderChangesTable(filtered);
  }

  els.emptyState.hidden = filtered.length > 0;
  syncTabs();
}

function getChangeRows(snapshot) {
  if (state.activeTab && !["all", "holdings"].includes(state.activeTab)) {
    return [...(snapshot.changes[state.activeTab] || [])];
  }

  return [
    ...(snapshot.changes.new || []),
    ...(snapshot.changes.increase || []),
    ...(snapshot.changes.decrease || []),
    ...(snapshot.changes.removed || [])
  ].sort((a, b) => {
    const order = (typeOrder[a.type] || 9) - (typeOrder[b.type] || 9);
    if (order !== 0) return order;
    return Math.abs(b.changeLots) - Math.abs(a.changeLots);
  });
}

function getHoldingRows(snapshot) {
  return [...(snapshot.holdings || [])].sort((a, b) => (b.weight || 0) - (a.weight || 0));
}

function filterRows(rows) {
  if (!state.query) return rows;
  return rows.filter((row) => {
    const haystack = `${row.code} ${row.name}`.toLowerCase();
    return haystack.includes(state.query);
  });
}

function renderChangesTable(rows) {
  els.tableTitle.textContent = `${state.snapshot.date} ${tabNames[state.activeTab] || "全部異動"}`;
  els.tableSubtitle.textContent = "權重欄位為該日期收盤後持股比例；權重變化以相鄰前一個快照估算。";
  els.tableHead.innerHTML = `
    <tr>
      <th>狀態</th>
      <th>代號</th>
      <th>名稱</th>
      <th class="num">前日股數</th>
      <th class="num">當日股數</th>
      <th class="num">變動張數</th>
      <th class="num">權重</th>
      <th class="num">權重變化</th>
      <th class="num">推估均價</th>
      <th class="num">市值</th>
    </tr>
  `;
  els.tableBody.innerHTML = rows.map((row) => `
    <tr>
      <td><span class="type-chip type-${escapeHtml(row.type)}">${escapeHtml(row.typeLabel)}</span></td>
      <td class="code">${escapeHtml(row.code)}</td>
      <td class="stock-name">${escapeHtml(row.name)}</td>
      <td class="num">${escapeHtml(row.previousSharesText)}</td>
      <td class="num">${escapeHtml(row.currentSharesText)}</td>
      <td class="num ${row.changeLots >= 0 ? "positive" : "negative"}">${escapeHtml(row.changeText)}</td>
      <td class="num">${escapeHtml(row.currentWeightText || "0.00%")}</td>
      <td class="num ${weightClass(row.weightDelta)}">${escapeHtml(row.weightDeltaText || "--")}</td>
      <td class="num">${escapeHtml(row.estimatedPriceText || "--")}</td>
      <td class="num">${escapeHtml(row.marketValueText || "--")}</td>
    </tr>
  `).join("");
}

function renderHoldingsTable(rows) {
  els.tableTitle.textContent = `${state.snapshot.date} 完整持股`;
  els.tableSubtitle.textContent = "依持股權重排序，方便快速看核心部位。";
  els.tableHead.innerHTML = `
    <tr>
      <th>排名</th>
      <th>代號</th>
      <th>名稱</th>
      <th class="num">股數</th>
      <th class="num">權重</th>
      <th class="num">市值(億)</th>
    </tr>
  `;
  els.tableBody.innerHTML = rows.map((row, index) => `
    <tr>
      <td>${index + 1}</td>
      <td class="code">${escapeHtml(row.code)}</td>
      <td class="stock-name">${escapeHtml(row.name)}</td>
      <td class="num">${escapeHtml(row.sharesText)}</td>
      <td class="num">${escapeHtml(row.weightText)}</td>
      <td class="num">${escapeHtml(row.marketValueText)}</td>
    </tr>
  `).join("");
}

function weightClass(value) {
  if (value > 0) return "positive";
  if (value < 0) return "negative";
  return "";
}

function syncTabs() {
  document.querySelectorAll(".summary-tile").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.tab === state.activeTab);
  });

  document.querySelectorAll(".view-tab").forEach((button) => {
    const mode = button.dataset.tab === "holdings" ? "holdings" : "changes";
    button.classList.toggle("is-active", mode === state.tableMode);
  });
}

function setLoading(loading) {
  state.loading = loading;
  els.refreshBtn.disabled = loading;
  els.refreshBtn.textContent = loading ? "..." : "↻";
}

let toastTimer = null;
function showToast(message) {
  window.clearTimeout(toastTimer);
  els.toast.textContent = message;
  els.toast.classList.add("show");
  toastTimer = window.setTimeout(() => {
    els.toast.classList.remove("show");
  }, 2400);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
