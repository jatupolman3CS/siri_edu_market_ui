import { acquirePageScrollLock, pageScrollLockCount, releasePageScrollLock } from './scroll-lock';

describe('page scroll lock', () => {
  afterEach(() => {
    while (pageScrollLockCount() > 0) releasePageScrollLock(document);
    document.documentElement.style.overflow = '';
    document.body.style.overflow = '';
  });

  it('hides <html> overflow and pins <body> to visible so body never becomes the scroller', () => {
    acquirePageScrollLock(document);
    expect(document.documentElement.style.overflow).toBe('hidden');
    expect(document.body.style.overflow).toBe('visible');
  });

  it('restores both inline values once the last holder releases', () => {
    document.body.style.overflow = 'clip';
    acquirePageScrollLock(document);
    acquirePageScrollLock(document);
    releasePageScrollLock(document);
    expect(document.documentElement.style.overflow).toBe('hidden');

    releasePageScrollLock(document);
    expect(document.documentElement.style.overflow).toBe('');
    expect(document.body.style.overflow).toBe('clip');
  });

  it('ignores an unbalanced release', () => {
    releasePageScrollLock(document);
    expect(pageScrollLockCount()).toBe(0);
    acquirePageScrollLock(document);
    expect(pageScrollLockCount()).toBe(1);
  });
});
