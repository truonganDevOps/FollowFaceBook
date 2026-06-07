# FollowFaceBook Chrome Extension — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Chrome Extension (Manifest V3) that automatically follows Facebook users who comment on a specified post, with a popup dashboard to track follow-back status after 24 hours.

**Architecture:** Background Service Worker dùng `chrome.alarms` để poll comment mỗi 5 phút qua Facebook internal GraphQL API. Commenter mới được thêm vào hàng đợi. Background Worker lần lượt mở tab profile → Content Script click nút Follow → đóng tab. Dữ liệu lưu trong `chrome.storage.local`. Popup dashboard hiển thị thống kê và cho phép thêm/xóa bài post theo dõi.

**Tech Stack:** Chrome Extension Manifest V3, Vanilla JavaScript (ES2020), Jest + jest-chrome cho unit tests, chrome.alarms, chrome.storage, chrome.tabs

> **Lưu ý module system:** Các file `storage.js`, `fb-api.js`, `queue-processor.js` dùng `importScripts` trong Service Worker (global scope) và `module.exports` cho Jest. Mỗi file kết thúc bằng guard: `if (typeof module !== 'undefined') module.exports = {...}` để tương thích cả hai môi trường.

---

## Cấu trúc file

```
FollowFaceBook/
├── manifest.json          # Chrome Extension manifest v3
├── background.js          # Background Service Worker — polling, queue, orchestration
├── storage.js             # Wrapper cho chrome.storage.local
├── fb-api.js              # Fetch comments từ Facebook internal API
├── queue-processor.js     # Xử lý hàng đợi follow, rate limiting
├── content.js             # Content Script — click nút Follow trên tab profile
├── popup.html             # Giao diện popup dashboard
├── popup.css              # Style popup
├── popup.js               # Logic popup
├── icons/
│   ├── icon16.png
│   ├── icon48.png
│   └── icon128.png
├── tests/
│   ├── setup.js
│   ├── storage.test.js
│   ├── fb-api.test.js
│   ├── queue-processor.test.js
│   └── background.test.js
└── package.json
```

---

### Task 1: Project Scaffold

**Files:**
- Create: `manifest.json`
- Create: `package.json`
- Create: `tests/setup.js`
- Create: `.gitignore`
- Create: `icons/` (3 placeholder PNG)

- [ ] **Step 1: Khởi tạo git và npm**

```bash
git init
npm init -y
```

- [ ] **Step 2: Cài Jest và jest-chrome**

```bash
npm install --save-dev jest jest-chrome
```

- [ ] **Step 3: Tạo tests/setup.js**

```javascript
const { chrome } = require('jest-chrome');
global.chrome = chrome;
```

- [ ] **Step 4: Cập nhật package.json — thêm cấu hình Jest**

```json
{
  "name": "follow-facebook",
  "version": "1.0.0",
  "scripts": {
    "test": "jest"
  },
  "jest": {
    "testEnvironment": "node",
    "setupFiles": ["./tests/setup.js"]
  },
  "devDependencies": {
    "jest": "^29.0.0",
    "jest-chrome": "^0.8.0"
  }
}
```

- [ ] **Step 5: Tạo manifest.json**

```json
{
  "manifest_version": 3,
  "name": "FollowFaceBook",
  "version": "1.0.0",
  "description": "Tự động follow người comment vào bài post Facebook",
  "permissions": ["storage", "alarms", "tabs"],
  "host_permissions": ["https://www.facebook.com/*"],
  "background": {
    "service_worker": "background.js"
  },
  "content_scripts": [
    {
      "matches": ["https://www.facebook.com/*"],
      "js": ["content.js"],
      "run_at": "document_idle"
    }
  ],
  "action": {
    "default_popup": "popup.html",
    "default_icon": {
      "16": "icons/icon16.png",
      "48": "icons/icon48.png",
      "128": "icons/icon128.png"
    }
  },
  "icons": {
    "16": "icons/icon16.png",
    "48": "icons/icon48.png",
    "128": "icons/icon128.png"
  }
}
```

- [ ] **Step 6: Tạo placeholder icons**

