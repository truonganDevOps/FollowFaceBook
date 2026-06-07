if (typeof importScripts !== 'undefined') {
  importScripts('storage.js', 'fb-api.js', 'queue-processor.js');
} else {
  const s = require('./storage');
  const api = require('./fb-api');
  const qp = require('./queue-processor');
  Object.assign(globalThis, s, api, qp);
}

const ALARM_NAME = 'poll-comments';

function ensureAlarm() {
  chrome.alarms.get(ALARM_NAME, alarm => {
    if (!alarm) chrome.alarms.create(ALARM_NAME, { periodInMinutes: 5 });
  });
}

chrome.runtime.onInstalled.addListener(() => ensureAlarm());
ensureAlarm();

chrome.alarms.onAlarm.addListener(async alarm => {
  if (alarm.name !== ALARM_NAME) return;
  try { await pollAllPosts(); } catch (e) { console.error('[FollowFB] pollAllPosts error:', e); }
  try { await processQueue(); } catch (e) { console.error('[FollowFB] processQueue error:', e); }
  try { await checkFollowBack(); } catch (e) { console.error('[FollowFB] checkFollowBack error:', e); }
});

async function getFacebookTab() {
  const tabs = await new Promise(resolve =>
    chrome.tabs.query({ url: 'https://www.facebook.com/*' }, resolve)
  );
  if (tabs.length) return { tab: tabs[0], opened: false };

  const tab = await new Promise(resolve =>
    chrome.tabs.create({ url: 'https://www.facebook.com/', active: false }, resolve)
  );
  await new Promise(resolve => {
    chrome.tabs.onUpdated.addListener(function listener(tabId, info) {
      if (tabId === tab.id && info.status === 'complete') {
        chrome.tabs.onUpdated.removeListener(listener);
        resolve();
      }
    });
  });
  await new Promise(resolve => setTimeout(resolve, 4000));
  return { tab, opened: true };
}

async function fetchCommentsViaTab(postId) {
  const { tab, opened } = await getFacebookTab();
  try {
    return await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('fetchComments timeout')), 20000);
      chrome.tabs.sendMessage(tab.id, { action: 'fetchComments', postId }, res => {
        clearTimeout(timeout);
        if (chrome.runtime.lastError) return reject(new Error(chrome.runtime.lastError.message));
        if (res && res.error) return reject(new Error(res.error));
        resolve(res && res.commenters || []);
      });
    });
  } finally {
    if (opened) chrome.tabs.remove(tab.id);
  }
}

async function processQueue() {
  const MAX_PER_CYCLE = 5;
  for (let i = 0; i < MAX_PER_CYCLE; i++) {
    const processed = await processNext();
    if (!processed) break;
  }
}

async function pollAllPosts() {
  const posts = await getPosts();
  for (const post of posts) {
    try {
      const commenters = await fetchCommentsViaTab(post.postId);
      for (const commenter of commenters) {
        await addToQueue({ ...commenter, postId: post.postId });
      }
      await setLastChecked(post.postId, Date.now());
    } catch (e) {
      console.error(`[FollowFB] Lỗi poll post ${post.postId}:`, e);
    }
  }
}

async function checkFollowBack(isFollowingBackFn = defaultIsFollowingBack) {
  const follows = await getFollows();
  const twentyFourHoursAgo = Date.now() - 24 * 3600000;
  for (const follow of follows) {
    if (follow.checkedAt != null) continue;
    if (follow.followedAt > twentyFourHoursAgo) continue;
    const followedBack = await isFollowingBackFn(follow.userId);
    await updateFollowBack(follow.userId, followedBack);
  }
}

async function defaultIsFollowingBack(_userId) {
  // TODO Task 8: implement sau khi xác minh friendship status API qua DevTools
  return false;
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!message) return false;

  if (message.action === 'addPost') {
    const postId = extractPostId(message.postUrl);
    if (!postId) { sendResponse({ success: false, reason: 'invalid_url' }); return false; }
    savePost({ postId, postUrl: message.postUrl }).then(() => sendResponse({ success: true, postId }));
    return true;
  }

  if (message.action === 'removePost') {
    removePost(message.postId).then(() => sendResponse({ success: true }));
    return true;
  }

  if (message.action === 'getStats') {
    Promise.all([getPosts(), getFollows(), getQueue()]).then(([posts, follows, queue]) => {
      sendResponse({ posts, follows, queue });
    });
    return true;
  }

  if (message.action === 'scanNow') {
    sendResponse({ started: true });
    (async () => {
      try { await pollAllPosts(); } catch (e) { console.error('[FollowFB] scanNow pollAllPosts:', e); }
      try { await processQueue(); } catch (e) { console.error('[FollowFB] scanNow processQueue:', e); }
    })();
    return false;
  }

  return false;
});

if (typeof module !== 'undefined') module.exports = { checkFollowBack };
