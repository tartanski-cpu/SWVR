/**
 * Keeping a page the build the site serves (src/build.ts): a page behind the site loads
 * itself again past the cache, once, keeping its address; a fresh one, a dev page or a
 * site that can't say stays.
 */
import { describe, expect, it } from 'vitest';
import { freshUrl } from '../src/build';

describe('a page behind the site reloads once', () => {
  const href = 'https://example.test/SWVR/next/?design=00XN3-V2SBD-VB84C-07GGP&together=12345';
  it('behind: the same address plus fresh and a cache-buster', () => {
    const u = freshUrl('NEXT aaa 2026-10-19 10:00', 'NEXT bbb 2026-10-19 11:00', href);
    expect(u).not.toBeNull();
    const url = new URL(u!);
    expect(url.pathname).toBe('/SWVR/next/');
    expect(url.searchParams.get('design')).toBe('00XN3-V2SBD-VB84C-07GGP');
    expect(url.searchParams.get('together')).toBe('12345');
    expect(url.searchParams.get('fresh')).toBe('1');
    expect(url.searchParams.get('t')).toMatch(/^\d+$/);
  });
  it('the same build, a dev page, no answer, or already fresh: stays', () => {
    expect(freshUrl('NEXT aaa', 'NEXT aaa', href)).toBeNull();
    expect(freshUrl('dev', 'NEXT bbb', href)).toBeNull();
    expect(freshUrl('NEXT aaa', null, href)).toBeNull();
    expect(freshUrl('NEXT aaa', 'NEXT bbb', href + '&fresh=1&t=1')).toBeNull();
  });
});

describe('isNewerBuild', () => {
  it('compares two builds by when they were made; dev or the same minute is not newer', async () => {
    const { isNewerBuild } = await import('../src/build');
    expect(isNewerBuild('NEXT db2e869 2026-10-25 16:43', 'NEXT 18ff12f 2026-10-25 14:57')).toBe(true);
    expect(isNewerBuild('NEXT 18ff12f 2026-10-25 14:57', 'NEXT db2e869 2026-10-25 16:43')).toBe(false);
    expect(isNewerBuild('NEXT aaaaaaa 2026-10-25 16:43', 'NEXT bbbbbbb 2026-10-25 16:43')).toBe(false);
    expect(isNewerBuild('dev', 'NEXT db2e869 2026-10-25 16:43')).toBe(false);
    expect(isNewerBuild('2026-10-26 09:00', undefined)).toBe(false);
  });
});