Tạo thư mục `icons/` và đặt vào 3 file PNG bất kỳ có tên `icon16.png`, `icon48.png`, `icon128.png`. Kích thước tương ứng 16×16, 48×48, 128×128 pixel. Có thể dùng bất kỳ ảnh nào đổi tên lại.

- [ ] **Step 7: Tạo .gitignore**

```
node_modules/
*.log
```

- [ ] **Step 8: Commit**

```bash
git add manifest.json package.json tests/setup.js .gitignore icons/
git commit -m "feat: initial project scaffold"
```

---

### Task 2: Storage Module

**Files:**
- Create: `storage.js`
- Create: `tests/storage.test.js`

- [ ] **Step 1: Viết failing tests**

Tạo `tests/storage.test.js`:
```javascript
const {
  savePost, getPosts, removePost,
  saveFollow, getFollows, updateFollowBack,
  addToQueue, getQueue, removeFromQueue,
  getLastChecked, setLastChecked
} = require('../storage');

describe('storage', () => {
  beforeEach(() => {
    chrome.storage.local.get.mockReset();
    chrome.storage.local.set.mockReset();
    chrome.storage.local.get.mockImplementation((keys, cb) => cb({}));
    chrome.storage.local.set.mockImplementation((data, cb) => cb && cb());
  });

  test('getPosts returns empty array when storage empty', async () => {
    const result = await getPosts();
    expect(result).toEqual([]);
  });

  test('savePost adds post to storage', async () => {
    chrome.storage.local.get.mockImplementation((keys, cb) => cb({ posts: [] }));
    await savePost('123', 'https://facebook.com/post/123');
    expect(chrome.storage.local.set).toHaveBeenCalledWith(
      expect.objectContaining({
        posts: expect.arrayContaining([
          expect.objectContaining({ postId: '123', postUrl: 'https://facebook.com/post/123' })
        ])
      }),
      expect.any(Function)
    );
  });

  test('savePost skips duplicate postId', async () => {
    chrome.storage.local.get.mockImplementation((keys, cb) =>
      cb({ posts: [{ postId: '123', postUrl: 'https://facebook.com/post/123', addedAt: 1 }] })
    );
    await savePost('123', 'https://facebook.com/post/123');
    expect(chrome.storage.local.set).not.toHaveBeenCalled();
  });

  test('addToQueue adds item', async () => {
    chrome.storage.local.get.mockImplementation((keys, cb) => cb({ queue: [], follows: [] }));
    await addToQueue({ userId: 'u1', profileUrl: 'https://facebook.com/u1', postId: '123' });
    expect(chrome.storage.local.set).toHaveBeenCalledWith(
      expect.objectContaining({
        queue: [{ userId: 'u1', profileUrl: 'https://facebook.com/u1', postId: '123' }]
      }),
      expect.any(Function)
    );
  });

  test('addToQueue skips duplicate userId already in queue', async () => {
    chrome.storage.local.get.mockImplementation((keys, cb) =>
      cb({ queue: [{ userId: 'u1', profileUrl: 'x', postId: '1' }], follows: [] })
    );
    await addToQueue({ userId: 'u1', profileUrl: 'x', postId: '1' });
    expect(chrome.storage.local.set).not.toHaveBeenCalled();
  });

  test('addToQueue skips user already followed', async () => {
    chrome.storage.local.get.mockImplementation((keys, cb) =>
      cb({ queue: [], follows: [{ userId: 'u1' }] })
    );
    await addToQueue({ userId: 'u1', profileUrl: 'x', postId: '1' });
    expect(chrome.storage.local.set).not.toHaveBeenCalled();
  });

  test('saveFollow saves record with followedBack=false', async () => {
    chrome.storage.local.get.mockImplementation((keys, cb) => cb({ follows: [] }));
    await saveFollow({ userId: 'u1', name: 'Test', profileUrl: 'https://facebook.com/u1', postId: '123' });
    expect(chrome.storage.local.set).toHaveBeenCalledWith(
      expect.objectContaining({
        follows: expect.arrayContaining([
          expect.objectContaining({ userId: 'u1', followedBack: false, checkedAt: null })
        ])
      }),
      expect.any(Function)
    );
  });

  test('updateFollowBack sets followedBack and checkedAt', async () => {
    const follows = [{ userId: 'u1', followedBack: false, checkedAt: null }];
    chrome.storage.local.get.mockImplementation((keys, cb) => cb({ follows }));
    await updateFollowBack('u1', true);
    expect(chrome.storage.local.set).toHaveBeenCalledWith(
      expect.objectContaining({
        follows: expect.arrayContaining([
          expect.objectContaining({ userId: 'u1', followedBack: true, checkedAt: expect.any(Number) })
        ])
      }),
      expect.any(Function)
    );
  });
});
```

