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
