import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { scanLibrary, loadVolume, loadFullVolume } from '../src/lib/content.js';
import { getViewer } from '../src/lib/access/viewer.js';
import { chapterAnchor, fullVolumeUrl, wantsFullVolume } from '../src/lib/reading-mode.js';
import { fixture, write } from './fixtures.js';

test('reading-mode helpers', () => {
  assert.equal(fullVolumeUrl('/c/a/b/v'), '/c/a/b/v?read=full');
  assert.equal(wantsFullVolume('full'), true);
  assert.equal(wantsFullVolume(['full', 'x']), true);
  assert.equal(wantsFullVolume('chapter'), false);
  assert.equal(wantsFullVolume(undefined), false);
  // Section anchors are prefixed so a generated heading id can never collide with one.
  assert.equal(chapterAnchor({ slug: 'intro' }), 'ch-intro');
});

test('continuous volume rendering', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'folio-continuous-'));
  process.env.CONTENT_ROOT = root;
  delete process.env.ACCESS_MODE; delete process.env.ACCESS_POLICY;
  const viewer = getViewer();
  try {
    await fixture(root);
    const base = 'a-os/linux/volumes/split';
    await write(root, `${base}/volume.json`, JSON.stringify({ title: 'Split volume', order: 99 }));
    await write(root, `${base}/chapters/01-first.md`, '# First chapter\n\n## Opening\n\nAlpha text.\n\n```bash\necho one\n```\n');
    await write(root, `${base}/chapters/02-second.md`, '# Second chapter\n\n## Middle\n\nBeta text.\n\n| a | b |\n| - | - |\n| 1 | 2 |\n');
    await write(root, `${base}/chapters/03-third.md`, '# Third chapter\n\n## Closing\n\nGamma text with [an anchor](#opening).\n');
    // A second chaptered volume, so the "next" neighbour is one that has a continuous view.
    await write(root, 'a-os/linux/volumes/split-two/volume.json', JSON.stringify({ title: 'Second split', order: 100 }));
    await write(root, 'a-os/linux/volumes/split-two/chapters/01-only.md', '# Only chapter\n\n## Solo\n\nDelta text.\n');

    const library = await scanLibrary(viewer);
    const course = library.categories[0].courses[0];
    const volume = course.volumes.find(v => v.slug === 'split');
    assert.equal(volume.chapters.length, 3, 'fixture volume has three chapters');
    const full = await loadFullVolume(viewer, course, volume);

    await t.test('returns every chapter in order, each with its own html', () => {
      assert.equal(full.continuous, true);
      assert.deepEqual(full.chapters.map(c => c.title), ['First chapter', 'Second chapter', 'Third chapter']);
      for (const chapter of full.chapters) assert.ok(chapter.html.length > 0, `${chapter.title} rendered`);
      assert.match(full.chapters[0].html, /Alpha text/);
      assert.match(full.chapters[1].html, /Beta text/);
      assert.match(full.chapters[2].html, /Gamma text/);
    });

    await t.test('keeps code blocks, tables and other formatting intact', () => {
      assert.match(full.chapters[0].html, /<pre[^>]*><code/);
      assert.match(full.chapters[1].html, /<table>/);
      assert.match(full.chapters[1].html, /table-scroll/);
    });

    await t.test('no chapter leaks into another', () => {
      assert.doesNotMatch(full.chapters[0].html, /Beta text|Gamma text/);
      assert.doesNotMatch(full.chapters[1].html, /Alpha text|Gamma text/);
    });

    await t.test('heading ids are unique across the whole page', () => {
      const ids = full.chapters.flatMap(c => [...c.html.matchAll(/ id="([^"]+)"/g)].map(m => m[1]));
      assert.equal(ids.length, new Set(ids).size, 'duplicate ids would break in-page anchors');
    });

    await t.test('in-page anchors stay local instead of pointing at a chapter page', () => {
      // The single-chapter view rewrites #opening to another chapter's URL; on one page it must not.
      assert.match(full.chapters[2].html, /href="#opening"/);
    });

    await t.test('reports per-chapter and total reading time, and carries progress permission', () => {
      assert.equal(full.minutes, full.chapters.reduce((n, c) => n + c.minutes, 0));
      for (const chapter of full.chapters) assert.equal(chapter.progressAllowed, true);
    });

    await t.test('adjacent volumes keep the reader in continuous mode when they can', () => {
      // The next volume has chapters, so it offers a continuous view of its own.
      assert.match(full.next.url, /\?read=full$/);
      // The previous one is a single file: its plain URL already is the whole volume.
      assert.doesNotMatch(full.previous.url, /\?read=full$/);
      // The unmodified links stay available for the chapter-by-chapter footer.
      assert.doesNotMatch(full.nextVolume.url, /\?read=full$/);
    });

    await t.test('the same content as reading each chapter on its own page', async () => {
      const single = await loadVolume(viewer, course, volume, volume.chapters[1].slug);
      const text = html => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
      assert.equal(text(full.chapters[1].html), text(single.html));
    });
  } finally {
    delete process.env.CONTENT_ROOT;
    await fs.rm(root, { recursive: true, force: true });
  }
});
