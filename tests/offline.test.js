import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { scanLibrary, publicLibrary } from '../src/lib/content.js';
import { getViewer } from '../src/lib/access/viewer.js';
import { coursePlan, findCourse } from '../src/lib/offline/plan.js';
import { COURSE_PREFIX } from '../src/lib/offline/cache.js';
import { fixture, write } from './fixtures.js';

test('the service worker agrees with the shared cache names', async () => {
  const worker = await fs.readFile('public/sw.js', 'utf8');
  assert.match(worker, new RegExp(`const COURSE_PREFIX = '${COURSE_PREFIX}'`), 'sw.js repeats COURSE_PREFIX and must match src/lib/offline/cache.js');
  // Downloads are driven from the page; a worker that fetches on a message would be killed
  // partway through a long course.
  assert.ok(!/addEventListener\('message'/.test(worker), 'the worker must not run downloads');
});

test('offline download plans', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'folio-offline-'));
  process.env.CONTENT_ROOT = root;
  delete process.env.ACCESS_MODE; delete process.env.ACCESS_POLICY;
  try {
    await fixture(root);
    // A chaptered volume, which redirects from its own URL to its first chapter.
    await write(root, 'a-os/linux/volumes/split/volume.json', JSON.stringify({ title: 'Split volume' }));
    await write(root, 'a-os/linux/volumes/split/chapters/01-one.md', '# One\n\nFirst chapter.');
    await write(root, 'a-os/linux/volumes/split/chapters/02-two.md', '# Two\n\nSecond chapter.');
    const library = publicLibrary(await scanLibrary(getViewer()));
    const course = findCourse(library, library.categories[0].courses[0].id).course;
    const plan = coursePlan(library, course.id);

    await t.test('covers every reachable page exactly once', () => {
      assert.equal(plan.courseId, course.id);
      assert.equal(plan.pages.length, new Set(plan.pages).size, 'no duplicate pages');
      assert.ok(plan.pages.includes(course.url), 'includes the course overview');
      for (const volume of course.volumes) {
        if (volume.chapters?.length) for (const chapter of volume.chapters) assert.ok(plan.pages.includes(chapter.url), `missing ${chapter.url}`);
        else assert.ok(plan.pages.includes(volume.url), `missing ${volume.url}`);
      }
    });

    await t.test('omits volume URLs that redirect to a first chapter', () => {
      const split = course.volumes.find(v => v.chapters?.length);
      assert.ok(split, 'fixture has a chaptered volume');
      assert.ok(!plan.pages.includes(split.url), 'a redirecting URL must not be cached');
      assert.ok(plan.pages.includes(split.chapters[0].url));
    });

    await t.test('takes only same-origin thumbnails', () => {
      for (const url of plan.images) assert.match(url, /^\/thumb\?/);
    });

    await t.test('an unknown course has no plan', () => {
      assert.equal(coursePlan(library, 'does/not/exist'), null);
      assert.equal(findCourse(library, 'does/not/exist'), null);
    });
  } finally {
    delete process.env.CONTENT_ROOT;
    await fs.rm(root, { recursive: true, force: true });
  }
});
