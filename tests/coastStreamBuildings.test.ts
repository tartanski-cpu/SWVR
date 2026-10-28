/**
 * Streamed buildings (owner, Oct 2026: "build the streaming for the Saronic map"): a big map's
 * buildings, most of its package, go one file per terrain chunk (tools/coast package.ts
 * `streamBuildings`), and the game fetches a chunk's as it comes to draw its town
 * (world/view/coastView.ts). The streamer's own fetch of a region's file, here with a fake
 * download in place of the web.
 */
import { describe, expect, it } from 'vitest';
import { CoastStreamer } from '../src/world/coastStream';

describe('streamed buildings: a region\'s chunk file fetched and read', () => {
  it('asks for the file under the region\'s folder and gives its buildings', async () => {
    const asked: string[] = [];
    const list = [{ x: 10, z: 20, width: 8, depth: 12, height: 6, yawDeg: 0 }];
    const s = new CoastStreamer('/base/', () => 'regions/saronic/', async (url) => {
      asked.push(url);
      return new TextEncoder().encode(JSON.stringify(list)).buffer as ArrayBuffer;
    });
    const got = await s.fetchJson<typeof list>('saronic', 'buildings/7.json');
    expect(asked).toEqual(['/base/regions/saronic/buildings/7.json']);
    expect(got).toEqual(list);
  });

  it('a failed download rejects (the game tries the chunk again later)', async () => {
    const s = new CoastStreamer('/', () => 'regions/x/', async () => {
      throw new Error('503');
    });
    await expect(s.fetchJson('x', 'buildings/1.json')).rejects.toThrow('503');
  });
});
