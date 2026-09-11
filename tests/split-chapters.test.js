import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { planSplit, runSplit } from '../scripts/split-chapters.mjs';

const execute = promisify(execFile);
const script = fileURLToPath(new URL('../scripts/split-chapters.mjs', import.meta.url));
const sample = '# Book\n\n## Volume 1\n\nIntro\n\n# Chapter 1\n\nBody\n\n# Exercises\n\nTry it\n\n# Retrospective\n\nEnd';

async function fixture(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'infodump-split-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const put = async (name, body = sample) => {
    const file = path.join(root, name);
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, body);
    return file;
  };
  return { root, put };
}

function assertLossless(plan, raw) {
  assert.deepEqual(Buffer.concat(plan.parts.map(part => Buffer.from(part.body))), Buffer.from(raw));
  assert.equal(plan.metadata.sourceSha256, createHash('sha256').update(raw).digest('hex'));
  assert.deepEqual(plan.metadata.chapterTitles, Object.fromEntries(plan.parts.map(p => [p.filename, p.title])));
}

test('H1 chapters, exercises and retrospective are separate; YAML, CRLF, Unicode, code and math stay byte-exact', () => {
  const yaml = '---\ntitle: Custom\ndescription: Details\nid: stable\norder: 0\ndraft: true\naccess: { tier: paid }\nthumbnail: /cover.png\n---\n';
  const body = '# Book 🐧\n\n## Volume 0\n\nIntro café\n\n'
    + '# Chapter **One**\n\n`$$` `/proc/$$/fd/9`\n\n'
    + '```bash\n# Not a chapter\ncat /proc/$$/environ\n```\n\n'
    + '> # Quoted heading\n> ```bash\n> # Nested code heading\n> cat /proc/$$/status\n> ```\n\n'
    + '- item\n\n  # Nested list heading\n\n'
    + '$$\n\\frac{n}{2} = x\n# math, not a chapter\n$$\n\n'
    + '## Section, not a chapter\n\n[Shared][ref]\n\n'
    + '# Exercises\n\nTry it\n\n# Retrospective\n\n尾声\n\n[ref]: https://example.com\n';
  const raw = (yaml + body).replaceAll('\n', '\r\n');
  const plan = planSplit(raw, 'volume-0-prologue.md');
  assert.deepEqual(plan.parts.map(p => p.filename), ['00-overview.md', '01-chapter-one.md', '02-exercises.md', '03-retrospective.md']);
  assert.deepEqual(plan.parts.map(p => p.title), ['Overview', 'Chapter One', 'Exercises', 'Retrospective']);
  assert.ok(plan.parts[0].body.startsWith(yaml.replaceAll('\n', '\r\n')));
  assert.equal(plan.parts[1].body.startsWith('# Chapter **One**\r\n'), true);
  assert.ok(plan.parts[1].body.includes('# Not a chapter'));
  assert.ok(plan.parts[3].body.endsWith('[ref]: https://example.com\r\n'));
  assert.equal(plan.parts.filter(p => p.body.includes('[ref]:')).length, 1);
  assert.deepEqual({ ...plan.metadata, sourceSha256: undefined, chapterTitles: undefined }, {
    title: 'Custom', bookTitle: 'Book 🐧', description: 'Details', id: 'stable', order: 0, draft: true,
    access: { tier: 'paid' }, thumbnail: '/cover.png', sourceFilename: 'volume-0-prologue.md',
    sourceSha256: undefined, chapterTitles: undefined,
  });
  assertLossless(plan, raw);
});

test('H2 prologue fallback keeps introductory volume title in Overview, including without a book H1', () => {
  for (const prefix of ['# Book\n\n', '']) {
    const raw = prefix + '## Volume 0 — Prologue\n\nIntroduction\n\n## The name\n\nText\n\n### Detail\n\nMore\n\n## The argument\n\nEnd';
    const plan = planSplit(raw, 'volume-0-prologue.md');
    assert.deepEqual(plan.parts.map(p => p.filename), ['00-overview.md', '01-the-name.md', '02-the-argument.md']);
    assert.ok(plan.parts[0].body.includes('Introduction'));
    assert.ok(plan.parts[1].body.includes('### Detail'));
    assertLossless(plan, raw);
  }
});

test('heading-free, empty, whitespace-only, BOM and malformed YAML inputs reconstruct unchanged', () => {
  for (const raw of ['', ' \r\n\t', 'plain café 🐧', '---\ntitle: Only YAML\n---\n',
    '\uFEFF---\r\ntitle: BOM\r\n---\r\n# Book\r\n\r\n# Chapter\r\nText',
    '---\naccess: [bad\n---\n# Book\n\n# Chapter\nText']) {
    const plan = planSplit(raw, 'volume-2-misc.md');
    assert.equal(plan.parts.length, !raw ? 0 : raw.includes('# Chapter') ? 2 : 1);
    if (raw) assert.equal(plan.parts[0].title, 'Overview');
    assertLossless(plan, raw);
  }
});

