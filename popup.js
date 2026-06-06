function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function timeAgo(ts) {
  const elapsed = Date.now() - ts;
  const h = Math.floor(elapsed / 3600000);
  const m = Math.floor(elapsed / 60000);
  return h > 0 ? `${h}h` : `${m}p`;
}

function renderPosts(posts) {
  const el = document.getElementById('postList');
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

  const notBack = checked.filter(f => !f.followedBack);
  document.getElementById('notBackList').innerHTML = notBack.length === 0
    ? '<div style="padding:8px 0;color:#65676b;font-size:12px">Không có ai</div>'
    : notBack.map(f => `
        <div class="follow-item">
          <a href="${escapeHtml(f.profileUrl)}" target="_blank">${escapeHtml(f.name || f.userId)}</a>
          <span class="time">${timeAgo(f.followedAt)}</span>
        </div>`).join('');
}

function loadStats() {
  chrome.runtime.sendMessage({ action: 'getStats' }, res => {
    if (!res) return;
    const { posts, follows, queue } = res;
    renderPosts(posts);
    renderStats(follows, queue);
  });
}

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

document.addEventListener('DOMContentLoaded', loadStats);
