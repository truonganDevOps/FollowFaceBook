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