test('setext headings use AST offsets; duplicate and unsafe titles get safe chronological filenames', () => {
  const raw = 'Book\n====\n\nIntro\n\nCON: /?*<>|\\\n====\n\nOne\n\n# Repeat!\nTwo\n\n# Repeat@\nThree\n\n# !!!\nEnd';
  const plan = planSplit(raw, 'volume-1-safe.md');
  assert.deepEqual(plan.parts.map(p => p.filename), ['00-overview.md', '01-con.md', '02-repeat.md', '03-repeat.md', '04-chapter.md']);
  assert.equal(plan.parts[1].body.startsWith('CON: /?*<>|\\\n===='), true);
  assertLossless(plan, raw);
  const many = planSplit('# Book\n' + Array.from({ length: 105 }, (_, i) => `\n# ${i}\ntext\n`).join(''), 'many.md');
  assert.deepEqual(many.parts.map(p => p.filename).sort(), many.parts.map(p => p.filename));
  assert.ok(many.parts[1].filename.startsWith('001-'));
  assert.throws(() => planSplit('text', '../bad.md'), /basename/);
  assert.throws(() => planSplit('text', '..\\bad.md'), /basename/);
});

test('dry-run discovers only direct Markdown in recursive volumes directories and writes nothing', async t => {
  const { root, put } = await fixture(t);
  const source = await put('content/category/course/volumes/volume-1-one.md');
  await put('content/direct/volumes/volume-2-two.MD');
  await put('content/category/course/volumes/assets/volumes/skip.md');
  await put('content/.hidden/volumes/skip.md');
  await put('content/assets/volumes/skip.md');
  await put('content/category/course/volumes/.hidden.md');
  await put('content/category/course/volumes/nested/not-direct.md');
  await put('content/category/course/not-volume.md');
  await put('content/category/course/volumes/notes.txt');
  const before = await fs.readdir(root, { recursive: true });
  const results = await runSplit(path.join(root, 'content'));
  assert.equal(results.length, 2);
  assert.ok(results.every(result => !result.written));
  assert.ok(results.some(result => result.source === source));
  assert.deepEqual(await fs.readdir(root, { recursive: true }), before);
  assert.equal(await fs.readFile(source, 'utf8'), sample);
});

test('write verifies physical chapters and manifest, archives exact bytes, preserves course and is idempotent', async t => {
  const { root, put } = await fixture(t);
  const raw = '\uFEFF---\r\ntitle: Kept\r\n---\r\n' + sample.replaceAll('\n', '\r\n');
  const source = await put('content/category/course/volumes/volume-1-one.md', raw);
  const course = await put('course/original.md', raw);
  const [result] = await runSplit(path.join(root, 'content'), true);
  assert.equal(result.written, true);
  await assert.rejects(fs.lstat(source), { code: 'ENOENT' });
  assert.deepEqual(await fs.readFile(result.archive), Buffer.from(raw));
  assert.deepEqual(await fs.readFile(course), Buffer.from(raw));
  assert.deepEqual(JSON.parse(await fs.readFile(path.join(result.destination, 'volume.json'), 'utf8')), result.metadata);
  const chapters = await fs.readdir(path.join(result.destination, 'chapters'));
  assert.deepEqual(chapters.sort(), result.parts.map(p => p.filename).sort());
  const buffers = await Promise.all(result.parts.map(p => fs.readFile(path.join(result.destination, 'chapters', p.filename))));
  assert.deepEqual(Buffer.concat(buffers), Buffer.from(raw));
  assert.deepEqual((await fs.readdir(path.dirname(source))).sort(), ['.originals', 'volume-1-one']);
  const before = await fs.readdir(root, { recursive: true });
  assert.deepEqual(await runSplit(path.join(root, 'content'), true), []);
  assert.deepEqual(await fs.readdir(root, { recursive: true }), before);
});

test('preflight refuses destination files/folders and archives, without modifying any source', async t => {
  for (const conflict of ['destination-directory', 'destination-file', 'archive', 'archive-parent']) {
    await t.test(conflict, async t => {
      const { root, put } = await fixture(t);
      const first = await put('volumes/volume-1-first.md');
      const second = await put('volumes/volume-2-second.md');
      if (conflict === 'destination-directory') await fs.mkdir(path.join(root, 'volumes/volume-2-second'));
      if (conflict === 'destination-file') await put('volumes/volume-2-second', 'sentinel');
      if (conflict === 'archive') await put('volumes/.originals/volume-2-second.md', 'sentinel');
      if (conflict === 'archive-parent') await put('volumes/.originals', 'sentinel');
      const before = await fs.readdir(root, { recursive: true });
      for (const write of [false, true]) await assert.rejects(runSplit(root, write), /existing path|real directory/);
      assert.deepEqual(await fs.readdir(root, { recursive: true }), before);
      assert.equal(await fs.readFile(first, 'utf8'), sample);
      assert.equal(await fs.readFile(second, 'utf8'), sample);
      if (conflict === 'archive') assert.equal(await fs.readFile(path.join(root, 'volumes/.originals/volume-2-second.md'), 'utf8'), 'sentinel');
    });
  }
});

