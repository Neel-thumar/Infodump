import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { toString } from 'mdast-util-to-string';
import { parseDocument } from '../src/lib/markdown.js';

const sha256 = value => createHash('sha256').update(value).digest('hex');
const defaultRoot = () => path.resolve('content');
const chapterSlug = title => [...title.normalize('NFKC').toLowerCase()
  .replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '')]
  .slice(0, 80).join('').replace(/-$/g, '') || 'chapter';

/** Pure, lossless UTF-8 plan. Bodies are raw slices, never re-serialized Markdown. */
export function planSplit(raw, filename) {
  if (typeof raw !== 'string') throw new TypeError('raw must be a UTF-8 string');
  if (typeof filename !== 'string' || !/^.+\.md$/i.test(filename)
    || path.posix.basename(filename) !== filename || path.win32.basename(filename) !== filename) {
    throw new Error('filename must be a Markdown basename');
  }
  const doc = parseDocument(raw, filename, () => {});
  // gray-matter removes the YAML prefix (and possibly a BOM). AST offsets are
  // UTF-16 offsets into doc.body, not byte offsets into the original source.
  if (!raw.endsWith(doc.body)) throw new Error(`Cannot locate parsed body in ${filename}`);
  const prefixLength = raw.length - doc.body.length;
  const headings = doc.tree.children.filter(node => node.type === 'heading');
  const h1 = headings.filter(node => node.depth === 1);
  // All later root H1s count, including exercises and retrospectives. Only
  // when there are none do we use H2s after the introductory volume-title H2.
  const boundaries = h1.length > 1 ? h1.slice(1) : headings.filter(node => node.depth === 2).slice(1);
  const starts = boundaries.map(node => prefixLength + node.position.start.offset);
  const parts = [];
  const overview = raw.slice(0, starts[0] ?? raw.length);
  if (overview.length) parts.push({ filename: '00-overview.md', title: 'Overview', body: overview });
  const width = Math.max(2, String(boundaries.length).length);
  boundaries.forEach((node, index) => {
    const title = toString(node);
    parts.push({
      filename: `${String(index + 1).padStart(width, '0')}-${chapterSlug(title)}.md`,
      title,
      body: raw.slice(starts[index], starts[index + 1] ?? raw.length),
    });
  });
  if (parts.map(part => part.body).join('') !== raw) throw new Error(`Lossy split: ${filename}`);
  const { title, bookTitle, description, id, order, draft, access, thumbnail } = doc;
  return {
    metadata: {
      title, bookTitle, description, id, order, draft, access, thumbnail,
      sourceFilename: filename, sourceSha256: sha256(raw),
      // Loader overrides, particularly for Overview and H2-only chapters.
      // Reference definitions stay in their original slices; a loader must
      // resolve shared definitions across the volume, not duplicate them here.
      chapterTitles: Object.fromEntries(parts.map(part => [part.filename, part.title])),
    },
    parts,
  };
}

async function statOrNull(file) {
  try { return await fs.lstat(file); }
  catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}

async function requireAbsent(file) {
  if (await statOrNull(file)) throw new Error(`Refusing to overwrite existing path: ${file}`);
}

async function checkArchiveDirectory(directory) {
  const stat = await statOrNull(directory);
  if (stat && (!stat.isDirectory() || stat.isSymbolicLink())) {
    throw new Error(`Archive must be a real directory: ${directory}`);
  }
}

async function discover(directory, sources = []) {
  const stat = await fs.lstat(directory);
  if (stat.isSymbolicLink()) return sources;
  if (!stat.isDirectory()) throw new Error(`Not a directory: ${directory}`);
  if (path.basename(directory).startsWith('.') || path.basename(directory).toLowerCase() === 'assets') return sources;
  const entries = (await fs.readdir(directory, { withFileTypes: true }))
    .sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0);
  for (const entry of entries) {
    if (entry.name.startsWith('.') || entry.isSymbolicLink() || entry.name.toLowerCase() === 'assets') continue;
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) await discover(file, sources);
    else if (path.basename(directory) === 'volumes' && entry.isFile() && /\.md$/i.test(entry.name)) sources.push(file);
  }
  return sources;
}

async function verify(directory, plan, original, manifest) {
  const buffers = [];
  for (const part of plan.parts) {
    const buffer = await fs.readFile(path.join(directory, 'chapters', part.filename));
    if (!buffer.equals(Buffer.from(part.body, 'utf8'))) throw new Error(`Chapter verification failed: ${part.filename}`);
    buffers.push(buffer);
  }
  const reconstructed = Buffer.concat(buffers);
  if (!reconstructed.equals(original) || sha256(reconstructed) !== plan.metadata.sourceSha256) {
    throw new Error('Source reconstruction verification failed');
  }
  if (!(await fs.readFile(path.join(directory, 'volume.json'))).equals(Buffer.from(manifest))) {
    throw new Error('Manifest verification failed');
  }
}

