if (typeof importScripts !== 'undefined') {
  importScripts('storage.js', 'fb-api.js', 'queue-processor.js');
} else {
  const s = require('./storage');
  const api = require('./fb-api');
  const qp = require('./queue-processor');
  Object.assign(globalThis, s, api, qp);
}

const ALARM_NAME = 'poll-comments';

chrome.runtime.onInstalled.addListener(() => {
  chrome.alarms.create(ALARM_NAME, { periodInMinutes: 5 });
});

chrome.alarms.get(ALARM_NAME, alarm => {
  if (!alarm) chrome.alarms.create(ALARM_NAME, { periodInMinutes: 5 });
});

chrome.alarms.onAlarm.addListener(async alarm => {
  if (alarm.name !== ALARM_NAME) return;
  try {
    await pollAllPosts();
    await processNext();
    await checkFollowBack();
  } catch (e) {
    console.error('[FollowFB] Alarm handler error:', e);
  }
});

async function pollAllPosts() {
  const posts = await getPosts();
  for (const post of posts) {
    try {
      const commenters = await fetchComments(post.postId);
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

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
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

  return false;
});

if (typeof module !== 'undefined') module.exports = { checkFollowBack };