test('invalid UTF-8 fails before any writes', async t => {
  const { root, put } = await fixture(t);
  const source = await put('volumes/bad.md', Buffer.from([0xff, 0xfe, 0x23]));
  await assert.rejects(runSplit(root, true), /Invalid UTF-8/);
  assert.deepEqual(await fs.readFile(source), Buffer.from([0xff, 0xfe, 0x23]));
  assert.deepEqual(await fs.readdir(path.dirname(source)), ['bad.md']);
});

test('verification, publishing and archive failures roll back only owned outputs and retain the source', async t => {
  for (const failure of ['verification', 'publish', 'archive']) {
    await t.test(failure, async t => {
      const { root, put } = await fixture(t);
      const source = await put('volumes/volume-1.md');
      const readFile = fs.readFile.bind(fs), rename = fs.rename.bind(fs), open = fs.open.bind(fs);
      if (failure === 'verification') t.mock.method(fs, 'readFile', async (file, ...args) => {
        if (String(file).includes('.split-chapters-') && String(file).endsWith('00-overview.md')) return Buffer.from('corrupt');
        return readFile(file, ...args);
      });
      if (failure === 'publish') t.mock.method(fs, 'rename', async (from, to) => {
        if (String(from).endsWith('volume.json')) throw new Error('Simulated publish failure');
        return rename(from, to);
      });
      if (failure === 'archive') t.mock.method(fs, 'open', async (file, ...args) => {
        if (String(file).includes('.originals')) throw new Error('Simulated archive failure');
        return open(file, ...args);
      });
      await assert.rejects(runSplit(root, true), /verification failed|Simulated/);
      assert.equal(await readFile(source, 'utf8'), sample);
      assert.deepEqual(await fs.readdir(path.dirname(source)), ['volume-1.md']);
    });
  }
});

test('Markdown file symlinks are skipped', async t => {
  const { root, put } = await fixture(t);
  const target = await put('outside/source.md');
  await fs.mkdir(path.join(root, 'content/volumes'), { recursive: true });
  try { await fs.symlink(target, path.join(root, 'content/volumes/linked.md'), 'file'); }
  catch (error) {
    if (['EPERM', 'EACCES', 'ENOSYS'].includes(error.code)) { t.skip('File symlinks unavailable'); return; }
    throw error;
  }
  assert.deepEqual(await runSplit(path.join(root, 'content'), true), []);
  assert.equal(await fs.readFile(target, 'utf8'), sample);
});

test('directory symlinks are skipped, including a symlink root; symlink archives fail closed', async t => {
  const { root, put } = await fixture(t);
  await put('outside/volumes/untouched.md');
  await put('content/course/volumes/volume-1.md');
  const target = path.join(root, 'outside');
  const link = path.join(root, 'content/linked');
  try { await fs.symlink(target, link, process.platform === 'win32' ? 'junction' : 'dir'); }
  catch (error) {
    if (['EPERM', 'EACCES', 'ENOSYS'].includes(error.code)) { t.skip('Directory symlinks unavailable'); return; }
    throw error;
  }
  assert.equal((await runSplit(path.join(root, 'content'))).length, 1);
  assert.deepEqual(await runSplit(link, true), []);
  await fs.symlink(target, path.join(root, 'content/course/volumes/.originals'), process.platform === 'win32' ? 'junction' : 'dir');
  await assert.rejects(runSplit(path.join(root, 'content'), true), /real directory/);
  assert.equal(await fs.readFile(path.join(target, 'volumes/untouched.md'), 'utf8'), sample);
});

test('CLI defaults to content dry-run, supports --root and --write, and rejects unknown flags', async t => {
  const { root, put } = await fixture(t);
  const source = await put('content/course/volumes/volume-1.md');
  const { stdout } = await execute(process.execPath, [script], { cwd: root });
  assert.match(stdout, /Dry run: 1 volume/);
  assert.equal(await fs.readFile(source, 'utf8'), sample);
  const custom = await execute(process.execPath, [script, `--root=${path.join(root, 'content')}`], { cwd: root });
  assert.match(custom.stdout, /Would write 4 chapters/);
  await assert.rejects(execute(process.execPath, [script, '--unknown'], { cwd: root }), /Unknown argument/);
  const written = await execute(process.execPath, [script, '--write'], { cwd: root });
  assert.match(written.stdout, /Written: 1 volume/);
  assert.deepEqual(await fs.readFile(path.join(path.dirname(source), '.originals/volume-1.md')), Buffer.from(sample));
});