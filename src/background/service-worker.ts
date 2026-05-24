// MonkTab service worker — minimal, just keeps the extension alive
chrome.runtime.onInstalled.addListener(() => {
  console.log('[MonkTab] Installed');
});
