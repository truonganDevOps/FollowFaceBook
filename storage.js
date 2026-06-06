function get(keys) {
  return new Promise((resolve, reject) =>
    chrome.storage.local.get(keys, result => {
      if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
      else resolve(result);
    })
  );
}

function set(data) {
  return new Promise((resolve, reject) =>
    chrome.storage.local.set(data, () => {
      if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
      else resolve();
    })
  );
}

async function getPosts() {
  const data = await get('posts');
  return data.posts || [];
}

async function savePost({ postId, postUrl }) {
  const posts = await getPosts();
  if (posts.find(p => p.postId === postId)) return;
  posts.push({ postId, postUrl, addedAt: Date.now() });
  await set({ posts });
}

async function removePost(postId) {
  const posts = await getPosts();
  await set({ posts: posts.filter(p => p.postId !== postId) });
}

async function getFollows() {
  const data = await get('follows');
  return data.follows || [];
}

async function saveFollow({ userId, name, profileUrl, postId }) {
  const follows = await getFollows();
  if (follows.find(f => f.userId === userId)) return;
  follows.push({ userId, name, profileUrl, postId, followedAt: Date.now(), followedBack: false, checkedAt: null });
  await set({ follows });
}

async function updateFollowBack(userId, followedBack) {
  const follows = await getFollows();
  const idx = follows.findIndex(f => f.userId === userId);
  if (idx === -1) return;
  follows[idx].followedBack = followedBack;
  follows[idx].checkedAt = Date.now();
  await set({ follows });
}

async function getQueue() {
  const data = await get('queue');
  return data.queue || [];
}

async function addToQueue({ userId, profileUrl, postId }) {
  const data = await get(['queue', 'follows']);
  const queue = data.queue || [];
  const follows = data.follows || [];
  if (queue.find(q => q.userId === userId)) return;
  if (follows.find(f => f.userId === userId)) return;
  queue.push({ userId, profileUrl, postId });
  await set({ queue });
}

async function removeFromQueue(userId) {
  const queue = await getQueue();
  await set({ queue: queue.filter(q => q.userId !== userId) });
}

async function getLastChecked(postId) {
  const data = await get('lastChecked');
  return (data.lastChecked || {})[postId] ?? null;
}

// NOTE: read-modify-write — nếu gọi song song cho nhiều posts cùng lúc,
// timestamp của post sau có thể ghi đè timestamp của post trước.
// Background worker đảm bảo các posts được xử lý tuần tự nên không xảy ra trong thực tế.
async function setLastChecked(postId, timestamp) {
  const data = await get('lastChecked');
  const lastChecked = data.lastChecked || {};
  lastChecked[postId] = timestamp;
  await set({ lastChecked });
}

if (typeof module !== 'undefined') module.exports = {
  getPosts, savePost, removePost,
  getFollows, saveFollow, updateFollowBack,
  getQueue, addToQueue, removeFromQueue,
  getLastChecked, setLastChecked
};
