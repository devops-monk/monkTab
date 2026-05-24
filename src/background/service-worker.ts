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
          requestDomains: ['www.youtube.com', 'www.youtube-nocookie.com'],
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