- [ ] **Step 2: Chạy tests để xác nhận fail**

```
npx jest tests/storage.test.js
```
Expected: FAIL — "Cannot find module '../storage'"

- [ ] **Step 3: Implement storage.js**

```javascript
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
```

- [ ] **Step 4: Chạy tests để xác nhận pass**

```
npx jest tests/storage.test.js
```
Expected: PASS (8 tests)

- [ ] **Step 5: Commit**

```bash
git add storage.js tests/storage.test.js tests/setup.js
git commit -m "feat: add storage module"
```

---

### Task 3: Facebook Comment Fetcher

**Files:**
- Create: `fb-api.js`
- Create: `tests/fb-api.test.js`

> **Lưu ý:** `fetchComments()` gọi Facebook internal GraphQL API. Endpoint và `doc_id` cần xác minh qua DevTools (xem Task 8). Các hàm `extractPostId` và `parseCommenters` có thể test đầy đủ.

- [ ] **Step 1: Viết failing tests**

Tạo `tests/fb-api.test.js`:
```javascript
const { extractPostId, parseCommenters } = require('../fb-api');

describe('extractPostId', () => {
  test('trích postId từ URL /posts/', () => {
    expect(extractPostId('https://www.facebook.com/username/posts/123456789')).toBe('123456789');
  });

  test('trích postId từ URL /groups/', () => {
    expect(extractPostId('https://www.facebook.com/groups/mygroup/posts/987654321')).toBe('987654321');
  });

  test('trích story_fbid từ permalink URL', () => {
    expect(extractPostId('https://www.facebook.com/permalink.php?story_fbid=111&id=222')).toBe('111');
  });

  test('trả về null với URL không hợp lệ', () => {
    expect(extractPostId('https://www.facebook.com/profile')).toBeNull();
  });
});

describe('parseCommenters', () => {
  test('trích danh sách commenter từ GraphQL response', () => {
    const mockResponse = {
      data: {
        feedback: {
          display_comments: {
            edges: [
              { node: { author: { id: 'u1', name: 'Nguyen Van A', url: 'https://www.facebook.com/a' } } },
              { node: { author: { id: 'u2', name: 'Tran Thi B', url: 'https://www.facebook.com/b' } } }
            ]
          }
        }
      }
    };
    const result = parseCommenters(mockResponse);
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({ userId: 'u1', name: 'Nguyen Van A', profileUrl: 'https://www.facebook.com/a' });
  });

  test('trả về mảng rỗng khi response thiếu data', () => {
    expect(parseCommenters({})).toEqual([]);
    expect(parseCommenters({ data: {} })).toEqual([]);
  });

  test('loại bỏ trùng lặp theo userId', () => {
    const mockResponse = {
      data: {
        feedback: {
          display_comments: {
            edges: [
              { node: { author: { id: 'u1', name: 'A', url: 'https://www.facebook.com/a' } } },
              { node: { author: { id: 'u1', name: 'A', url: 'https://www.facebook.com/a' } } }
            ]
          }
        }
      }
    };
    expect(parseCommenters(mockResponse)).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Chạy tests để xác nhận fail**

```
npx jest tests/fb-api.test.js
```
Expected: FAIL — "Cannot find module '../fb-api'"

- [ ] **Step 3: Implement fb-api.js**

```javascript
function extractPostId(url) {
  try {
    const u = new URL(url);
    const postsMatch = u.pathname.match(/\/posts\/(\d+)/);
    if (postsMatch) return postsMatch[1];
    const storyId = u.searchParams.get('story_fbid');
    if (storyId) return storyId;
    return null;
  } catch {
    return null;
  }
}

