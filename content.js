(() => {
  "use strict";

  const STORE_KEY = "sintaJournalScraperState";
  const JOURNALS_URL = "https://sinta.kemdiktisaintek.go.id/journals";
  const STEP_DELAY_MS = 900;
  const OVERLAY_ID = "sinta-journal-scraper-overlay";

  let autoStepRunning = false;

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

  function cleanText(value) {
    const text = typeof value === "string" ? value : value?.textContent || "";
    return text.replace(/\s+/g, " ").replace(/\s+\|/g, " |").trim();
  }

  function textWithoutIcons(element) {
    if (!element) {
      return "";
    }
    const clone = element.cloneNode(true);
    clone.querySelectorAll("i").forEach((icon) => icon.remove());
    return cleanText(clone);
  }

  function absoluteUrl(href, base = location.href) {
    if (!href || href === "#!" || href === "#") {
      return "";
    }
    try {
      return new URL(href, base).href;
    } catch {
      return "";
    }
  }

  function canonicalUrl(input = location.href) {
    const url = new URL(input, location.href);
    url.hash = "";
    return url.href;
  }

  function parseLocaleInteger(value) {
    const digits = String(value || "").replace(/[^\d]/g, "");
    return digits ? Number(digits) : 0;
  }

  function isJournalPage() {
    try {
      const url = new URL(location.href);
      return url.hostname === "sinta.kemdiktisaintek.go.id" && url.pathname.startsWith("/journals");
    } catch {
      return false;
    }
  }

  function getCurrentSearchQuery() {
    try {
      return new URL(location.href).searchParams.get("q") || "";
    } catch {
      return "";
    }
  }

  function queriesMatch(left, right) {
    return cleanText(left).toLowerCase() === cleanText(right).toLowerCase();
  }

  function findJournalSearchInput() {
    const inputs = [...document.querySelectorAll('input[name="q"]')];
    return inputs.find((input) => {
      const form = input.closest("form");
      const label = form?.querySelector("label")?.textContent || "";
      return input.closest(".title-list") || /search\s+journals/i.test(label);
    }) || inputs[0] || null;
  }

  function journalSearchUrl(keyword) {
    const base = isJournalPage() ? location.href : JOURNALS_URL;
    const url = new URL(base);
    url.pathname = url.pathname.startsWith("/journals") ? url.pathname : "/journals";
    url.searchParams.set("page", "1");
    url.searchParams.set("q", keyword);
    url.hash = "";
    return url.href;
  }

  function normalizeAccreditation(value) {
    const text = cleanText(value);
    if (!text) {
      return "";
    }
    const sintaMatch = text.match(/\bSinta\s*([1-6])\b/i) || text.match(/\bS\s*([1-6])\b/i);
    if (sintaMatch) {
      return `S${sintaMatch[1]}`;
    }
    if (/not\s+accredited/i.test(text)) {
      return "Not Accredited";
    }
    if (/cancel/i.test(text)) {
      return "Cancelled";
    }
    return text.replace(/\bAccredited\b/gi, "").trim();
  }

  function parseProfileMeta(root) {
    const text = cleanText(root);
    const pIssn = text.match(/P-ISSN\s*:\s*([0-9Xx-]+)/i)?.[1] || "";
    const eIssn = text.match(/E-ISSN\s*:\s*([0-9Xx-]+)/i)?.[1] || "";
    const subjectArea = text.match(/Subject Area\s*:\s*(.+)$/i)?.[1]?.trim() || "";
    return { pIssn, eIssn, subjectArea };
  }

  function extractNamedLinks(root) {
    const links = {
      googleScholarUrl: "",
      journalUrl: "",
      editorUrl: "",
      garudaUrl: ""
    };

    root.querySelectorAll("a[href]").forEach((anchor) => {
      const text = cleanText(anchor).toLowerCase();
      const href = absoluteUrl(anchor.getAttribute("href"));
      if (!href) {
        return;
      }
      if (text.includes("google scholar")) {
        links.googleScholarUrl = href;
      } else if (text.includes("editor")) {
        links.editorUrl = href;
      } else if (text.includes("website")) {
        links.journalUrl = href;
      } else if (text.includes("garuda")) {
        links.garudaUrl = href;
      }
    });

    return links;
  }

  function extractListStats(item) {
    const stats = {
      impact: "",
      h5Index: "",
      citations5yr: "",
      citations: ""
    };

    item.querySelectorAll(".journal-list-stat .pr-txt").forEach((labelElement) => {
      const label = cleanText(labelElement).toLowerCase();
      const value = cleanText(labelElement.parentElement?.querySelector(".pr-num"));
      if (label.includes("impact")) {
        stats.impact = value;
      } else if (label.includes("h5")) {
        stats.h5Index = value;
      } else if (label.includes("5yr")) {
        stats.citations5yr = value;
      } else if (label.includes("citations")) {
        stats.citations = value;
      }
    });

    return stats;
  }

  function extractJournalFromListItem(item) {
    const titleLink =
      item.querySelector(".affil-name a[href*='/journals/profile/']") ||
      item.querySelector(".affil-name a");
    if (!titleLink) {
      return null;
    }

    const profileMeta = parseProfileMeta(item.querySelector(".profile-id"));
    const links = extractNamedLinks(item);
    const accreditation = normalizeAccreditation(item.querySelector(".stat-prev .accredited"));
    const stats = extractListStats(item);
    const coverUrl = absoluteUrl(item.querySelector(".journal-cover")?.getAttribute("src"));
    const profileUrl = absoluteUrl(titleLink.getAttribute("href"));
    const garudaIndexed = Boolean(item.querySelector(".garuda-indexed"));
    const scopusIndexed = Boolean(item.querySelector(".scopus-indexed"));

    return {
      name: textWithoutIcons(titleLink),
      sintaProfileUrl: profileUrl,
      journalUrl: links.journalUrl,
      editorUrl: links.editorUrl,
      googleScholarUrl: links.googleScholarUrl,
      garudaUrl: links.garudaUrl,
      affiliation: textWithoutIcons(item.querySelector(".affil-loc a")),
      pIssn: profileMeta.pIssn,
      eIssn: profileMeta.eIssn,
      subjectArea: profileMeta.subjectArea,
      accreditation,
      scopusIndexed: scopusIndexed ? "Ya" : "Tidak",
      garudaIndexed: garudaIndexed ? "Ya" : "Tidak",
      impact: stats.impact,
      h5Index: stats.h5Index,
      citations5yr: stats.citations5yr,
      citations: stats.citations,
      coverUrl
    };
  }

  function extractDetailPageJournal() {
    const titleLink = document.querySelector(".univ-name h3 a");
    const statCards = [...document.querySelectorAll(".stat-card .card-body")];
    if (!titleLink || statCards.length === 0) {
      return null;
    }

    const links = extractNamedLinks(document);
    const profileMeta = parseProfileMeta(document.querySelector(".affil-code"));
    const stats = {
      impact: "",
      citations: "",
      accreditation: ""
    };

    statCards.forEach((card) => {
      const label = cleanText(card.querySelector(".stat-text")).toLowerCase();
      const value = cleanText(card.querySelector(".stat-num"));
      if (label.includes("impact")) {
        stats.impact = value;
      } else if (label.includes("citation")) {
        stats.citations = value;
      } else if (label.includes("acreditation") || label.includes("accreditation")) {
        stats.accreditation = normalizeAccreditation(value);
      }
    });

    const isGaruda = Boolean(links.garudaUrl);
    const pageUrl = canonicalUrl();
    return {
      name: textWithoutIcons(titleLink),
      sintaProfileUrl: pageUrl.includes("/journals/") ? pageUrl : "",
      journalUrl: links.journalUrl,
      editorUrl: links.editorUrl,
      googleScholarUrl: links.googleScholarUrl,
      garudaUrl: links.garudaUrl,
      affiliation: textWithoutIcons(document.querySelector(".univ-name .affil-loc")),
      pIssn: profileMeta.pIssn,
      eIssn: profileMeta.eIssn,
      subjectArea: profileMeta.subjectArea,
      accreditation: stats.accreditation,
      scopusIndexed: "Tidak",
      garudaIndexed: isGaruda ? "Ya" : "Tidak",
      impact: stats.impact,
      h5Index: "",
      citations5yr: "",
      citations: stats.citations,
      coverUrl: absoluteUrl(document.querySelector(".univ-logo-main")?.getAttribute("src"))
    };
  }

  function getPaginationMeta() {
    const text = cleanText(document.querySelector(".pagination-text small"));
    const currentPage = parseLocaleInteger(text.match(/Page\s+([\d.,]+)/i)?.[1]) ||
      parseLocaleInteger(document.querySelector(".page-item.active .page-link")?.textContent) ||
      parseLocaleInteger(new URL(location.href).searchParams.get("page")) ||
      1;
    const totalPages = parseLocaleInteger(text.match(/of\s+([\d.,]+)/i)?.[1]) ||
      Math.max(
        1,
        ...[...document.querySelectorAll(".pagination .page-link")]
          .map((link) => parseLocaleInteger(link.textContent))
          .filter(Boolean)
      );
    const totalRecords = parseLocaleInteger(text.match(/Total Records\s+([\d.,]+)/i)?.[1]);
    return { currentPage, totalPages, totalRecords };
  }

  function scrapeCurrentDocument() {
    const listItems = [...document.querySelectorAll(".list-item")]
      .filter((item) => item.querySelector(".affil-name a[href*='/journals/profile/']"));
    const rows = listItems
      .map((item) => extractJournalFromListItem(item))
      .filter(Boolean);

    if (rows.length === 0) {
      const detail = extractDetailPageJournal();
      if (detail) {
        rows.push(detail);
      }
    }

    return {
      rows,
      meta: getPaginationMeta()
    };
  }

  function rowKey(row) {
    return [
      row.sintaProfileUrl,
      row.name,
      row.pIssn,
      row.eIssn
    ]
      .filter(Boolean)
      .join("|")
      .toLowerCase();
  }

  function mergeRows(existingRows, newRows) {
    const map = new Map();
    [...(existingRows || []), ...(newRows || [])].forEach((row) => {
      const key = rowKey(row);
      if (!key) {
        return;
      }
      const previous = map.get(key) || {};
      map.set(key, { ...previous, ...row });
    });
    return [...map.values()];
  }

  function isDisabledLink(anchor) {
    return anchor.closest(".disabled") || anchor.getAttribute("aria-disabled") === "true";
  }

  function getNextPageUrl(meta, state) {
    const currentPage = meta.currentPage || state.currentPage || 1;
    const totalPages = meta.totalPages || state.totalPages || currentPage;
    if (currentPage >= totalPages) {
      return "";
    }

    const nextLink = [...document.querySelectorAll(".pagination .page-link")]
      .find((anchor) => cleanText(anchor).toLowerCase() === "next");
    const nextHref = nextLink && !isDisabledLink(nextLink)
      ? absoluteUrl(nextLink.getAttribute("href"))
      : "";
    if (nextHref) {
      return nextHref;
    }

    const url = new URL(location.href);
    url.searchParams.set("page", String(currentPage + 1));
    return url.href;
  }

  async function submitJournalSearch(state) {
    const searchKeyword = cleanText(state.searchKeyword);
    if (!searchKeyword) {
      return false;
    }

    if (queriesMatch(getCurrentSearchQuery(), searchKeyword)) {
      state.searchSubmitted = true;
      state.routePhase = "search-results";
      await storageSet(state);
      return false;
    }

    const input = findJournalSearchInput();
    const targetUrl = journalSearchUrl(searchKeyword);
    if (input) {
      input.focus();
      input.value = searchKeyword;
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
    }

    state.searchSubmitted = true;
    state.routePhase = "search-results";
    state.startUrl = targetUrl;
    state.status = `Mencari jurnal dengan keyword "${searchKeyword}" di form Search journals...`;
    await storageSet(state);
    renderOverlay(state);

    window.setTimeout(() => {
      location.assign(targetUrl);
    }, STEP_DELAY_MS);
    return true;
  }

  function normalizeState(state = {}) {
    return {
      version: 1,
      active: Boolean(state.active),
      completed: Boolean(state.completed),
      mode: state.mode || "index/filter",
      rows: Array.isArray(state.rows) ? state.rows : [],
      visited: state.visited && typeof state.visited === "object" ? state.visited : {},
      pagesProcessed: Number(state.pagesProcessed || 0),
      totalPages: Number(state.totalPages || 0),
      totalRecords: Number(state.totalRecords || 0),
      currentPage: Number(state.currentPage || 0),
      maxPages: Number(state.maxPages || 0),
      searchKeyword: state.searchKeyword || "",
      searchSubmitted: Boolean(state.searchSubmitted),
      routePhase: state.routePhase || "",
      openPopupOnFinish: Boolean(state.openPopupOnFinish),
      startedAt: state.startedAt || new Date().toISOString(),
      finishedAt: state.finishedAt || "",
      startUrl: state.startUrl || location.href,
      lastUrl: state.lastUrl || "",
      nextUrl: state.nextUrl || "",
      status: state.status || "",
      error: state.error || ""
    };
  }

  function addSourceInfo(rows, meta) {
    const pageUrl = canonicalUrl();
    const scrapedAt = new Date().toISOString();
    return rows.map((row) => ({
      ...row,
      sourcePageNumber: meta.currentPage || "",
      sourcePage: pageUrl,
      scrapedAt
    }));
  }

  function pagesProcessedCount(state) {
    return Number(state.pagesProcessed || Object.keys(state.visited || {}).length || 0);
  }

  async function finishJob(state) {
    const finalState = normalizeState(state);
    finalState.active = false;
    finalState.completed = true;
    finalState.finishedAt = new Date().toISOString();
    finalState.pagesProcessed = pagesProcessedCount(finalState);
    finalState.status = `Selesai: ${finalState.rows.length} jurnal dari ${finalState.pagesProcessed} halaman index/filter.`;
    await storageSet(finalState);
    renderOverlay(finalState);
    notifyFinished(finalState);
    return finalState;
  }

  function notifyFinished(state) {
    if (!state.openPopupOnFinish) {
      return;
    }
    try {
      chrome.runtime.sendMessage({
        type: "SINTA_JOB_FINISHED",
        rows: state.rows.length,
        pagesProcessed: state.pagesProcessed
      });
    } catch {
      // Native extension popup opening is best-effort; the stored table remains available.
    }
  }

  async function cancelJob() {
    const state = normalizeState(await storageGet());
    state.active = false;
    state.completed = false;
    state.finishedAt = new Date().toISOString();
    state.pagesProcessed = pagesProcessedCount(state);
    state.status = `Dihentikan: ${state.rows.length} jurnal dari ${state.pagesProcessed} halaman.`;
    await storageSet(state);
    renderOverlay(state);
    return state;
  }

  async function runAutoStep() {
    if (autoStepRunning) {
      return;
    }
    autoStepRunning = true;

    try {
      let state = normalizeState(await storageGet());
      if (!state.active) {
        return;
      }

      if (!isJournalPage()) {
        state.routePhase = state.searchKeyword ? "open-journals-then-search" : "open-journals";
        state.status = state.searchKeyword
          ? `Membuka halaman Journals SINTA sebelum mencari "${state.searchKeyword}"...`
          : "Membuka halaman Journals SINTA...";
        await storageSet(state);
        renderOverlay(state);
        window.setTimeout(() => location.assign(JOURNALS_URL), STEP_DELAY_MS);
        return;
      }

      if (state.searchKeyword && !state.searchSubmitted) {
        const redirectedToSearch = await submitJournalSearch(state);
        if (redirectedToSearch) {
          return;
        }
        state = normalizeState(await storageGet());
      }

      if (state.searchKeyword && state.searchSubmitted && !queriesMatch(getCurrentSearchQuery(), state.searchKeyword)) {
        state.status = `Menunggu halaman hasil pencarian "${state.searchKeyword}"...`;
        await storageSet(state);
        renderOverlay(state);
        return;
      }

      const pageUrl = canonicalUrl();
      const alreadyVisited = Boolean(state.visited[pageUrl]);
      const scraped = scrapeCurrentDocument();
      const meta = scraped.meta;
      const newRows = alreadyVisited ? [] : addSourceInfo(scraped.rows, meta);

      state.rows = mergeRows(state.rows, newRows);
      if (!alreadyVisited) {
        state.visited[pageUrl] = {
          page: meta.currentPage,
          count: newRows.length,
          at: new Date().toISOString()
        };
      }
      state.pagesProcessed = pagesProcessedCount(state);
      state.totalPages = meta.totalPages || state.totalPages || state.pagesProcessed;
      state.totalRecords = meta.totalRecords || state.totalRecords || 0;
      state.currentPage = meta.currentPage || state.currentPage || state.pagesProcessed;
      state.lastUrl = pageUrl;
      state.status = `Mengambil halaman ${state.currentPage} dari ${state.totalPages || "?"}: ${state.rows.length} jurnal terkumpul.`;

      await storageSet(state);
      renderOverlay(state);

      if (!scraped.rows.length && state.pagesProcessed <= 1) {
        state.error = "Tidak menemukan kartu jurnal pada halaman ini.";
        await finishJob(state);
        return;
      }

      const limitReached = state.maxPages > 0 && state.pagesProcessed >= state.maxPages;
      const nextUrl = limitReached ? "" : getNextPageUrl(meta, state);
      if (nextUrl && !state.visited[canonicalUrl(nextUrl)]) {
        state.nextUrl = nextUrl;
        state.status = `Membuka halaman berikutnya (${state.pagesProcessed + 1}${state.totalPages ? `/${state.totalPages}` : ""})...`;
        await storageSet(state);
        renderOverlay(state);
        window.setTimeout(() => location.assign(nextUrl), STEP_DELAY_MS);
        return;
      }

      await finishJob(state);
    } catch (error) {
      const state = normalizeState(await storageGet());
      state.active = false;
      state.error = error?.message || String(error);
      state.status = `Gagal: ${state.error}`;
      await storageSet(state);
      renderOverlay(state);
    } finally {
      autoStepRunning = false;
    }
  }

  async function startAutoScrape(options = {}) {
    const searchKeyword = cleanText(options.searchKeyword || "");
    const state = normalizeState({
      active: true,
      completed: false,
      rows: [],
      visited: {},
      pagesProcessed: 0,
      totalPages: 0,
      totalRecords: 0,
      currentPage: 0,
      maxPages: Number(options.maxPages || 0),
      searchKeyword,
      searchSubmitted: false,
      routePhase: searchKeyword ? "open-journals-then-search" : "open-journals",
      openPopupOnFinish: Boolean(options.openPopupOnFinish),
      startedAt: new Date().toISOString(),
      startUrl: isJournalPage() ? canonicalUrl() : JOURNALS_URL,
      status: searchKeyword
        ? `Menyiapkan pencarian jurnal "${searchKeyword}"...`
        : "Menyiapkan scraping otomatis..."
    });

    await storageSet(state);
    renderOverlay(state);

    if (!isJournalPage()) {
      window.setTimeout(() => location.assign(JOURNALS_URL), STEP_DELAY_MS);
      return { redirected: true };
    }

    await runAutoStep();
    return { redirected: false };
  }

  async function scrapeSinglePage() {
    const scraped = scrapeCurrentDocument();
    const rows = addSourceInfo(scraped.rows, scraped.meta);
    const state = normalizeState({
      active: false,
      completed: true,
      mode: "halaman aktif",
      rows,
      visited: {
        [canonicalUrl()]: {
          page: scraped.meta.currentPage,
          count: rows.length,
          at: new Date().toISOString()
        }
      },
      pagesProcessed: 1,
      totalPages: scraped.meta.totalPages || 1,
      totalRecords: scraped.meta.totalRecords || rows.length,
      currentPage: scraped.meta.currentPage || 1,
      startedAt: new Date().toISOString(),
      finishedAt: new Date().toISOString(),
      startUrl: canonicalUrl(),
      lastUrl: canonicalUrl(),
      status: `Selesai: ${rows.length} jurnal dari 1 halaman aktif.`
    });
    await storageSet(state);
    renderOverlay(state);
    return { rows, meta: scraped.meta, state };
  }

  function renderOverlay(inputState) {
    const state = normalizeState(inputState);
    let overlay = document.getElementById(OVERLAY_ID);
    if (!overlay) {
      overlay = document.createElement("div");
      overlay.id = OVERLAY_ID;
      document.documentElement.appendChild(overlay);
    }

    const pages = pagesProcessedCount(state);
    const totalPages = state.totalPages || 0;
    const percentage = totalPages ? Math.min(100, Math.round((pages / totalPages) * 100)) : 0;
    const title = state.active ? "SINTA Scraper berjalan" : state.completed ? "SINTA Scraper selesai" : "SINTA Scraper";
    const progressText = totalPages ? `${pages}/${totalPages} halaman` : `${pages} halaman`;

    overlay.innerHTML = `
      <style>
        #${OVERLAY_ID} {
          position: fixed;
          right: 18px;
          bottom: 18px;
          width: 340px;
          max-width: calc(100vw - 36px);
          z-index: 2147483647;
          background: #ffffff;
          color: #172033;
          border: 1px solid #c8d5e6;
          box-shadow: 0 18px 40px rgba(16, 28, 48, 0.2);
          border-radius: 8px;
          font-family: Arial, Helvetica, sans-serif;
          line-height: 1.35;
          overflow: hidden;
        }
        #${OVERLAY_ID} .sjs-head {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 10px;
          padding: 10px 12px;
          background: #183b5b;
          color: #ffffff;
          font-size: 13px;
          font-weight: 700;
        }
        #${OVERLAY_ID} .sjs-close {
          border: 0;
          background: transparent;
          color: #ffffff;
          cursor: pointer;
          font-size: 18px;
          line-height: 1;
          padding: 0;
        }
        #${OVERLAY_ID} .sjs-body {
          padding: 12px;
          font-size: 12px;
        }
        #${OVERLAY_ID} .sjs-status {
          margin-bottom: 8px;
          word-break: break-word;
        }
        #${OVERLAY_ID} .sjs-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 8px;
          margin: 10px 0;
        }
        #${OVERLAY_ID} .sjs-metric {
          border: 1px solid #d9e3ef;
          border-radius: 6px;
          padding: 7px;
          background: #f8fbff;
        }
        #${OVERLAY_ID} .sjs-metric strong {
          display: block;
          font-size: 16px;
        }
        #${OVERLAY_ID} .sjs-bar {
          height: 7px;
          background: #e7eef6;
          border-radius: 999px;
          overflow: hidden;
          margin-top: 8px;
        }
        #${OVERLAY_ID} .sjs-bar span {
          display: block;
          width: ${percentage}%;
          height: 100%;
          background: #1c7c8c;
        }
        #${OVERLAY_ID} .sjs-actions {
          display: flex;
          gap: 8px;
          margin-top: 10px;
        }
        #${OVERLAY_ID} .sjs-actions button {
          flex: 1;
          border: 1px solid #b8c8d8;
          background: #ffffff;
          color: #172033;
          border-radius: 6px;
          padding: 7px;
          cursor: pointer;
          font-size: 12px;
        }
        #${OVERLAY_ID} .sjs-actions button.primary {
          border-color: #1c7c8c;
          background: #1c7c8c;
          color: #ffffff;
        }
      </style>
      <div class="sjs-head">
        <span>${title}</span>
        <button class="sjs-close" type="button" title="Tutup">x</button>
      </div>
      <div class="sjs-body">
        <div class="sjs-status">${escapeHtml(state.status || "Menunggu perintah...")}</div>
        <div class="sjs-grid">
          <div class="sjs-metric"><strong>${state.rows.length}</strong>Jurnal</div>
          <div class="sjs-metric"><strong>${progressText}</strong>Progress</div>
        </div>
        <div class="sjs-bar"><span></span></div>
        <div class="sjs-actions">
          ${state.active ? '<button type="button" data-action="stop">Berhenti</button>' : ""}
          ${state.completed ? '<button type="button" data-action="open-popup">Lihat Tabel</button>' : ""}
          <button class="primary" type="button" data-action="download" ${state.rows.length ? "" : "disabled"}>Download XLSX</button>
        </div>
      </div>
    `;

    overlay.querySelector(".sjs-close")?.addEventListener("click", () => overlay.remove());
    overlay.querySelector('[data-action="stop"]')?.addEventListener("click", cancelJob);
    overlay.querySelector('[data-action="open-popup"]')?.addEventListener("click", () => {
      try {
        chrome.runtime.sendMessage({ type: "SINTA_OPEN_POPUP" });
      } catch {
        // The result table is still available from the extension icon.
      }
    });
    overlay.querySelector('[data-action="download"]')?.addEventListener("click", async () => {
      const latestState = normalizeState(await storageGet());
      if (latestState.rows.length) {
        globalThis.SintaXlsx.downloadRows(latestState.rows);
      }
    });
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (!message || !message.type) {
      return false;
    }

    const respond = async () => {
      if (message.type === "SINTA_SCRAPE_CURRENT") {
        return { ok: true, ...(await scrapeSinglePage()) };
      }
      if (message.type === "SINTA_START_AUTO") {
        return { ok: true, ...(await startAutoScrape(message)) };
      }
      if (message.type === "SINTA_CANCEL_AUTO") {
        return { ok: true, state: await cancelJob() };
      }
      if (message.type === "SINTA_GET_STATE") {
        return { ok: true, state: normalizeState(await storageGet()) };
      }
      return { ok: false, error: "Unknown message type." };
    };

    respond()
      .then(sendResponse)
      .catch((error) => sendResponse({ ok: false, error: error?.message || String(error) }));
    return true;
  });

  window.setTimeout(async () => {
    const state = normalizeState(await storageGet());
    if (state.active) {
      renderOverlay(state);
      await runAutoStep();
    } else if (state.completed && state.lastUrl === canonicalUrl()) {
      renderOverlay(state);
    }
  }, 250);
})();
