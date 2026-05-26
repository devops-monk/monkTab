// MonkTab service worker
// Injects a Referer header on YouTube sub-frame requests so the embedded player
// doesn't return Error 153 ("Video player configuration error"). Chrome extensions
// have a chrome-extension:// origin and send no Referer for cross-origin iframes,
// which YouTube rejects. This rule spoofs a valid Referer to fix it.

function installYouTubeRefererRule() {
  const refererValue = `chrome-extension://${chrome.runtime.id}/src/newtab/newtab.html`;

  chrome.declarativeNetRequest.updateDynamicRules({
    removeRuleIds: [1],
    addRules: [
      {
        id: 1,
        priority: 1,
        condition: {
          initiatorDomains: [chrome.runtime.id],
          requestDomains: ['www.youtube-nocookie.com'],
          resourceTypes: [
            chrome.declarativeNetRequest.ResourceType.SUB_FRAME,
            chrome.declarativeNetRequest.ResourceType.XMLHTTPREQUEST,
          ],
        },
        action: {
          type: chrome.declarativeNetRequest.RuleActionType.MODIFY_HEADERS,
          requestHeaders: [
            {
              header: 'Referer',
              value: refererValue,
              operation: chrome.declarativeNetRequest.HeaderOperation.SET,
            },
            {
              header: 'Origin',
              value: 'https://www.youtube.com',
              operation: chrome.declarativeNetRequest.HeaderOperation.SET,
            },
          ],
        },
      },
    ],
  });
}

chrome.runtime.onInstalled.addListener(() => {
  installYouTubeRefererRule();
  console.log('[MonkTab] Installed');
});

// Re-apply rule on browser startup (rules are cleared on update)
chrome.runtime.onStartup.addListener(() => {
  installYouTubeRefererRule();
});

// ─── Focus Mode site blocking ─────────────────────────────────────────────────
// Redirects blocked domains to the new tab page while Focus Mode is active.

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.status !== 'loading' || !tab.url) return;
  const r = await chrome.storage.local.get(['mt_focus_blocking', 'mt_settings']);
  if (!r['mt_focus_blocking']) return;
  const blockedSites: string[] = (r['mt_settings'] as { blockedSites?: string[] } | undefined)?.blockedSites ?? [];
  if (!blockedSites.length) return;
  try {
    const hostname = new URL(tab.url).hostname.replace(/^www\./, '');
    const blocked = blockedSites.some(s => {
      const d = s.replace(/^www\./, '').toLowerCase();
      return hostname === d || hostname.endsWith('.' + d);
    });
    if (blocked) {
      const newTabUrl = chrome.runtime.getURL('src/newtab/newtab.html') + '?blocked=' + encodeURIComponent(tab.url);
      await chrome.tabs.update(tabId, { url: newTabUrl });
    }
  } catch { /* invalid URL */ }
});