function parseCommenters(response) {
  try {
    const edges = response.data.feedback.display_comments.edges;
    const seen = new Set();
    return edges.reduce((acc, edge) => {
      const author = edge.node.author;
      if (!author || seen.has(author.id)) return acc;
      seen.add(author.id);
      acc.push({ userId: author.id, name: author.name, profileUrl: author.url });
      return acc;
    }, []);
  } catch {
    return [];
  }
}

async function getFbDtsg() {
  const response = await fetch('https://www.facebook.com/', { credentials: 'include' });
  const text = await response.text();
  const match = text.match(/"DTSGInitialData"[^}]*"token":"([^"]+)"/);
  return match ? match[1] : '';
}

// doc_id và cấu trúc variables cần xác minh qua DevTools (xem Task 8)
async function fetchComments(postId) {
  const dtsg = await getFbDtsg();
  const params = new URLSearchParams({
    fb_dtsg: dtsg,
    variables: JSON.stringify({
      feedbackID: btoa(`feedback:${postId}`),
      count: 50,
      useDefaultActor: false,
    }),
    doc_id: '5765854403456835', // CẦN XÁC MINH QUA DEVTOOLS
  });

  const response = await fetch('https://www.facebook.com/api/graphql/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
    credentials: 'include',
  });

  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const text = await response.text();
  const json = JSON.parse(text.split('\n')[0]);
  return parseCommenters(json);
}

if (typeof module !== 'undefined') module.exports = { extractPostId, parseCommenters, fetchComments };
```

- [ ] **Step 4: Chạy tests để xác nhận pass**

```
npx jest tests/fb-api.test.js
```
Expected: PASS (7 tests)

- [ ] **Step 5: Commit**

```bash
git add fb-api.js tests/fb-api.test.js
git commit -m "feat: add Facebook comment fetcher"
```

---

### Task 4: Follow Queue Processor

**Files:**
- Create: `queue-processor.js`
- Create: `tests/queue-processor.test.js`

- [ ] **Step 1: Viết failing tests**

Tạo `tests/queue-processor.test.js`:
```javascript
const { getRandomDelay, canFollow } = require('../queue-processor');

describe('getRandomDelay', () => {
  test('trả về giá trị trong khoảng 3000-7000ms', () => {
    for (let i = 0; i < 30; i++) {
      const delay = getRandomDelay();
      expect(delay).toBeGreaterThanOrEqual(3000);
      expect(delay).toBeLessThanOrEqual(7000);
    }
  });
});

describe('canFollow', () => {
  beforeEach(() => {
    chrome.storage.local.get.mockReset();
  });

  test('trả về true khi chưa đủ 20 follow trong 1 giờ', async () => {
    const follows = Array.from({ length: 19 }, (_, i) => ({
      userId: `u${i}`,
      followedAt: Date.now() - i * 1000
    }));
    chrome.storage.local.get.mockImplementation((keys, cb) => cb({ follows }));
    expect(await canFollow()).toBe(true);
  });

  test('trả về false khi đã đủ 20 follow trong 1 giờ', async () => {
    const follows = Array.from({ length: 20 }, (_, i) => ({
      userId: `u${i}`,
      followedAt: Date.now() - i * 1000
    }));
    chrome.storage.local.get.mockImplementation((keys, cb) => cb({ follows }));
    expect(await canFollow()).toBe(false);
  });

  test('không tính follow cũ hơn 1 giờ vào giới hạn', async () => {
    const follows = Array.from({ length: 20 }, (_, i) => ({
      userId: `u${i}`,
      followedAt: Date.now() - 2 * 3600000 // 2 giờ trước
    }));
    chrome.storage.local.get.mockImplementation((keys, cb) => cb({ follows }));
    expect(await canFollow()).toBe(true);
  });
});
```

- [ ] **Step 2: Chạy tests để xác nhận fail**

```
npx jest tests/queue-processor.test.js
```
Expected: FAIL — "Cannot find module '../queue-processor'"

- [ ] **Step 3: Implement queue-processor.js**

```javascript
const { getFollows, getQueue, saveFollow, removeFromQueue } = require('./storage');

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
  const result = await followUser(item.profileUrl);

  if (result.success) {
    await saveFollow({
      userId: item.userId,
      name: item.name || '',
      profileUrl: item.profileUrl,
      postId: item.postId
    });
  }
  await removeFromQueue(item.userId);
  await sleep(getRandomDelay());
}

