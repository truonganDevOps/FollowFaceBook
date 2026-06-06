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
