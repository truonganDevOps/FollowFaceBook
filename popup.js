function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function timeAgo(ts) {
  if (!ts) return '';
  const elapsed = Date.now() - ts;
  const m = Math.floor(elapsed / 60000);
  const h = Math.floor(elapsed / 3600000);
  const d = Math.floor(elapsed / 86400000);
  if (d > 0) return `${d} ngày trước`;
  if (h > 0) return `${h}h trước`;
  if (m > 0) return `${m}p trước`;
  return 'vừa xong';
}

function getInitial(name) {
  const parts = String(name || '?').trim().split(' ');
  return parts[parts.length - 1][0]?.toUpperCase() || '?';
}

function getAvatarColor(userId) {
  const colors = ['#1877f2','#e17055','#00b894','#6c5ce7','#fd79a8','#0984e3','#00cec9','#fdcb6e'];
  let hash = 0;
  for (const c of String(userId)) hash = (hash * 31 + c.charCodeAt(0)) & 0xffff;
  return colors[hash % colors.length];
}

function shortPostUrl(url) {
  try {
    const u = new URL(url);
    const parts = u.pathname.split('/').filter(Boolean);
    return parts.slice(-2).join('/') || url;
  } catch { return url; }
}

let _currentFilter = 'all';
let _allData = { follows: [], queue: [], posts: [] };

function renderPosts(posts) {
  const el = document.getElementById('postList');
  if (!posts.length) { el.innerHTML = ''; return; }
  el.innerHTML = posts.map(p => `
    <div class="post-item">
      <a href="${escapeHtml(p.postUrl)}" target="_blank" title="${escapeHtml(p.postUrl)}">${escapeHtml(p.postUrl)}</a>
      <span class="remove" data-id="${escapeHtml(p.postId)}">×</span>
    </div>`).join('');
  el.querySelectorAll('.remove').forEach(btn =>
    btn.addEventListener('click', () =>
      chrome.runtime.sendMessage({ action: 'removePost', postId: btn.dataset.id }, loadStats)
    )
  );
}

function renderStats(follows, queue) {
  const checked = follows.filter(f => f.checkedAt != null);
  document.getElementById('statFollowed').textContent = follows.length;
  document.getElementById('statQueue').textContent = queue.length;
  document.getElementById('statBack').textContent = checked.filter(f => f.followedBack).length;
  document.getElementById('statNotBack').textContent = checked.filter(f => !f.followedBack).length;
}

function buildPersonItems(follows, queue) {
  const items = [];
  for (const q of queue) {
    items.push({ userId: q.userId, name: q.name || q.userId, profileUrl: q.profileUrl, postId: q.postId, avatarUrl: q.avatarUrl || '', status: 'queue', time: null });
  }
  for (const f of follows) {
    let status = 'followed';
    if (f.checkedAt != null) status = f.followedBack ? 'back' : 'notback';
    items.push({ userId: f.userId, name: f.name || f.userId, profileUrl: f.profileUrl, postId: f.postId, avatarUrl: f.avatarUrl || '', status, time: f.followedAt });
  }
  return items;
}

function filterItems(items, filter) {
  if (filter === 'all') return items;
  if (filter === 'queue') return items.filter(i => i.status === 'queue');
  if (filter === 'followed') return items.filter(i => i.status === 'followed');
  if (filter === 'back') return items.filter(i => i.status === 'back');
  if (filter === 'notback') return items.filter(i => i.status === 'notback');
  return items;
}

function groupByPost(items, posts) {
  const postMap = new Map(posts.map(p => [p.postId, p.postUrl]));
  const groups = new Map();
  for (const item of items) {
    const key = item.postId || '__unknown__';
    if (!groups.has(key)) groups.set(key, { postUrl: postMap.get(key) || key, items: [] });
    groups.get(key).items.push(item);
  }
  return [...groups.values()];
}

const BADGE = {
  queue:    ['badge-queue',    '⏳ Chờ'],
  followed: ['badge-followed', '✓ Đã FL'],
  back:     ['badge-back',     '✅ FL lại'],
  notback:  ['badge-notback',  '✗ Chưa'],
};