if (typeof module !== 'undefined') module.exports = { getRandomDelay, canFollow, processNext, followUser };
```

- [ ] **Step 4: Chạy tests để xác nhận pass**

```
npx jest tests/queue-processor.test.js
```
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add queue-processor.js tests/queue-processor.test.js
git commit -m "feat: add follow queue processor with rate limiting"
```

---

### Task 5: Content Script

**Files:**
- Create: `content.js`

> Content script chạy trong browser context, không test được với Jest. Test thủ công sau khi load extension.

- [ ] **Step 1: Implement content.js**

```javascript
function findFollowButton() {
  const buttons = document.querySelectorAll('[role="button"]');
  for (const btn of buttons) {
    const text = btn.innerText.trim().toLowerCase();
    if (text === 'theo dõi' || text === 'follow') return btn;
  }
  return null;
}

function waitForFollowButton(maxWait = 8000) {
  return new Promise(resolve => {
    const start = Date.now();
    const interval = setInterval(() => {
      const btn = findFollowButton();
      if (btn) { clearInterval(interval); resolve(btn); }
      else if (Date.now() - start > maxWait) { clearInterval(interval); resolve(null); }
    }, 500);
  });
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action !== 'follow') return;
  waitForFollowButton().then(btn => {
    if (!btn) { sendResponse({ success: false, reason: 'button_not_found' }); return; }
    btn.click();
    sendResponse({ success: true });
  });
  return true;
});
```

- [ ] **Step 2: Load extension vào Chrome**

1. Mở `chrome://extensions/`
2. Bật **Developer mode**
3. Click **Load unpacked** → chọn thư mục `D:\Projects\FollowFaceBook`

- [ ] **Step 3: Test thủ công**

1. Mở trang profile Facebook bất kỳ (người chưa follow)
2. Mở DevTools → Console → chạy:
```javascript
chrome.runtime.sendMessage({action: 'follow'}, console.log)
```
Expected: nút Follow được click, console log `{success: true}`

- [ ] **Step 4: Commit**

```bash
git add content.js
git commit -m "feat: add content script for clicking Follow button"
```

---

### Task 6: Background Service Worker

**Files:**
- Create: `background.js`
- Create: `tests/background.test.js`

- [ ] **Step 1: Viết failing tests**

