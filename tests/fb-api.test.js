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
