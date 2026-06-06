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