Tạo `tests/background.test.js`:
```javascript
const { checkFollowBack } = require('../background');

describe('checkFollowBack', () => {
  beforeEach(() => {
    chrome.storage.local.get.mockReset();
    chrome.storage.local.set.mockReset();
    chrome.storage.local.set.mockImplementation((data, cb) => cb && cb());
  });

  test('cập nhật followedBack=true khi user đã follow lại', async () => {
    const follows = [
      { userId: 'u1', followedAt: Date.now() - 25 * 3600000, followedBack: false, checkedAt: null }
    ];
    chrome.storage.local.get.mockImplementation((keys, cb) => cb({ follows }));
    await checkFollowBack(jest.fn().mockResolvedValue(true));
    expect(chrome.storage.local.set).toHaveBeenCalledWith(
      expect.objectContaining({
        follows: expect.arrayContaining([
          expect.objectContaining({ userId: 'u1', followedBack: true })
        ])
      }),
      expect.any(Function)
    );
  });

  test('chỉ kiểm tra user đã follow hơn 24h', async () => {
    const follows = [
      { userId: 'u1', followedAt: Date.now() - 23 * 3600000, followedBack: false, checkedAt: null },
      { userId: 'u2', followedAt: Date.now() - 25 * 3600000, followedBack: false, checkedAt: null },
    ];
    chrome.storage.local.get.mockImplementation((keys, cb) => cb({ follows }));
    const mockFn = jest.fn().mockResolvedValue(false);
    await checkFollowBack(mockFn);
    expect(mockFn).toHaveBeenCalledTimes(1);
    expect(mockFn).toHaveBeenCalledWith('u2');
  });

  test('bỏ qua user đã được kiểm tra (checkedAt !== null)', async () => {
    const follows = [
      { userId: 'u1', followedAt: Date.now() - 25 * 3600000, followedBack: false, checkedAt: Date.now() - 1000 }
    ];
    chrome.storage.local.get.mockImplementation((keys, cb) => cb({ follows }));
    const mockFn = jest.fn();
    await checkFollowBack(mockFn);
    expect(mockFn).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Chạy tests để xác nhận fail**

```
npx jest tests/background.test.js
```
Expected: FAIL — "Cannot find module '../background'"

- [ ] **Step 3: Implement background.js**

```javascript
// Trong browser: các hàm được nạp qua importScripts ở trên (global scope)
// Trong Jest: require() bên dưới sẽ được dùng
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
  await pollAllPosts();
  await processNext();
  await checkFollowBack();
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
    if (follow.checkedAt !== null) continue;
    if (follow.followedAt > twentyFourHoursAgo) continue;
    const followedBack = await isFollowingBackFn(follow.userId);
    await updateFollowBack(follow.userId, followedBack);
  }
}

async function defaultIsFollowingBack(userId) {
  // TODO Task 8: implement sau khi xác minh friendship status API qua DevTools
  return false;
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'addPost') {
    const postId = extractPostId(message.postUrl);
    if (!postId) { sendResponse({ success: false, reason: 'invalid_url' }); return; }
    savePost(postId, message.postUrl).then(() => sendResponse({ success: true, postId }));
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
});

if (typeof module !== 'undefined') module.exports = { checkFollowBack };
```

- [ ] **Step 4: Chạy tất cả tests**

```
npx jest
```
Expected: PASS tất cả tests

- [ ] **Step 5: Commit**

```bash
git add background.js tests/background.test.js
git commit -m "feat: add background service worker"
```

---

### Task 7: Popup Dashboard

**Files:**
- Create: `popup.html`
- Create: `popup.css`
- Create: `popup.js`

- [ ] **Step 1: Tạo popup.html**

```html
<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="UTF-8">
  <title>FollowFaceBook</title>
  <link rel="stylesheet" href="popup.css">
</head>
<body>
  <div class="header">
    <span class="title">FollowFaceBook</span>
  </div>

  <div class="section">
    <label class="label">Bài post đang theo dõi:</label>
    <div class="input-row">
      <input type="text" id="postUrl" placeholder="Nhập link bài post Facebook..." />
      <button id="addPost">+</button>
    </div>
    <div id="postList"></div>
    <div id="addError" class="error hidden"></div>
  </div>

  <div class="stats-row">
    <div class="stat-box"><span class="stat-num" id="statFollowed">0</span><span class="stat-label">Đã follow</span></div>
    <div class="stat-box"><span class="stat-num" id="statQueue">0</span><span class="stat-label">Đang chờ</span></div>
    <div class="stat-box"><span class="stat-num" id="statBack">0</span><span class="stat-label">Follow lại</span></div>
    <div class="stat-box"><span class="stat-num" id="statNotBack">0</span><span class="stat-label">Chưa lại</span></div>
  </div>

  <div class="section">
    <label class="label">Chưa follow lại:</label>
    <div id="notBackList" class="follow-list"></div>
  </div>

  <script src="popup.js"></script>
