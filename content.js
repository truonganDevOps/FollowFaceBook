function findFollowButton() {
  const buttons = document.querySelectorAll('[role="button"]');
  for (const btn of buttons) {
    const text = btn.textContent.trim().toLowerCase();
    if (text === 'theo dõi' || text === 'follow') return btn;
  }
  return null;
}

function waitForFollowButton(maxWait = 8000) {
  return new Promise(resolve => {
    const immediate = findFollowButton();
    if (immediate) { resolve(immediate); return; }
    const start = Date.now();
    const interval = setInterval(() => {
      const btn = findFollowButton();
      if (btn) { clearInterval(interval); resolve(btn); }
      else if (Date.now() - start > maxWait) { clearInterval(interval); resolve(null); }
    }, 500);
  });
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || message.action !== 'follow') return false;
  waitForFollowButton().then(btn => {
    if (!btn) { sendResponse({ success: false, reason: 'button_not_found' }); return; }
    btn.click();
    sendResponse({ success: true });
  });
  return true; // giữ channel mở cho async response
});
