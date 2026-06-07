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
  if (!message) return false;

  if (message.action === 'follow') {
    waitForFollowButton().then(btn => {
      if (!btn) { sendResponse({ success: false, reason: 'button_not_found' }); return; }
      btn.click();
      // Đợi 3s để Facebook kịp gửi request follow trước khi tab bị đóng
      setTimeout(() => sendResponse({ success: true }), 3000);
    });
    return true;
  }

  if (message.action === 'fetchComments') {
    let dtsg = '';
    const dtsgPatterns = [
      /"DTSGInitialData",\[\],\{"token":"([^"]+)"/,
      /"token":"([^"]+)","hasToken":true/,
    ];
    for (const s of document.querySelectorAll('script')) {
      for (const p of dtsgPatterns) {
        const m = s.textContent.match(p);
        if (m) { dtsg = m[1]; break; }
      }
      if (dtsg) break;
    }
    if (!dtsg) { sendResponse({ error: 'Không tìm thấy fb_dtsg' }); return false; }

    const params = new URLSearchParams({
      fb_dtsg: dtsg,
      variables: JSON.stringify({
        id: btoa('feedback:' + message.postId),
        commentsAfterCount: 500,
        commentsAfterCursor: null,
        commentsBeforeCount: null,
        commentsBeforeCursor: null,
        commentsIntentToken: null,
        feedLocation: 'POST_PERMALINK_DIALOG',
        focusCommentID: null,
        scale: 1,
        useDefaultActor: false,
        '__relay_internal__pv__CometUFICommentAutoTranslationTyperelayprovider': 'AUTO_TRANSLATE',
        '__relay_internal__pv__CometUFICommentAvatarStickerAnimatedImagerelayprovider': false,
        '__relay_internal__pv__CometUFICommentActionLinksRewriteEnabledrelayprovider': false,
        '__relay_internal__pv__IsWorkUserrelayprovider': false,
      }),
      doc_id: '27639125115705107',
    });

    fetch('https://www.facebook.com/api/graphql/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
      credentials: 'include',
    })
      .then(r => r.text())
      .then(text => {
        const json = JSON.parse(text.split('\n')[0]);
        const edges = json?.data?.node?.comment_rendering_instance_for_feed_location?.comments?.edges || [];
        const seen = new Set();
        const commenters = [];
        for (const edge of edges) {
          const { author, depth } = edge.node;
          if (depth !== 0 || !author || seen.has(author.id)) continue;
          seen.add(author.id);
          const avatarUrl = author.profile_picture_depth_0?.uri
            || author.profile_picture_depth_1?.uri
            || author.profile_picture?.uri
            || '';
          commenters.push({ userId: author.id, name: author.name, profileUrl: author.url, avatarUrl });
        }
        sendResponse({ commenters });
      })
      .catch(e => sendResponse({ error: e.message }));
    return true;
  }

  return false;
});

// Extract fb_dtsg token từ script tags và cache vào storage để Service Worker dùng
// Facebook inject script động sau document_idle nên cần retry
(function cacheFbDtsg(retries) {
  const patterns = [
    /"DTSGInitialData",\[\],\{"token":"([^"]+)"/,
    /"token":"([^"]+)","hasToken":true/,
    /"DTSGInitialData"[^}]{0,80}"token":"([^"]+)"/,
  ];
  for (const s of document.querySelectorAll('script')) {
    for (const p of patterns) {
      const m = s.textContent.match(p);
      if (m) { chrome.storage.local.set({ fb_dtsg: m[1] }); return; }
    }
  }
  if (retries > 0) setTimeout(() => cacheFbDtsg(retries - 1), 3000);
})(4);
