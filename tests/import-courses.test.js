import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { importCourses } from '../scripts/import-courses.mjs';
import { runSplit } from '../scripts/split-chapters.mjs';

const execute = promisify(execFile);
const cli = fileURLToPath(new URL('../scripts/import-courses.mjs', import.meta.url));
const sample = '---\nid: stable\ntitle: "Volume 0: Foundations"\norder: 0\n---\n# Book\n\n## Volume 0\n\nIntro café\n\n## First\n\n```bash\n# not a chapter\necho /proc/$$\n```\n\n## Second\n\nBody\n';

async function fixture(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'infodump-import-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const sourceRoot = path.join(root, 'course'), contentRoot = path.join(root, 'content');
  await fs.mkdir(sourceRoot);
  const put = async (name, value = sample) => {
    const file = path.join(root, name);
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, value);
    return file;
  };
  return { root, sourceRoot, contentRoot, put, run: (write = false) => importCourses({ sourceRoot, contentRoot, write }) };
}

async function snapshot(root) {
  const result = {};
  async function visit(directory) {
    for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
      const file = path.join(directory, entry.name);
      if (entry.isDirectory()) await visit(file);
      else result[path.relative(root, file)] = (await fs.readFile(file)).toString('base64');
    }
  }
  await visit(root);
  return result;
}

test('dry run writes nothing; import preserves sources and bytes, generates chapters, and reruns skip', async t => {
  const { root, put, run, contentRoot } = await fixture(t);
  const raw = '\uFEFF' + sample.replaceAll('\n', '\r\n');
  const source = await put('course/Cloud Tools/Example Course/volume-0-intro.MD', raw);
  const before = await snapshot(root);
  const preview = await run();
  assert.equal(preview.jobs[0].action, 'import');
  assert.equal(preview.jobs[0].plan.parts.length, 3);
  assert.equal(preview.written, 0);
  assert.deepEqual(await snapshot(root), before);
  const result = await run(true);
  assert.deepEqual(result.errors, []);
  assert.equal(result.written, 1);
  const directory = path.join(contentRoot, 'cloud-tools/example-course/volumes');
  const archive = path.join(directory, '.originals/volume-0-intro.md');
  assert.equal(await fs.readFile(source, 'utf8'), raw);
  assert.equal(await fs.readFile(archive, 'utf8'), raw);
  const job = result.jobs[0];
  assert.equal(Buffer.concat(await Promise.all(job.plan.parts.map(part => fs.readFile(path.join(job.destination, 'chapters', part.filename))))).toString('utf8'), raw);
  const after = await snapshot(root);
  const repeat = await run(true);
  assert.equal(repeat.written, 0);
  assert.equal(repeat.jobs[0].action, 'skip');
  assert.deepEqual(await snapshot(root), after);
});

test('legacy aliases and existing case are retained; optional volumes subfolder works', async t => {
  const { put, run, contentRoot } = await fixture(t);
  await put('course/Linux/Debian/volume-0.md');
  await put('course/Data Structure/Tree/volume-0.md');
  await put('course/DevOps/Docker/volumes/volume-0.md');
  await fs.mkdir(path.join(contentRoot, 'DevOps/Docker'), { recursive: true });
  const result = await run(true);
  assert.deepEqual(result.errors, []);
  assert.equal(result.written, 3);
  const targets = result.jobs.map(job => path.relative(contentRoot, job.destination).replaceAll('\\', '/'));
  assert.ok(targets.includes('operating-systems/mastering-debian-linux/volumes/volume-0'));
  assert.ok(targets.includes('databases/trees-data-structures/volumes/volume-0'));
  assert.ok(targets.includes('DevOps/Docker/volumes/volume-0'));
});

test('incremental new volumes import while unchanged volumes and deleted sources leave content alone', async t => {
  const { root, put, run } = await fixture(t);
  const first = await put('course/Cloud/Example/volume-0.md');
  assert.equal((await run(true)).written, 1);
  await put('course/Cloud/Example/volume-1.md', sample.replace('id: stable', 'id: second'));
  const result = await run(true);
  assert.equal(result.written, 1);
  assert.deepEqual(result.jobs.map(job => job.action), ['skip', 'import']);
  await fs.unlink(first);
  const before = await snapshot(root);
  assert.equal((await run(true)).written, 0);
  assert.deepEqual(await snapshot(root), before);
});

