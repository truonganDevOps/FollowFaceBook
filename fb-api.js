const COMMENTS_DOC_ID = '27639125115705107';

function extractPostId(url) {
  try {
    const u = new URL(url);
    const postsMatch = u.pathname.match(/\/posts\/([\w]+)/);
    if (postsMatch) return postsMatch[1];
    const permalinkMatch = u.pathname.match(/\/permalink\/([\d]+)/);
    if (permalinkMatch) return permalinkMatch[1];
    const storyId = u.searchParams.get('story_fbid');
    if (storyId) return storyId;
    return null;
  } catch {
    return null;
  }
}

function parseCommenters(response) {
  try {
    const edges = response.data.node.comment_rendering_instance_for_feed_location.comments.edges;
    const seen = new Set();
    return edges.reduce((acc, edge) => {
      const { author, depth } = edge.node;
      if (depth !== 0 || !author || seen.has(author.id)) return acc;
      seen.add(author.id);
      acc.push({ userId: author.id, name: author.name, profileUrl: author.url });
      return acc;
    }, []);
  } catch (e) { console.warn('[fb-api] parseCommenters error:', e); return []; }
}

async function getFbDtsg() {
  return new Promise(resolve =>
    chrome.storage.local.get(['fb_dtsg'], data => resolve(data.fb_dtsg || ''))
  );
}

async function fetchComments(postId) {
  let dtsg;
  try {
    dtsg = await getFbDtsg();
  } catch (e) {
    throw new Error(`[fb-api] Failed to get fb_dtsg token: ${e.message}`);
  }
  if (!dtsg) throw new Error('Chưa có token. Vui lòng mở ít nhất một tab Facebook trước.');
  const params = new URLSearchParams({
    fb_dtsg: dtsg,
    variables: JSON.stringify({
      id: btoa(`feedback:${postId}`),
      commentsAfterCount: 50,
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
    doc_id: COMMENTS_DOC_ID,
  });

  const response = await fetch('https://www.facebook.com/api/graphql/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
    credentials: 'include',
  });

  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const text = await response.text();
  let json;
  try {
    json = JSON.parse(text.split('\n')[0]);
  } catch (e) {
    throw new Error(`[fb-api] Failed to parse Facebook response: ${e.message}`);
  }
  return parseCommenters(json);
}

if (typeof module !== 'undefined') module.exports = { extractPostId, parseCommenters, fetchComments };
