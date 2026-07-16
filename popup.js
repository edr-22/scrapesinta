(() => {
  "use strict";

  const STORE_KEY = "sintaJournalScraperState";
  const JOURNALS_URL = "https://sinta.kemdiktisaintek.go.id/journals";
  const TABLE_RENDER_LIMIT = 500;
  const LINK_KEYS = new Set([
    "sintaProfileUrl",
    "journalUrl",
    "editorUrl",
    "googleScholarUrl",
    "garudaUrl",
    "coverUrl",
    "sourcePage"
  ]);

  const elements = {};
  let currentState = normalizeState(null);
  let refreshTimer = null;

  document.addEventListener("DOMContentLoaded", () => {
    cacheElements();
    renderHeader();
    attachEvents();
    refreshFromStorage();
    refreshTimer = window.setInterval(refreshFromStorage, 1400);
  });

  function cacheElements() {
    [
      "open-index",
      "scrape-all",
      "scrape-current",
      "cancel-scrape",
      "journal-keyword",
      "max-pages",
      "status",
      "metric-journals",
      "metric-pages",
      "metric-records",
      "table-search",
      "filter-accreditation",
      "filter-subject",
      "filter-indexed",
      "sort-field",
      "export-excel",
      "clear-results",
      "visible-count",
      "result-head",
      "result-body"
    ].forEach((id) => {
      elements[id] = document.getElementById(id);
    });
  }

  function attachEvents() {
    elements["open-index"].addEventListener("click", openIndex);
    elements["scrape-all"].addEventListener("click", startAutoScrape);
    elements["scrape-current"].addEventListener("click", scrapeCurrentPage);
    elements["cancel-scrape"].addEventListener("click", cancelScrape);
    elements["export-excel"].addEventListener("click", exportExcel);
    elements["clear-results"].addEventListener("click", clearResults);

    [
      "table-search",
      "filter-accreditation",
      "filter-subject",
      "filter-indexed",
      "sort-field"
    ].forEach((id) => {
      elements[id].addEventListener("input", () => renderState(currentState));
      elements[id].addEventListener("change", () => renderState(currentState));
    });

    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === "local" && changes[STORE_KEY]) {
        currentState = normalizeState(changes[STORE_KEY].newValue);
        renderState(currentState);
      }
    });
  }

  function storageGet() {
    return new Promise((resolve) => {
      chrome.storage.local.get(STORE_KEY, (result) => resolve(result[STORE_KEY] || null));
    });
  }

  function storageSet(state) {
    return new Promise((resolve) => {
      chrome.storage.local.set({ [STORE_KEY]: state }, resolve);
    });
  }

  function storageRemove() {
    return new Promise((resolve) => {
      chrome.storage.local.remove(STORE_KEY, resolve);
    });
  }

  function getActiveTab() {
    return new Promise((resolve) => {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => resolve(tabs[0] || null));
    });
  }

  function updateTab(tabId, url) {
    return new Promise((resolve) => {
      chrome.tabs.update(tabId, { url }, resolve);
    });
  }

  function sendMessage(tabId, message) {
    return new Promise((resolve) => {
      chrome.tabs.sendMessage(tabId, message, (response) => {
        if (chrome.runtime.lastError) {
          resolve({ ok: false, error: chrome.runtime.lastError.message });
          return;
        }
        resolve(response || { ok: false, error: "Tidak ada respons dari halaman." });
      });
    });
  }

  function normalizeState(state) {
    const source = state || {};
    return {
      active: Boolean(source.active),
      completed: Boolean(source.completed),
      mode: source.mode || "",
      rows: Array.isArray(source.rows) ? source.rows : [],
      pagesProcessed: Number(source.pagesProcessed || 0),
      totalPages: Number(source.totalPages || 0),
      totalRecords: Number(source.totalRecords || 0),
      currentPage: Number(source.currentPage || 0),
      maxPages: Number(source.maxPages || 0),
      searchKeyword: source.searchKeyword || "",
      searchSubmitted: Boolean(source.searchSubmitted),
      routePhase: source.routePhase || "",
      openPopupOnFinish: Boolean(source.openPopupOnFinish),
      startedAt: source.startedAt || "",
      finishedAt: source.finishedAt || "",
      startUrl: source.startUrl || "",
      lastUrl: source.lastUrl || "",
      status: source.status || "",
      error: source.error || ""
    };
  }

  function makePendingState(maxPages = 0, searchKeyword = "") {
    return normalizeState({
      active: true,
      completed: false,
      mode: "index/filter",
      rows: [],
      pagesProcessed: 0,
      totalPages: 0,
      totalRecords: 0,
      maxPages,
      searchKeyword,
      searchSubmitted: false,
      routePhase: searchKeyword ? "open-journals-then-search" : "open-journals",
      openPopupOnFinish: true,
      startedAt: new Date().toISOString(),
      startUrl: JOURNALS_URL,
      status: searchKeyword
        ? `Membuka halaman Journals untuk mencari "${searchKeyword}"...`
        : "Membuka halaman Journals SINTA..."
    });
  }

  async function refreshFromStorage() {
    currentState = normalizeState(await storageGet());
    renderState(currentState);
  }

  async function openIndex() {
    const tab = await getActiveTab();
    if (!tab) {
      setStatus("Tidak menemukan tab aktif.", true);
      return;
    }
    await updateTab(tab.id, JOURNALS_URL);
    setStatus("Journal Index SINTA dibuka. Setelah halaman muncul, klik Ambil Semua Halaman.");
  }

  function readSearchKeyword() {
    return elements["journal-keyword"].value.trim();
  }

  function readMaxPages() {
    const raw = elements["max-pages"].value.trim();
    if (!raw) {
      return 0;
    }
    const value = Number(raw);
    return Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
  }

  function isSintaUrl(url = "") {
    try {
      return new URL(url).hostname === "sinta.kemdiktisaintek.go.id";
    } catch {
      return false;
    }
  }

  async function startAutoScrape() {
    const tab = await getActiveTab();
    if (!tab) {
      setStatus("Tidak menemukan tab aktif.", true);
      return;
    }

    const maxPages = readMaxPages();
    const searchKeyword = readSearchKeyword();
    setStatus(searchKeyword
      ? `Membuka /journals, mengisi Search journals dengan "${searchKeyword}", lalu scraping otomatis.`
      : "Memulai scraping otomatis. Tab SINTA akan berpindah halaman agar progress terlihat.");

    if (!isSintaUrl(tab.url)) {
      const pendingState = makePendingState(maxPages, searchKeyword);
      await storageSet(pendingState);
      await updateTab(tab.id, JOURNALS_URL);
      return;
    }

    const response = await sendMessage(tab.id, {
      type: "SINTA_START_AUTO",
      maxPages,
      searchKeyword,
      openPopupOnFinish: true
    });

    if (!response.ok) {
      setStatus(`Gagal memulai: ${response.error}`, true);
      return;
    }
    await refreshFromStorage();
  }

  async function scrapeCurrentPage() {
    const tab = await getActiveTab();
    if (!tab || !isSintaUrl(tab.url)) {
      setStatus("Buka halaman SINTA Journal Index, filter, atau hasil pencarian terlebih dahulu.", true);
      return;
    }

    setStatus("Mengambil data dari halaman aktif...");
    const response = await sendMessage(tab.id, { type: "SINTA_SCRAPE_CURRENT" });
    if (!response.ok) {
      setStatus(`Gagal mengambil halaman aktif: ${response.error}`, true);
      return;
    }
    currentState = normalizeState(response.state);
    renderState(currentState);
  }

  async function cancelScrape() {
    const tab = await getActiveTab();
    if (tab && isSintaUrl(tab.url)) {
      const response = await sendMessage(tab.id, { type: "SINTA_CANCEL_AUTO" });
      if (response.ok) {
        currentState = normalizeState(response.state);
        renderState(currentState);
        return;
      }
    }

    const state = normalizeState(await storageGet());
    state.active = false;
    state.completed = false;
    state.finishedAt = new Date().toISOString();
    state.status = `Dihentikan: ${state.rows.length} jurnal dari ${state.pagesProcessed} halaman.`;
    await storageSet(state);
    currentState = state;
    renderState(currentState);
  }

  async function clearResults() {
    await storageRemove();
    currentState = normalizeState(null);
    renderState(currentState);
    setStatus("Hasil dibersihkan.");
  }

  function exportExcel() {
    const rows = currentState.rows || [];
    if (!rows.length) {
      setStatus("Belum ada data untuk diexport.", true);
      return;
    }
    globalThis.SintaXlsx.downloadRows(rows);
    setStatus(`Export Excel dibuat untuk ${rows.length} jurnal.`);
  }

  function setStatus(message, isError = false) {
    elements.status.textContent = message;
    elements.status.classList.toggle("error", Boolean(isError));
  }

  function renderHeader() {
    const headers = globalThis.SintaXlsx.getHeaders();
    elements["result-head"].innerHTML = `<tr>${headers.map((header) => `<th>${escapeHtml(header.label)}</th>`).join("")}</tr>`;
  }

  function renderState(state) {
    currentState = normalizeState(state);
    const rows = currentState.rows || [];
    elements["metric-journals"].textContent = rows.length.toLocaleString("id-ID");
    elements["metric-pages"].textContent = currentState.totalPages
      ? `${currentState.pagesProcessed.toLocaleString("id-ID")}/${currentState.totalPages.toLocaleString("id-ID")}`
      : currentState.pagesProcessed.toLocaleString("id-ID");
    elements["metric-records"].textContent = currentState.totalRecords
      ? currentState.totalRecords.toLocaleString("id-ID")
      : "-";

    if (currentState.status) {
      setStatus(currentState.status, Boolean(currentState.error));
    }

    updateFilterOptions(rows);
    const visibleRows = getVisibleRows(rows);
    const renderedRows = visibleRows.slice(0, TABLE_RENDER_LIMIT);
    const limitNote = visibleRows.length > TABLE_RENDER_LIMIT
      ? `, ${TABLE_RENDER_LIMIT.toLocaleString("id-ID")} tampil di popup`
      : "";
    elements["visible-count"].textContent = `${visibleRows.length.toLocaleString("id-ID")} baris cocok${limitNote}`;
    renderTable(renderedRows, visibleRows.length);
    elements["export-excel"].disabled = rows.length === 0;
    elements["cancel-scrape"].disabled = !currentState.active;

    if (currentState.searchKeyword && document.activeElement !== elements["journal-keyword"]) {
      elements["journal-keyword"].value = currentState.searchKeyword;
    }
  }

  function updateFilterOptions(rows) {
    const accreditationValue = elements["filter-accreditation"].value;
    const subjectValue = elements["filter-subject"].value;
    const accreditations = unique(rows.map((row) => row.accreditation).filter(Boolean))
      .sort(compareAccreditationLabels);
    const subjects = unique(rows.flatMap((row) => splitSubjects(row.subjectArea))).sort((a, b) => a.localeCompare(b));

    setSelectOptions(elements["filter-accreditation"], "Semua akreditasi", accreditations, accreditationValue);
    setSelectOptions(elements["filter-subject"], "Semua subject", subjects, subjectValue);
  }

  function setSelectOptions(select, label, values, selectedValue) {
    select.innerHTML = [
      `<option value="">${escapeHtml(label)}</option>`,
      ...values.map((value) => `<option value="${escapeAttr(value)}">${escapeHtml(value)}</option>`)
    ].join("");
    if (values.includes(selectedValue)) {
      select.value = selectedValue;
    }
  }

  function getVisibleRows(rows) {
    const query = elements["table-search"].value.trim().toLowerCase();
    const accreditation = elements["filter-accreditation"].value;
    const subject = elements["filter-subject"].value;
    const indexed = elements["filter-indexed"].value;
    const filtered = rows.filter((row) => {
      if (query && !Object.values(row).join(" ").toLowerCase().includes(query)) {
        return false;
      }
      if (accreditation && row.accreditation !== accreditation) {
        return false;
      }
      if (subject && !splitSubjects(row.subjectArea).includes(subject)) {
        return false;
      }
      if (indexed === "scopus" && row.scopusIndexed !== "Ya") {
        return false;
      }
      if (indexed === "garuda" && row.garudaIndexed !== "Ya") {
        return false;
      }
      if (indexed === "both" && (row.scopusIndexed !== "Ya" || row.garudaIndexed !== "Ya")) {
        return false;
      }
      if (indexed === "not-scopus" && row.scopusIndexed === "Ya") {
        return false;
      }
      if (indexed === "not-garuda" && row.garudaIndexed === "Ya") {
        return false;
      }
      return true;
    });

    return sortRows(filtered, elements["sort-field"].value);
  }

  function sortRows(rows, sortField) {
    const output = [...rows];
    const numberCompare = (key, direction = "desc") => (a, b) => {
      const left = globalThis.SintaXlsx.normalizeNumber(a[key]);
      const right = globalThis.SintaXlsx.normalizeNumber(b[key]);
      const diff = (left || 0) - (right || 0);
      return direction === "desc" ? -diff : diff;
    };
    const stringCompare = (key) => (a, b) => String(a[key] || "").localeCompare(String(b[key] || ""));

    const sorters = {
      impact_desc: numberCompare("impact", "desc"),
      impact_asc: numberCompare("impact", "asc"),
      h5_desc: numberCompare("h5Index", "desc"),
      citations_desc: numberCompare("citations", "desc"),
      citations5yr_desc: numberCompare("citations5yr", "desc"),
      accreditation_asc: (a, b) => accreditationRank(a.accreditation) - accreditationRank(b.accreditation),
      subject_asc: stringCompare("subjectArea"),
      name_asc: stringCompare("name")
    };

    output.sort(sorters[sortField] || sorters.impact_desc);
    return output;
  }

  function renderTable(rows, totalRows = rows.length) {
    const headers = globalThis.SintaXlsx.getHeaders();
    if (!rows.length) {
      elements["result-body"].innerHTML = `<tr><td class="empty" colspan="${headers.length}">Belum ada data yang cocok.</td></tr>`;
      return;
    }

    const bodyRows = rows.map((row) => {
      const cells = headers.map((header) => `<td>${renderCell(row, header.key)}</td>`).join("");
      return `<tr>${cells}</tr>`;
    });

    if (totalRows > rows.length) {
      bodyRows.push(`<tr><td class="empty" colspan="${headers.length}">Preview popup dibatasi ${TABLE_RENDER_LIMIT.toLocaleString("id-ID")} baris. Export Excel tetap berisi semua hasil.</td></tr>`);
    }

    elements["result-body"].innerHTML = bodyRows.join("");
  }

  function renderCell(row, key) {
    const value = row[key] ?? "";
    if (!value) {
      return "";
    }
    if (LINK_KEYS.has(key)) {
      return `<a href="${escapeAttr(value)}" target="_blank" rel="noreferrer">${escapeHtml(shortUrl(value))}</a>`;
    }
    return escapeHtml(value);
  }

  function shortUrl(value) {
    try {
      const url = new URL(value);
      const path = url.pathname === "/" ? "" : url.pathname;
      const text = `${url.hostname}${path}`;
      return text.length > 46 ? `${text.slice(0, 43)}...` : text;
    } catch {
      return value;
    }
  }

  function splitSubjects(value) {
    return String(value || "")
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  }

  function unique(values) {
    return [...new Set(values)];
  }

  function accreditationRank(value) {
    const match = String(value || "").match(/^S([1-6])$/i);
    if (match) {
      return Number(match[1]);
    }
    if (/not\s+accredited/i.test(value)) {
      return 90;
    }
    if (/cancel/i.test(value)) {
      return 91;
    }
    return 99;
  }

  function compareAccreditationLabels(a, b) {
    return accreditationRank(a) - accreditationRank(b) || a.localeCompare(b);
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function escapeAttr(value) {
    return escapeHtml(value);
  }

  window.addEventListener("unload", () => {
    if (refreshTimer) {
      window.clearInterval(refreshTimer);
    }
  });
})();