test('changed sources and edited, missing or extra chapters block the entire batch before writes', async t => {
  for (const kind of ['source', 'chapter', 'missing', 'extra', 'metadata', 'archive']) {
    await t.test(kind, async t => {
      const { root, put, run } = await fixture(t);
      const source = await put('course/Cloud/Example/volume-0.md');
      const { jobs: [job] } = await run(true);
      const chapter = path.join(job.destination, 'chapters/01-first.md');
      if (kind === 'source') await fs.appendFile(source, '\nNew source text');
      if (kind === 'chapter') await fs.appendFile(chapter, '\nManual edit');
      if (kind === 'missing') await fs.unlink(chapter);
      if (kind === 'extra') await fs.writeFile(path.join(job.destination, 'chapters/99-extra.md'), 'extra');
      if (kind === 'metadata') await fs.writeFile(path.join(job.destination, 'volume.json'), '{}');
      if (kind === 'archive') await fs.writeFile(job.archive, 'corrupt');
      await put('course/Other/New/volume-0.md');
      const before = await snapshot(root);
      const result = await run(true);
      assert.equal(result.errors.length, 1);
      assert.equal(result.written, 0);
      assert.deepEqual(await snapshot(root), before);
    });
  }
});

test('flat matching destination migrates; mismatching flat and orphan archive are protected', async t => {
  for (const mode of ['match', 'different', 'orphan']) {
    await t.test(mode, async t => {
      const { put, run } = await fixture(t);
      const source = await put('course/Cloud/Example/volume-0.md');
      const target = await put(`content/cloud/example/volumes/${mode === 'orphan' ? '.originals/' : ''}volume-0.md`, mode === 'different' ? 'different' : sample);
      const result = await run(true);
      assert.equal(result.written, mode === 'match' ? 1 : 0);
      assert.equal(result.errors.length, mode === 'match' ? 0 : 1);
      assert.equal(await fs.readFile(source, 'utf8'), sample);
      if (mode === 'match') await assert.rejects(fs.stat(target), { code: 'ENOENT' });
      else assert.equal(await fs.readFile(target, 'utf8'), mode === 'different' ? 'different' : sample);
    });
  }
});

test('existing splitter outputs are adopted by verification, including malformed legacy YAML', async t => {
  for (const raw of [sample, sample.replace('title: "Volume 0: Foundations"', 'title: Volume 0: Foundations')]) {
    const { put, run, contentRoot } = await fixture(t);
    await put('course/Cloud/Example/volume-0.md', raw);
    await put('content/cloud/example/volumes/volume-0.md', raw);
    await runSplit(contentRoot, true);
    const result = await run(true);
    assert.deepEqual(result.errors, []);
    assert.equal(result.jobs[0].action, 'skip');
    assert.equal(result.written, 0);
    if (raw !== sample) assert.match(result.warnings[0], /invalid frontmatter/);
  }
});

test('invalid UTF-8, empty bodies, malformed YAML and wrong field types fail safely', async t => {
  for (const value of [Buffer.from([0xff]), '', '   ', '---\ntitle: hi\n---\n', '---\ntitle: Bad: YAML\n---\n# Text',
    '---\norder: "two"\n---\n# Text', '---\ndraft: "false"\n---\n# Text', '---\naccess: []\n---\n# Text', '---\nid: 25\n---\n# Text']) {
    const { root, put, run } = await fixture(t);
    await put('course/Cloud/Example/volume-0.md', value);
    const before = await snapshot(root);
    const result = await run(true);
    assert.equal(result.errors.length, 1);
    assert.equal(result.written, 0);
    assert.deepEqual(await snapshot(root), before);
  }
});

test('case/URL collisions, duplicate ids and mixed-layout duplicates are rejected', async t => {
  for (const files of [
    ['Cloud/Example/a!.md', 'Cloud/Example/a@.md'],
    ['Cloud/Example/one.md', 'Cloud/Example/two.md'],
    ['Cloud/Example/one.md', 'Cloud/Example/volumes/one.md'],
    ['Cloud/Example!/one.md', 'Cloud/Example@/one.md'],
  ]) {
    const { put, run } = await fixture(t);
    for (const file of files) await put(`course/${file}`);
    const result = await run(true);
    assert.ok(result.errors.length);
    assert.equal(result.written, 0);
  }
});

test('renamed sources cannot silently duplicate an already published volume', async t => {
  const { put, run } = await fixture(t);
  const source = await put('course/Cloud/Example/one.md');
  const { jobs: [job] } = await run(true);
  await fs.rename(source, path.join(path.dirname(source), 'renamed.md'));
  const result = await run(true);
  assert.match(result.errors[0], /Duplicate id or renamed/);
  assert.equal(result.written, 0);
  assert.ok(await fs.stat(job.destination));
});

