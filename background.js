chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || (message.type !== "SINTA_JOB_FINISHED" && message.type !== "SINTA_OPEN_POPUP")) {
    return false;
  }

  if (!chrome.action || typeof chrome.action.openPopup !== "function") {
    sendResponse({ ok: false, opened: false, error: "openPopup is not available in this Chrome version." });
    return false;
  }

  chrome.action.openPopup()
    .then(() => sendResponse({ ok: true, opened: true }))
    .catch((error) => {
      sendResponse({
        ok: false,
        opened: false,
        error: error?.message || String(error)
      });
    });
  return true;
});