</body>
</html>
```

- [ ] **Step 2: Tạo popup.css**

```css
* { box-sizing: border-box; margin: 0; padding: 0; }
body { width: 320px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; font-size: 13px; background: #fff; color: #1c1e21; }
.header { background: #1877f2; color: #fff; padding: 10px 14px; }
.title { font-weight: 700; font-size: 15px; }
.section { padding: 10px 14px; border-bottom: 1px solid #e4e6eb; }
.label { display: block; font-weight: 600; margin-bottom: 6px; color: #65676b; font-size: 11px; text-transform: uppercase; }
.input-row { display: flex; gap: 6px; }
.input-row input { flex: 1; border: 1px solid #ccd0d5; border-radius: 6px; padding: 6px 8px; font-size: 12px; }
.input-row button { background: #1877f2; color: #fff; border: none; border-radius: 6px; width: 28px; cursor: pointer; font-size: 18px; }
.input-row button:hover { background: #166fe5; }
.post-item { display: flex; justify-content: space-between; align-items: center; padding: 4px 0; border-bottom: 1px solid #f0f2f5; font-size: 11px; }
.post-item a { color: #1877f2; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 240px; }
.post-item .remove { cursor: pointer; color: #65676b; font-size: 14px; padding: 0 4px; }
.error { color: #e74c3c; font-size: 11px; margin-top: 4px; }
.hidden { display: none; }
.stats-row { display: flex; padding: 10px 14px; gap: 4px; border-bottom: 1px solid #e4e6eb; }
.stat-box { flex: 1; text-align: center; background: #f0f2f5; border-radius: 6px; padding: 6px 2px; }
.stat-num { display: block; font-size: 18px; font-weight: 700; color: #1877f2; }
.stat-label { font-size: 10px; color: #65676b; }
.follow-list { max-height: 150px; overflow-y: auto; }
.follow-item { display: flex; justify-content: space-between; padding: 5px 0; border-bottom: 1px solid #f0f2f5; }
.follow-item a { color: #1c1e21; text-decoration: none; font-size: 12px; }
.follow-item a:hover { text-decoration: underline; }
.follow-item .time { color: #65676b; font-size: 11px; }
```

- [ ] **Step 3: Tạo popup.js**

```javascript
function timeAgo(ts) {
  const h = Math.floor((Date.now() - ts) / 3600000);
  const m = Math.floor((Date.now() - ts) / 60000);
  return h > 0 ? `${h}h` : `${m}p`;
}

function renderPosts(posts) {
  const el = document.getElementById('postList');
  el.innerHTML = posts.map(p => `
    <div class="post-item">
      <a href="${p.postUrl}" target="_blank" title="${p.postUrl}">${p.postUrl}</a>
      <span class="remove" data-id="${p.postId}">×</span>
    </div>`).join('');
  el.querySelectorAll('.remove').forEach(btn =>
    btn.addEventListener('click', () =>
      chrome.runtime.sendMessage({ action: 'removePost', postId: btn.dataset.id }, loadStats)
    )
  );
}

function renderStats(follows, queue) {
  const checked = follows.filter(f => f.checkedAt !== null);
  document.getElementById('statFollowed').textContent = follows.length;
  document.getElementById('statQueue').textContent = queue.length;
  document.getElementById('statBack').textContent = checked.filter(f => f.followedBack).length;
  document.getElementById('statNotBack').textContent = checked.filter(f => !f.followedBack).length;

  const notBack = checked.filter(f => !f.followedBack);
  document.getElementById('notBackList').innerHTML = notBack.length === 0
    ? '<div style="padding:8px 0;color:#65676b;font-size:12px">Không có ai</div>'
    : notBack.map(f => `
        <div class="follow-item">
          <a href="${f.profileUrl}" target="_blank">${f.name || f.userId}</a>
          <span class="time">${timeAgo(f.followedAt)}</span>
        </div>`).join('');
}

function loadStats() {
  chrome.runtime.sendMessage({ action: 'getStats' }, ({ posts, follows, queue }) => {
    renderPosts(posts);
    renderStats(follows, queue);
  });
}

document.getElementById('addPost').addEventListener('click', () => {
  const url = document.getElementById('postUrl').value.trim();
  const errEl = document.getElementById('addError');
  errEl.classList.add('hidden');
  chrome.runtime.sendMessage({ action: 'addPost', postUrl: url }, res => {
    if (!res.success) {
      errEl.textContent = 'Link không hợp lệ. Dùng link bài post Facebook.';
      errEl.classList.remove('hidden');
      return;
    }
    document.getElementById('postUrl').value = '';
    loadStats();
  });
});

document.addEventListener('DOMContentLoaded', loadStats);
```

- [ ] **Step 4: Reload extension và test thủ công**

1. Vào `chrome://extensions/` → click **Reload** trên extension FollowFaceBook
2. Click icon extension trên toolbar
3. Kiểm tra popup hiển thị đúng layout
4. Nhập link bài post hợp lệ → nhấn `+` → kiểm tra hiện trong danh sách
5. Nhập link sai (ví dụ `https://facebook.com/profile`) → kiểm tra hiện thông báo lỗi
6. Click `×` bên cạnh bài post → kiểm tra bị xóa khỏi danh sách

- [ ] **Step 5: Commit**

```bash
git add popup.html popup.css popup.js
git commit -m "feat: add popup dashboard"
```

---

### Task 8: Xác minh Facebook API qua DevTools

**Mục tiêu:** Tìm đúng `doc_id` và cấu trúc `variables` để `fetchComments()` hoạt động thật.

- [ ] **Step 1: Mở bài post trên Chrome và mở DevTools**

Nhấn `F12` → chọn tab **Network** → filter `graphql`

- [ ] **Step 2: Scroll trang để load thêm comment**

Quan sát các request mới xuất hiện trong tab Network.

- [ ] **Step 3: Tìm request chứa data comments**

Click từng request `api/graphql` → tab **Response** → tìm request có chứa `display_comments` hoặc `feedback` trong JSON response.

- [ ] **Step 4: Copy thông số từ request đó**

Tab **Payload** của request đó → ghi lại:
- Giá trị `doc_id`
- Giá trị `variables` (JSON)

- [ ] **Step 5: Cập nhật fb-api.js với thông số thực tế**

Trong `fb-api.js`, thay thế dòng:
```javascript
doc_id: '5765854403456835', // CẦN XÁC MINH QUA DEVTOOLS
```
bằng `doc_id` thực tế tìm được. Cập nhật cấu trúc `variables` nếu khác.

- [ ] **Step 6: Test fetchComments() trong Service Worker console**

Vào `chrome://extensions/` → click **Service Worker** (inspect) → Console:
```javascript
importScripts('fb-api.js');
fetchComments('THAY_POST_ID_CUA_BAN').then(console.log).catch(console.error)
```
Expected: Mảng objects `[{userId, name, profileUrl}, ...]`

- [ ] **Step 7: Commit**

```bash
git add fb-api.js
git commit -m "feat: update Facebook API with verified endpoint"
```

---

### Task 9: Integration Test End-to-End

**Mục tiêu:** Xác nhận toàn bộ luồng hoạt động.

- [ ] **Step 1: Chạy toàn bộ unit tests**

```
npx jest
```
Expected: PASS tất cả

- [ ] **Step 2: Đảm bảo đang đăng nhập Facebook trên Chrome**

- [ ] **Step 3: Reload extension, mở popup, nhập link bài post**

- [ ] **Step 4: Trigger alarm thủ công để test ngay**

Vào `chrome://extensions/` → click **Service Worker** link → Console:
```javascript
chrome.alarms.onAlarm.dispatch({ name: 'poll-comments' })
```

- [ ] **Step 5: Kiểm tra log trong Service Worker console**

Không có lỗi đỏ. Có thể có log `[FollowFB]` nếu đã thêm vào.

- [ ] **Step 6: Kiểm tra storage**

Trong Service Worker console:
```javascript
chrome.storage.local.get(null, console.log)
```
Expected: `queue` có entries (nếu bài post có comment), `follows` tăng dần sau khi xử lý queue

- [ ] **Step 7: Quan sát tab tự mở và đóng**

Chrome sẽ mở tab ngắn tới profile người comment → tự đóng sau vài giây sau khi click Follow.

- [ ] **Step 8: Kiểm tra popup dashboard cập nhật số liệu**

Click icon extension → số **Đã follow** phải tăng.

- [ ] **Step 9: Final commit**

```bash
git add .
git commit -m "chore: complete integration testing"
```
