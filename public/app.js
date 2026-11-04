const state = {
  snapshot: null,
  history: null,
  activeDashboard: null,
  activeTab: "all",
  tableMode: "changes",
  query: "",
  requests: 0,
  stock: null,
  page: "overview",
  fundCode: null,
  legacyStarted: false
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
  topSignalName: document.querySelector("#topSignalName"),
  rankedCount: document.querySelector("#rankedCount"),
  signalList: document.querySelector("#signalList"),
  flowList: document.querySelector("#flowList"),
  rankingList: document.querySelector("#rankingList"),
  universeBody: document.querySelector("#universeBody"),
  universeNote: document.querySelector("#universeNote"),
  fundSearch: document.querySelector("#fundSearch"),
  fundType: document.querySelector("#fundType"),
  fundSort: document.querySelector("#fundSort"),
  fundEmpty: document.querySelector("#fundEmpty"),
  clearStock: document.querySelector("#clearStock"),
  fundDetail: document.querySelector("#fundDetail"),
  legacyDetail: document.querySelector("#legacyDetail"),
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

async function init() {
  bindEvents();
  showPage();
  await loadActiveDashboard();
}

function bindEvents() {
  window.addEventListener("hashchange", () => showPage(true));
  els.refreshBtn.addEventListener("click", () => {
    loadActiveDashboard();
    if (state.fundCode === "00981A") {
      loadSnapshot(els.dateSelect.value || null);
      loadHistory();
    }
  });

  els.dateSelect.addEventListener("change", () => loadSnapshot(els.dateSelect.value));

  els.historyDays.addEventListener("change", loadHistory);

  els.fundSearch.addEventListener("input", renderFundList);
  els.fundType.addEventListener("change", renderFundList);
  els.fundSort.addEventListener("change", renderFundList);
  els.clearStock.addEventListener("click", () => {
    state.stock = null;
    renderFundList();
    els.fundSearch.focus();
  });
  document.querySelector("#overview").addEventListener("click", (event) => {
    const button = event.target.closest("[data-stock], [data-compare-sort]");
    if (!button) return;
    state.stock = state.activeDashboard?.signals?.find((item) => item.code === button.dataset.stock) || null;
    els.fundSearch.value = "";
    els.fundType.value = state.stock ? "股票型" : "";
    els.fundSort.value = button.dataset.compareSort || "code";
    renderFundList();
    location.hash = "compare";
  });

  els.themeBtn.addEventListener("click", () => {
    const light = !document.body.classList.contains("light-theme");
    applyTheme(light);
    try { localStorage.setItem("active-etf-theme", light ? "light" : "dark"); } catch {}
  });

  let savedTheme;
  try { savedTheme = localStorage.getItem("active-etf-theme"); } catch {}
  applyTheme(savedTheme ? savedTheme === "light" : !matchMedia("(prefers-color-scheme: dark)").matches);

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

function applyTheme(light) {
  document.body.classList.toggle("light-theme", light);
  els.themeBtn.textContent = light ? "☾ 夜間" : "☀ 白天";
}

function showPage(moveFocus = false) {
  const route = location.hash.slice(1);
  const fundMatch = route.match(/^fund-([0-9]{5}[A-Z])$/);
  state.fundCode = fundMatch?.[1] || null;
  state.page = state.fundCode ? "fund" : route === "compare" ? "compare" : "overview";
  document.querySelectorAll("[data-page]").forEach((page) => { page.hidden = page.id !== state.page; });
  document.querySelectorAll("[data-page-link]").forEach((link) => {
    const current = link.dataset.pageLink === state.page;
    if (current) link.setAttribute("aria-current", "page");
    else link.removeAttribute("aria-current");
  });
  if (state.page === "fund") renderFundDetail();
  if (state.fundCode === "00981A" && !state.legacyStarted) {
    state.legacyStarted = true;
    loadSnapshot();
    loadHistory();
  }
  if (moveFocus) {
    document.querySelector(`#${state.page}Title`)?.focus({ preventScroll: true });
    window.scrollTo(0, 0);
  }
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
  setLoading(true);
  try {
    const staticResponse = await fetch(appPath("static-data/active-dashboard.json"), { cache: "no-cache" });
    const dashboard = staticResponse.ok
      ? await staticResponse.json()
      : await fetchJson(new URL(`${apiBase}/active-dashboard`, window.location.origin));
    state.activeDashboard = dashboard;
    renderActiveDashboard();
    renderFundList();
    if (state.page === "fund") renderFundDetail();
  } catch (error) {
    const message = state.activeDashboard ? "更新失敗，仍顯示上次載入的資料。" : "市場資料暫時無法載入，請使用上方重新整理。";
    els.dashboardMeta.textContent = message;
    els.universeNote.textContent = message;
    if (state.page === "fund" && !state.activeDashboard) renderFundDetail(message);
  } finally {
    setLoading(false);
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
  const { etfs = [], signals = [], flows = [], generatedAt } = state.activeDashboard;
  const ranked = etfs.filter((item) => Number.isFinite(item.monthReturn)).sort((a, b) => b.monthReturn - a.monthReturn);
  const overlap = signals.filter((item) => item.funds > 1);
  const top = overlap[0];
  els.dashboardMeta.textContent = generatedAt ? `資料彙整於 ${formatTime(generatedAt)}（台北時間）` : "來源未提供資料彙整時間";
  els.activeEtfCount.textContent = `${etfs.length} 檔`;
  els.commonSignalCount.textContent = top ? `${top.funds} 檔` : "—";
  els.topSignalName.textContent = top ? `${top.code} ${top.name}` : "股票型基金的重疊持股";
  els.rankedCount.textContent = `${ranked.length} / ${etfs.length} 檔`;

  els.signalList.innerHTML = overlap.slice(0, 6).map((item) => `
    <button type="button" class="insight-row" data-stock="${escapeHtml(item.code)}">
      <span class="row-label"><b>${escapeHtml(item.name)}</b><small>${escapeHtml(item.code)} · 平均權重 ${Number(item.avgWeight).toFixed(2)}%</small>
        <span class="meter" aria-hidden="true"><span style="width:${Math.min(100, item.funds / top.funds * 100)}%"></span></span>
      </span><strong>${item.funds} 檔</strong>
    </button>`).join("") || emptyInsight("尚無可比較的共同持股。");
  els.flowList.innerHTML = flows.filter((item) => Number.isFinite(item.flowProxyYi) && item.flowProxyYi !== 0)
    .slice(0, 5).map((item) => insightFund(item, item.flowProxyYi, signed(item.flowProxyYi, " 億"))).join("")
    || emptyInsight("尚無可用的持股調整資料。");
  els.rankingList.innerHTML = ranked.slice(0, 5).map((item, i) =>
    insightFund(item, item.monthReturn, item.monthReturnText, i + 1)).join("")
    || emptyInsight("目前沒有可比較的月績效。");
}

function emptyInsight(message) {
  return `<p class="empty-state">${message}</p>`;
}

function insightFund(item, value, label, rank) {
  return `<a class="insight-row" href="#fund-${escapeHtml(item.code)}">
    ${rank ? `<span class="rank-index">${String(rank).padStart(2, "0")}</span>` : ""}
    <span class="row-label"><b>${escapeHtml(item.name)}</b><small>${escapeHtml(item.code)} · ${escapeHtml(item.date || "日期未提供")}</small></span>
    <strong class="${weightClass(value)}">${escapeHtml(label)}</strong>
  </a>`;
}

function signed(value, suffix = "") {
  return Number.isFinite(value) ? `${value > 0 ? "+" : ""}${value.toLocaleString("zh-TW", { maximumFractionDigits: 2 })}${suffix}` : "—";
}

function fundFlow(item) {
  return item.date && item.holdings?.length ? item.flowProxyYi : null;
}

function renderFundList() {
  if (!state.activeDashboard) return;
  const etfs = state.activeDashboard.etfs || [];
  const query = els.fundSearch.value.trim().toUpperCase();
  const type = els.fundType.value;
  const stock = state.stock;
  const funds = etfs.filter((item) => (
    (!type || item.type === type) &&
    `${item.code} ${item.name}`.toUpperCase().includes(query) &&
    (!stock || item.holdings?.some((holding) => holding.code === stock.code))
  ));
  const sortValue = (item) => {
    if (els.fundSort.value === "return") return item.monthReturn ?? -Infinity;
    if (els.fundSort.value === "flow") return fundFlow(item) == null ? -Infinity : Math.abs(fundFlow(item));
    return 0;
  };
  funds.sort((a, b) => (sortValue(b) - sortValue(a)) || a.code.localeCompare(b.code));
  els.clearStock.hidden = !stock;
  if (stock) els.clearStock.textContent = `持有 ${stock.code} ${stock.name} ×`;
  els.universeNote.textContent = `顯示 ${funds.length} / ${etfs.length} 檔`;
  els.fundEmpty.hidden = funds.length > 0;
  els.fundEmpty.textContent = etfs.length ? "沒有符合的基金，試試調整搜尋或篩選條件。" : "來源暫無基金資料。";
  els.universeBody.innerHTML = funds.map((item) => `
    <tr>
      <th scope="row"><a class="fund-link" href="#fund-${escapeHtml(item.code)}"><span class="fund-code">${escapeHtml(item.code)}</span><span>${escapeHtml(item.name)}</span><span aria-hidden="true">↗</span></a></th>
      <td data-label="類型"><span class="type-label">${escapeHtml(item.type)}</span></td>
      <td data-label="市價" class="num">${escapeHtml(item.price || "—")}</td>
      <td data-label="月績效" class="num ${weightClass(item.monthReturn)}">${Number.isFinite(item.monthReturn) ? escapeHtml(item.monthReturnText) : "—"}</td>
      <td data-label="持股調整淨額（億）" class="num ${weightClass(fundFlow(item))}">${signed(fundFlow(item))}</td>
      <td data-label="資料日期">${escapeHtml(item.date || "—")}</td>
    </tr>`).join("");
}

function renderFundDetail(error) {
  const item = state.activeDashboard?.etfs?.find((fund) => fund.code === state.fundCode);
  els.legacyDetail.hidden = state.fundCode !== "00981A";
  if (!item) {
    const message = error || (state.activeDashboard ? "目前沒有這檔基金的資料。" : "正在載入基金資料…");
    els.fundDetail.innerHTML = `<div class="page-intro"><h1 id="fundTitle" tabindex="-1">${escapeHtml(state.fundCode)}</h1><p role="status">${message}</p></div>`;
    return;
  }
  const holdings = [...(item.holdings || [])].sort((a, b) => b.weight - a.weight);
  const titleFocused = document.activeElement?.id === "fundTitle";
  els.fundDetail.innerHTML = `
    <div class="page-intro">
      <p class="section-kicker">${escapeHtml(item.code)} · ${escapeHtml(item.type)}</p>
      <h1 id="fundTitle" tabindex="-1">${escapeHtml(item.name)}</h1>
      <p>持股資料日 ${escapeHtml(item.date || "未提供")} · <a href="https://zdsetf.com/etf/${escapeHtml(item.code)}" target="_blank" rel="noreferrer">查看持股來源 ↗</a></p>
    </div>
    <section class="dashboard-stats" aria-label="基金概況">
      <div><span>市價</span><strong>${escapeHtml(item.price || "—")}</strong></div>
      <div><span>月績效</span><strong class="${weightClass(item.monthReturn)}">${Number.isFinite(item.monthReturn) ? escapeHtml(item.monthReturnText) : "—"}</strong></div>
      <div><span>持股調整估算淨額</span><strong class="${weightClass(fundFlow(item))}">${signed(fundFlow(item), " 億")}</strong></div>
    </section>
    <section class="universe-panel" aria-label="最新持股">
      <div class="section-head"><div><h2>最新持股</h2><p>${holdings.length} 筆，依權重由高到低排列。</p></div>${item.code === "00981A" ? '<button id="historyJump" class="card-link" type="button">查歷史與異動 ↓</button>' : ""}</div>
      ${holdings.length ? `<div class="table-wrap detail-holdings"><table class="holdings-table"><thead><tr><th scope="col">證券</th><th scope="col" class="num">權重</th><th scope="col" class="num">持有數量</th></tr></thead>
        <tbody>${holdings.map((row) => `<tr><th scope="row"><span class="fund-code">${escapeHtml(row.code)}</span> ${escapeHtml(row.name)}</th><td class="num">${escapeHtml(row.weightText || "—")}</td><td class="num">${escapeHtml(row.sharesText || "—")}</td></tr>`).join("")}</tbody></table></div>`
        : emptyInsight("來源未提供這檔基金的持股明細。")}
    </section>`;
  if (titleFocused) document.querySelector("#fundTitle").focus({ preventScroll: true });
  document.querySelector("#historyJump")?.addEventListener("click", () => {
    els.dateSelect.focus({ preventScroll: true });
    els.legacyDetail.scrollIntoView();
  });
}

function formatTime(value) {
  if (!value) return "--";
  return new Intl.DateTimeFormat("zh-TW", { timeZone: "Asia/Taipei", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
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
  state.requests += loading ? 1 : -1;
  els.refreshBtn.disabled = state.requests > 0;
  els.refreshBtn.textContent = state.requests > 0 ? "…" : "↻";
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

init();