function renderPersonItem(item) {
  const [badgeClass, badgeText] = BADGE[item.status];
  const initial = escapeHtml(getInitial(item.name));
  const color = escapeHtml(getAvatarColor(item.userId));
  const imgSrc = item.avatarUrl ? escapeHtml(item.avatarUrl) : '';
  const meta = item.time ? timeAgo(item.time) : (item.status === 'queue' ? 'Chờ follow' : '');
  return `
    <div class="person-item">
      <div class="avatar" style="background:${color}">
        ${imgSrc ? `<img src="${imgSrc}" class="avatar-img" alt="" onerror="this.remove()">` : ''}
        ${initial}
      </div>
      <div class="person-info">
        <a class="person-name" href="${escapeHtml(item.profileUrl)}" target="_blank">${escapeHtml(item.name)}</a>
        <span class="person-meta">${escapeHtml(meta)}</span>
      </div>
      <span class="badge ${badgeClass}">${badgeText}</span>
    </div>`;
}

function renderPersonList(filter) {
  const { follows, queue, posts } = _allData;
  const all = buildPersonItems(follows, queue);
  const filtered = filterItems(all, filter);
  const el = document.getElementById('personList');

  if (!filtered.length) {
    el.innerHTML = `<div class="empty">Không có dữ liệu</div>`;
    return;
  }

  const groups = groupByPost(filtered, posts);
  el.innerHTML = groups.map(group => `
    <div class="post-group">
      <div class="post-group-header">
        <a href="${escapeHtml(group.postUrl)}" target="_blank" title="${escapeHtml(group.postUrl)}">${escapeHtml(shortPostUrl(group.postUrl))}</a>
        <span class="group-count">${group.items.length} người</span>
      </div>
      ${group.items.map(renderPersonItem).join('')}
    </div>`).join('');
}

function loadStats() {
  chrome.runtime.sendMessage({ action: 'getStats' }, res => {
    if (!res) return;
    const { posts, follows, queue } = res;
    _allData = { follows: follows || [], queue: queue || [], posts: posts || [] };
    renderPosts(posts || []);
    renderStats(follows || [], queue || []);
    renderPersonList(_currentFilter);
  });
}

document.querySelectorAll('.tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    _currentFilter = tab.dataset.filter;
    renderPersonList(_currentFilter);
  });
});

const filterMap = { statFollowed: 'followed', statQueue: 'queue', statBack: 'back', statNotBack: 'notback' };
Object.entries(filterMap).forEach(([id, filter]) => {
  document.getElementById(id)?.closest('.stat-box')?.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.filter === filter));
    _currentFilter = filter;
    renderPersonList(_currentFilter);
  });
});

document.getElementById('addPost').addEventListener('click', () => {
  const url = document.getElementById('postUrl').value.trim();
  const errEl = document.getElementById('addError');
  errEl.classList.add('hidden');
  chrome.runtime.sendMessage({ action: 'addPost', postUrl: url }, res => {
    if (!res || !res.success) {
      errEl.textContent = res?.reason === 'invalid_url'
        ? 'Link không hợp lệ. Dùng link bài post Facebook.'
        : 'Có lỗi xảy ra. Thử lại sau.';
      errEl.classList.remove('hidden');
      return;
    }
    document.getElementById('postUrl').value = '';
    loadStats();
  });
});

document.getElementById('scanNow').addEventListener('click', () => {
  const btn = document.getElementById('scanNow');
  const statusEl = document.getElementById('scanStatus');
  btn.disabled = true;
  btn.textContent = 'Đang quét...';
  statusEl.textContent = 'Đang fetch comment và xếp hàng follow...';
  statusEl.classList.remove('hidden');

  chrome.runtime.sendMessage({ action: 'scanNow' }, () => {
    // Cập nhật stats sau mỗi 3s trong 30s để hiển thị tiến độ
    let ticks = 0;
    const interval = setInterval(() => {
      loadStats();
      ticks++;
      if (ticks >= 10) {
        clearInterval(interval);
        btn.disabled = false;
        btn.textContent = 'Quét & Follow ngay';
        statusEl.textContent = 'Hoàn tất lần quét. Extension tiếp tục follow ngầm.';
        setTimeout(() => statusEl.classList.add('hidden'), 4000);
      }
    }, 3000);
  });
});

document.addEventListener('DOMContentLoaded', loadStats);