async function verifySource(source, original) {
  const stat = await fs.lstat(source);
  if (!stat.isFile() || stat.isSymbolicLink() || !(await fs.readFile(source)).equals(original)) {
    throw new Error(`Source changed during conversion: ${source}`);
  }
}

async function writePlan(job) {
  const { source, destination, archive, original, plan } = job;
  const archiveDirectory = path.dirname(archive);
  const stage = await fs.mkdtemp(path.join(path.dirname(source), '.split-chapters-'));
  let ownsDestination = false, ownsArchive = false, ownsArchiveDirectory = false, committed = false;
  try {
    const manifest = JSON.stringify(plan.metadata, null, 2) + '\n';
    await fs.mkdir(path.join(stage, 'chapters'));
    for (const part of plan.parts) {
      await fs.writeFile(path.join(stage, 'chapters', part.filename), part.body, { encoding: 'utf8', flag: 'wx' });
    }
    await fs.writeFile(path.join(stage, 'volume.json'), manifest, { flag: 'wx' });
    await verify(stage, plan, original, manifest);
    await verifySource(source, original);
    await requireAbsent(archive);
    await checkArchiveDirectory(archiveDirectory);
    // Reserve exclusively instead of renaming over a possibly existing folder.
    await fs.mkdir(destination);
    ownsDestination = true;
    await fs.rename(path.join(stage, 'chapters'), path.join(destination, 'chapters'));
    await fs.rename(path.join(stage, 'volume.json'), path.join(destination, 'volume.json'));
    await verify(destination, plan, original, manifest);
    try { await fs.mkdir(archiveDirectory); ownsArchiveDirectory = true; }
    catch (error) { if (error.code !== 'EEXIST') throw error; }
    await checkArchiveDirectory(archiveDirectory);
    // An exclusive copy followed by unlink is a no-clobber move on Windows
    // and POSIX. Never remove the source until both outputs verify bytewise.
    const handle = await fs.open(archive, 'wx');
    ownsArchive = true;
    try { await handle.writeFile(original); }
    finally { await handle.close(); }
    if (!(await fs.readFile(archive)).equals(original)) throw new Error(`Archive verification failed: ${archive}`);
    await verifySource(source, original);
    await fs.unlink(source);
    committed = true;
  } finally {
    try {
      if (!committed) {
        if (ownsArchive) await fs.unlink(archive);
        if (ownsDestination) await fs.rm(destination, { recursive: true, force: true });
        if (ownsArchiveDirectory) await fs.rmdir(archiveDirectory);
      }
    } finally { await fs.rm(stage, { recursive: true, force: true }); }
  }
}

/** Discover/preflight all sources, then optionally commit each volume independently.
 * Returns plans and paths; dry runs create no directories or files. Stop editors
 * writing these sources before --write. Interrupted runs fail closed on outputs.
 */
export async function runSplit(root = defaultRoot(), write = false) {
  const jobs = [], destinations = new Set();
  for (const source of await discover(path.resolve(root))) {
    const filename = path.basename(source);
    const original = await fs.readFile(source);
    const raw = original.toString('utf8');
    if (!Buffer.from(raw, 'utf8').equals(original)) throw new Error(`Invalid UTF-8: ${source}`);
    const destination = path.join(path.dirname(source), filename.replace(/\.md$/i, ''));
    const archive = path.join(path.dirname(source), '.originals', filename);
    const key = destination.toLowerCase();
    if (destinations.has(key)) throw new Error(`Conflicting destinations: ${destination}`);
    destinations.add(key);
    await requireAbsent(destination);
    await checkArchiveDirectory(path.dirname(archive));
    await requireAbsent(archive);
    jobs.push({ source, destination, archive, original, plan: planSplit(raw, filename) });
  }
  if (write) for (const job of jobs) await writePlan(job);
  return jobs.map(({ original, plan, ...paths }) => ({ ...paths, ...plan, written: Boolean(write) }));
}

async function main(args) {
  let root = defaultRoot(), write = false;
  for (const arg of args) {
    if (arg === '--write') write = true;
    else if (arg.startsWith('--root=') && arg.slice(7)) root = path.resolve(arg.slice(7));
    else throw new Error(`Unknown argument: ${arg}. Usage: node scripts/split-chapters.mjs [--write] [--root=<path>]`);
  }
  const results = await runSplit(root, write);
  for (const result of results) {
    console.log(`${write ? 'Wrote' : 'Would write'} ${result.parts.length} chapters: ${result.source} -> ${result.destination}`);
  }
  console.log(`${write ? 'Written' : 'Dry run'}: ${results.length} volume(s).`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main(process.argv.slice(2)).catch(error => { console.error(error.message); process.exitCode = 1; });
}