const { getRandomDelay, canFollow, followUser } = require('../queue-processor');

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

describe('followUser', () => {
  beforeAll(() => {
    chrome.tabs.create = jest.fn();
    chrome.tabs.sendMessage = jest.fn();
    chrome.tabs.remove = jest.fn();
    chrome.tabs.onUpdated = { addListener: jest.fn(), removeListener: jest.fn() };
  });

  beforeEach(() => {
    chrome.tabs.create.mockReset();
    chrome.tabs.onUpdated.addListener.mockReset();
    chrome.tabs.onUpdated.removeListener.mockReset();
    chrome.tabs.sendMessage.mockReset();
    chrome.tabs.remove.mockReset();
  });

  test('trả về {success: false, reason: "tab_create_failed"} khi tab không tạo được', async () => {
    chrome.tabs.create.mockImplementation((opts, cb) => {
      Object.defineProperty(chrome.runtime, 'lastError', { value: { message: 'Permission denied' }, configurable: true });
      cb(null);
      Object.defineProperty(chrome.runtime, 'lastError', { value: undefined, configurable: true });
    });
    const result = await followUser('https://www.facebook.com/u1');
    expect(result).toEqual({ success: false, reason: 'tab_create_failed' });
  });

  test('trả về {success: true} khi follow thành công', async () => {
    chrome.tabs.create.mockImplementation((opts, cb) => {
      cb({ id: 42 });
    });
    chrome.tabs.onUpdated.addListener.mockImplementation((listener) => {
      // Giả lập tab load xong ngay lập tức
      setTimeout(() => listener(42, { status: 'complete' }), 0);
    });
    chrome.tabs.sendMessage.mockImplementation((tabId, msg, cb) => {
      cb({ success: true });
    });
    chrome.tabs.remove.mockImplementation(() => {});

    const result = await followUser('https://www.facebook.com/u1');
    expect(result).toEqual({ success: true });
    expect(chrome.tabs.remove).toHaveBeenCalledWith(42);
  });

  test('trả về {success: false, reason: "no_content_script"} khi content script không respond', async () => {
    chrome.tabs.create.mockImplementation((opts, cb) => cb({ id: 43 }));
    chrome.tabs.onUpdated.addListener.mockImplementation((listener) => {
      setTimeout(() => listener(43, { status: 'complete' }), 0);
    });
    chrome.tabs.sendMessage.mockImplementation((tabId, msg, cb) => {
      Object.defineProperty(chrome.runtime, 'lastError', { value: { message: 'No handler' }, configurable: true });
      cb(undefined);
      Object.defineProperty(chrome.runtime, 'lastError', { value: undefined, configurable: true });
    });
    chrome.tabs.remove.mockImplementation(() => {});

    const result = await followUser('https://www.facebook.com/u1');
    expect(result).toEqual({ success: false, reason: 'no_content_script' });
  });
});
