function get(keys) {
  return new Promise(resolve => chrome.storage.local.get(keys, resolve));
}

function set(data) {
  return new Promise(resolve => chrome.storage.local.set(data, resolve));
}

async function getPosts() {
  const data = await get('posts');
  return data.posts || [];
}

async function savePost(postId, postUrl) {
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
  const [queue, follows] = await Promise.all([getQueue(), getFollows()]);
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
  return (data.lastChecked || {})[postId] || 0;
}

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