test('hidden sources are ignored, unsupported nesting/assets reported, and reserved names rejected', async t => {
  const { put, run } = await fixture(t);
  await put('course/.hidden/Example/one.md');
  await put('course/Cloud/.hidden/one.md');
  await put('course/Cloud/Example/.hidden.md');
  await put('course/Cloud/Example/notes.txt', 'notes');
  await put('course/Cloud/Example/nested/one.md');
  const result = await run();
  assert.equal(result.jobs.length, 0);
  assert.ok(result.warnings.length >= 2);
  await put('course/assets/Example/one.md');
  assert.match((await run(true)).errors[0], /Reserved/);
});

test('locks block concurrent runs and are not deleted by another invocation', async t => {
  const { put, run, contentRoot } = await fixture(t);
  await put('course/Cloud/Example/one.md');
  const lock = path.join(contentRoot, '.course-import.lock');
  await fs.mkdir(lock, { recursive: true });
  for (const write of [false, true]) await assert.rejects(run(write), /Import locked/);
  assert.ok(await fs.stat(lock));
});

test('publishing failure rolls back owned output and leaves source intact; retry succeeds', async t => {
  const { put, run, contentRoot } = await fixture(t);
  const source = await put('course/Cloud/Example/one.md');
  const rename = fs.rename.bind(fs);
  t.mock.method(fs, 'rename', async (from, to) => {
    if (String(to) === path.join(contentRoot, 'cloud/example/volumes/one/volume.json')) throw new Error('Injected publish failure');
    return rename(from, to);
  });
  await assert.rejects(run(true), /Injected publish failure/);
  assert.equal(await fs.readFile(source, 'utf8'), sample);
  await assert.rejects(fs.stat(path.join(contentRoot, 'cloud/example/volumes/one')), { code: 'ENOENT' });
  await assert.rejects(fs.stat(path.join(contentRoot, 'cloud/example/volumes/.originals/one.md')), { code: 'ENOENT' });
  await assert.rejects(fs.stat(path.join(contentRoot, '.course-import.lock')), { code: 'ENOENT' });
  t.mock.restoreAll();
  assert.equal((await run(true)).written, 1);
});

test('overlapping roots and missing source are rejected', async t => {
  const { sourceRoot, contentRoot } = await fixture(t);
  for (const target of [sourceRoot, path.join(sourceRoot, 'nested'), path.dirname(sourceRoot)]) {
    await assert.rejects(importCourses({ sourceRoot, contentRoot: target }), /overlap/);
  }
  await assert.rejects(importCourses({ sourceRoot: path.join(sourceRoot, 'missing'), contentRoot }), /does not exist/);
});

test('source junctions are skipped; destination and root junctions are rejected', async t => {
  const { root, sourceRoot, contentRoot, put, run } = await fixture(t);
  await put('course/Cloud/Example/one.md');
  await put('outside/untouched.md');
  const outside = path.join(root, 'outside');
  try { await fs.symlink(outside, path.join(sourceRoot, 'Linked'), process.platform === 'win32' ? 'junction' : 'dir'); }
  catch (error) { if (['EPERM', 'EACCES', 'ENOSYS'].includes(error.code)) { t.skip('Symlinks unavailable'); return; } throw error; }
  const result = await run();
  assert.equal(result.jobs.length, 1);
  assert.ok(result.warnings.some(warning => warning.includes('Linked')));
  await fs.mkdir(contentRoot);
  await fs.symlink(outside, path.join(contentRoot, 'cloud'), process.platform === 'win32' ? 'junction' : 'dir');
  assert.ok((await run(true)).errors.length);
  await assert.rejects(importCourses({ sourceRoot: path.join(sourceRoot, 'Linked'), contentRoot }), /real directory/);
  assert.deepEqual(await fs.readdir(outside), ['untouched.md']);
});

test('CLI exposes help, dry-run/write flags, and conflict exit codes', async t => {
  const { root, sourceRoot, contentRoot, put } = await fixture(t);
  await put('course/Cloud/Example/one.md');
  const args = [cli, `--source=${sourceRoot}`, `--content=${contentRoot}`];
  assert.match((await execute(process.execPath, [cli, '--help'], { cwd: root })).stdout, /Sources are never modified/);
  assert.match((await execute(process.execPath, args, { cwd: root })).stdout, /Dry run: 0 written/);
  assert.match((await execute(process.execPath, [...args, '--write'], { cwd: root })).stdout, /Import: 1 written/);
  assert.match((await execute(process.execPath, [...args, '--write'], { cwd: root })).stdout, /1 unchanged/);
  await put('course/Cloud/Example/one.md', sample + '\nEdited');
  await assert.rejects(execute(process.execPath, [...args, '--write'], { cwd: root }), /No volumes were written/);
  await assert.rejects(execute(process.execPath, [cli, '--unknown'], { cwd: root }), /Unknown argument/);
});