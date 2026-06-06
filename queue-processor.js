// Chỉ require trong Node.js (Jest), không phải trong Chrome Extension (Service Worker)
if (typeof require !== 'undefined' && typeof module !== 'undefined') {
  var { getFollows, getQueue, saveFollow, removeFromQueue } = require('./storage');
}

function getRandomDelay() {
  return Math.floor(Math.random() * 4001) + 3000;
}

async function canFollow() {
  const follows = await getFollows();
  const oneHourAgo = Date.now() - 3600000;
  return follows.filter(f => f.followedAt > oneHourAgo).length < 20;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function followUser(profileUrl) {
  return new Promise(resolve => {
    const timeout = setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(listener);
      resolve({ success: false, reason: 'timeout' });
    }, 15000);

    chrome.tabs.create({ url: profileUrl, active: false }, tab => {
      if (chrome.runtime.lastError || !tab) {
        clearTimeout(timeout);
        resolve({ success: false, reason: 'tab_create_failed' });
        return;
      }
      const tabId = tab.id;
      const listener = (updatedTabId, changeInfo) => {
        if (updatedTabId !== tabId || changeInfo.status !== 'complete') return;
        chrome.tabs.onUpdated.removeListener(listener);
        clearTimeout(timeout);
        chrome.tabs.sendMessage(tabId, { action: 'follow' }, response => {
          chrome.tabs.remove(tabId);
          if (chrome.runtime.lastError) {
            resolve({ success: false, reason: 'no_content_script' });
          } else {
            resolve(response || { success: false, reason: 'no_response' });
          }
        });
      };
      chrome.tabs.onUpdated.addListener(listener);
    });
  });
}

async function processNext() {
  if (!(await canFollow())) return;
  const queue = await getQueue();
  if (queue.length === 0) return;

  const item = queue[0];
  try {
    const result = await followUser(item.profileUrl);
    if (result.success) {
      await saveFollow({
        userId: item.userId,
        name: item.name || '',
        profileUrl: item.profileUrl,
        postId: item.postId
      });
    }
  } finally {
    await removeFromQueue(item.userId);
    await sleep(getRandomDelay());
  }
}

if (typeof module !== 'undefined') module.exports = { getRandomDelay, canFollow, processNext, followUser };
