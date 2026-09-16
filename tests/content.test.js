import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { scanLibrary, loadVolume, searchLibrary, publicLibrary, serveThumbnail } from '../src/lib/content.js';
import { resolveThumbnail, matches, patternOrder, placeholder, safeImage } from '../src/lib/thumbnails.js';
import { can } from '../src/lib/access/policy.js';
import { getViewer } from '../src/lib/access/viewer.js';
import { fixture, write } from './fixtures.js';

test('filesystem, access and thumbnail integration', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'folio-test-'));
  process.env.CONTENT_ROOT = root;
  delete process.env.ACCESS_MODE; delete process.env.ACCESS_POLICY;
  const viewer = getViewer();
  try {
    await fixture(root);
    await t.test('discovery, real ordering, outlier, paths and placeholders', async () => {
      const library = await scanLibrary(viewer);
      assert.equal(library.categories.length, 3);
      const linux = library.categories[0].courses[0];
      assert.equal(new Set(linux.volumes.map(v => v.title)).size, 10);
      assert.equal(linux.volumes[0].order, 0);
      const trees = library.categories[1].courses[0];
      assert.equal(trees.volumes.at(-1).title, 'B-tree and nbtree guide');
      assert.equal(trees.volumes.at(-1).order, null);
      assert.notEqual(linux.volumes[1].url, trees.volumes[0].url);
      assert.equal(library.categories[2].courses.length, 0);
      assert.equal(linux.thumbnail.origin, 'placeholder');
      assert.equal(linux.thumbnail.url, placeholder(linux.title));
      assert.ok(!JSON.stringify(publicLibrary(library)).includes('SECRET_VOLUME'));
    });
    await t.test('hot discovery, double digits, direct course, collision slugs, draft and stable IDs', async () => {
      await write(root, 'a-os/linux/volumes/volume-10-next.md', '# Book\n\n## Tenth');
      await write(root, 'direct-course/volumes/space ü & name.md', '---\nid: stable-volume\n---\n# Unicode guide');
      await write(root, 'direct-course/meta.json', '{"id":"stable-course"}');
      await write(root, 'direct-course/volumes/a!.md', '# Punctuation');
      await write(root, 'direct-course/volumes/a@.md', '# Collision');
      await write(root, 'direct-course/volumes/draft.md', '---\ndraft: true\n---\n# Hidden draft');
      await fs.mkdir(path.join(root, 'a-os/not-a-course'));
      const library = await scanLibrary(viewer);
      const linux = library.categories.find(c => c.slug === 'a-os').courses[0];
      assert.equal(linux.volumes.at(-1).order, 10);
      const direct = library.categories.find(c => c.slug === 'uncategorized').courses[0];
      assert.equal(direct.volumes.length, 3); assert.equal(new Set(direct.volumes.map(v => v.slug)).size, 3);
      assert.ok(direct.volumes.some(v => v.resource.id === 'stable-course/stable-volume'));
      assert.ok(library.warnings.some(w => w.includes('not-a-course')));
      await fs.rename(path.join(root, 'direct-course/volumes/space ü & name.md'), path.join(root, 'direct-course/volumes/renamed.md'));
      const renamed = await scanLibrary(viewer);
      assert.ok(renamed.categories.find(c => c.slug === 'uncategorized').courses[0].volumes.some(v => v.resource.id === 'stable-course/stable-volume'));
    });
    await t.test('demo decisions cascade, redact content/search, gate progress/navigation/images', async () => {
      process.env.ACCESS_MODE = 'policy'; process.env.ACCESS_POLICY = 'demo';
      const library = await scanLibrary(viewer);
      assert.ok(!library.categories.some(c => c.slug === 'b-db'));
      const linux = library.categories.find(c => c.slug === 'a-os').courses[0];
      const locked = await loadVolume(viewer, linux, linux.volumes[4]);
      assert.equal(locked.html, ''); assert.equal(locked.decision.effect, 'deny');
      const preview = await loadVolume(viewer, linux, linux.volumes[1]);
      assert.equal(preview.toc.length, 3); assert.ok(!preview.html.includes('SECRET_VOLUME_1'));
      assert.equal(linux.volumes[1].progressAllowed, false);
      assert.equal((await loadVolume(viewer, linux, linux.volumes[3])).next, null);
      assert.equal((await searchLibrary(viewer, 'SECRET_VOLUME_4')).results.length, 0);
      assert.equal((await searchLibrary(viewer, 'SECRET_VOLUME_1')).results.length, 0);
      assert.equal((await searchLibrary(viewer, 'HIDDEN_COURSE_SECRET')).results.length, 0);
      assert.equal((await serveThumbnail(viewer, 'b-db/trees')).status, 404);
      const denied = await can(viewer, 'read', { type: 'volume', id: 'v', order: 0 }, { categoryIndex: 1, ancestors: [{ type: 'category', id: 'hidden' }] });
      assert.equal(denied.effect, 'deny');
      delete process.env.ACCESS_MODE; delete process.env.ACCESS_POLICY;
      assert.ok((await scanLibrary(viewer)).categories.some(c => c.slug === 'b-db'));
    });
    await t.test('thumbnail precedence, patterns, hot reload, metadata and malformed config', async () => {
      const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"/>';
      await write(root, 'assets/exact.svg', svg); await write(root, 'assets/pattern.svg', svg);
      await write(root, 'a-os/linux/Thumbnail.PNG', 'test bytes');
      await write(root, 'thumbnails.config.json', JSON.stringify({ map: { 'a-os/linux': 'assets/exact.svg' }, patterns: { '**': 'assets/exact.svg', 'a-os/linux/volume-*': 'assets/pattern.svg' }, inherit: true }));
      let library = await scanLibrary(viewer), linux = library.categories.find(c => c.slug === 'a-os').courses[0];
      assert.equal(linux.thumbnail.origin, 'map');
      assert.equal(linux.volumes[0].thumbnail.origin, 'pattern');
      assert.ok(linux.volumes[0].thumbnail.local.endsWith('pattern.svg'));
      await write(root, 'a-os/linux/meta.json', JSON.stringify({ thumbnail: 'assets/pattern.svg', access: 'malformed' }));
      library = await scanLibrary(viewer); linux = library.categories.find(c => c.slug === 'a-os').courses[0];
      assert.equal(linux.thumbnail.origin, 'metadata'); assert.ok(library.warnings.some(w => w.includes('Malformed access')));
      await write(root, 'a-os/linux/meta.json', '{}');
      await write(root, 'thumbnails.config.json', JSON.stringify({ map: { 'a-os/linux': 'assets/missing.png' }, inherit: true }));
      library = await scanLibrary(viewer); linux = library.categories.find(c => c.slug === 'a-os').courses[0];
      assert.equal(linux.thumbnail.origin, 'sidecar'); assert.equal(linux.volumes[0].thumbnail.origin, 'inherited');
      assert.ok(library.warnings.some(w => w.includes('missing.png')));
      await fs.unlink(path.join(root, 'a-os/linux/Thumbnail.PNG'));
      library = await scanLibrary(viewer); assert.equal(library.categories.find(c => c.slug === 'a-os').courses[0].thumbnail.origin, 'placeholder');
      await write(root, 'thumbnails.config.json', '{bad');
      library = await scanLibrary(viewer); assert.ok(library.warnings.some(w => w.includes('Invalid metadata')));
      assert.equal(library.categories.find(c => c.slug === 'a-os').courses[0].thumbnail.origin, 'placeholder');
      assert.ok(matches('**/volume-*', 'a/b/volume-1')); assert.ok(!matches('a/*', 'a/b/c'));
      assert.deepEqual(['**', 'a/*', 'a/b*'].sort(patternOrder), ['a/b*', 'a/*', '**']);
      const node = { resource: { type: 'volume', id: 'v' }, title: 'V', contentKey: 'c/v', key: 'c/v' };
      assert.equal((await resolveThumbnail(node, null, { defaults: { volume: 'assets/exact.svg' } }, root, () => {})).origin, 'default');
    });
    await t.test('thumbnail traversal and absolute paths outside allowed roots are rejected', async () => {
      assert.equal((await serveThumbnail(viewer, '../../etc/passwd')).status, 400);
      assert.equal(await safeImage('../escape.svg', root, () => {}), null);
      const outside = path.join(os.tmpdir(), `folio-outside-${Date.now()}.svg`);
      await fs.writeFile(outside, '<svg/>');
      try {
        assert.equal(await safeImage(outside, root, () => {}), null);
        process.env.THUMBNAIL_ROOTS = path.dirname(outside);
        assert.ok((await safeImage(outside, root, () => {})).local);
        delete process.env.THUMBNAIL_ROOTS;
        try { await fs.symlink(path.dirname(outside), path.join(root, 'escape'), process.platform === 'win32' ? 'junction' : 'dir'); }
        catch (error) { if (['EPERM', 'EACCES'].includes(error.code)) { t.diagnostic('Symlink creation unavailable; containment still tested through absolute paths.'); return; } throw error; }
        assert.equal(await safeImage(`escape/${path.basename(outside)}`, root, () => {}), null);
      } finally { await fs.unlink(outside); }
    });
    await t.test('unreadable Markdown surfaces a notice instead of crashing', async subtest => {
      await write(root, 'a-os/linux/volumes/unreadable.md', '# An unreadable volume');
      const readFile = fs.readFile;
      subtest.mock.method(fs, 'readFile', async (file, ...args) => {
        if (String(file).endsWith('unreadable.md')) throw Object.assign(new Error('Permission denied'), { code: 'EACCES' });
        return readFile(file, ...args);
      });
      const library = await scanLibrary(viewer);
      assert.ok(library.warnings.some(w => w.includes('EACCES')));
      const course = library.categories.find(c => c.slug === 'a-os').courses[0];
      const rendered = await loadVolume(viewer, course, course.volumes.find(v => v.slug === 'unreadable'));
      assert.ok(rendered.error.includes('EACCES')); assert.equal(rendered.html, '');
    });
    await t.test('missing content root is a working empty library', async () => {
      process.env.CONTENT_ROOT = path.join(root, 'does-not-exist');
      assert.deepEqual((await scanLibrary(viewer)).categories, []);
    });
  } finally { delete process.env.CONTENT_ROOT; delete process.env.ACCESS_MODE; delete process.env.ACCESS_POLICY; await fs.rm(root, { recursive: true, force: true }); }
});