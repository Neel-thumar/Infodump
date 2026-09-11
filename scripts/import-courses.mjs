import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import matter from 'gray-matter';
import { planSplit, runSplit } from './split-chapters.mjs';

const project = fileURLToPath(new URL('../', import.meta.url));
const aliases = new Map([
  ['linux/debian', ['operating-systems', 'mastering-debian-linux']],
  ['data-structure/tree', ['databases', 'trees-data-structures']],
]);
const slug = name => name.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '');
const key = name => name.normalize('NFKC').toLowerCase();
const same = (a, b) => a.equals(b);
const within = (parent, child) => {
  const relative = path.relative(parent, child);
  return !relative || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
};

async function stat(file) {
  try { return await fs.lstat(file); }
  catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}

async function safeParents(directory) {
  const parent = path.dirname(directory);
  if (parent !== directory) await safeParents(parent);
  const info = await stat(directory);
  if (info && (!info.isDirectory() || info.isSymbolicLink())) throw new Error(`Not a real directory: ${directory}`);
}

function validName(name) {
  if (!name || name.startsWith('.') || /[<>:"/\\|?*\x00-\x1f]/.test(name) || /[. ]$/.test(name)
    || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(name) || !slug(name)) {
    throw new Error(`Unsafe or empty name: ${name}`);
  }
}

async function entries(directory) {
  const info = await stat(directory);
  if (!info) return [];
  await safeParents(directory);
  return (await fs.readdir(directory, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name, 'en'));
}

async function existingName(parent, requested) {
  validName(requested);
  const matches = (await entries(parent)).filter(entry => slug(entry.name) === slug(requested));
  if (matches.length > 1) throw new Error(`Ambiguous destination name: ${path.join(parent, requested)}`);
  if (matches[0]) {
    if (!matches[0].isDirectory() || matches[0].isSymbolicLink()) throw new Error(`Not a real directory: ${path.join(parent, matches[0].name)}`);
    return matches[0].name;
  }
  return requested;
}

async function readRegular(file) {
  await safeParents(path.dirname(file));
  const info = await stat(file);
  if (!info?.isFile() || info.isSymbolicLink()) throw new Error(`Not a regular file: ${file}`);
  return fs.readFile(file);
}

function makePlan(bytes, filename) {
  const raw = bytes.toString('utf8');
  if (!same(Buffer.from(raw, 'utf8'), bytes)) throw new Error('Invalid UTF-8');
  if (!raw.trim()) throw new Error('Empty Markdown file');
  const plan = planSplit(raw, filename);
  try {
    const { data, content } = matter(raw, {});
    if (!content.trim()) throw new Error('Markdown has no body');
    for (const field of ['id', 'title', 'description', 'thumbnail']) {
      if (data[field] !== undefined && typeof data[field] !== 'string') throw new Error(`Frontmatter ${field} must be a string`);
    }
    if (data.order !== undefined && !Number.isFinite(data.order)) throw new Error('Frontmatter order must be a number');
    if (data.draft !== undefined && typeof data.draft !== 'boolean') throw new Error('Frontmatter draft must be a boolean');
    if (data.access !== undefined && (!data.access || Array.isArray(data.access) || typeof data.access !== 'object')) throw new Error('Frontmatter access must be an object');
    return { plan };
  } catch (error) { return { plan, validationError: error.message }; }
}

async function inspect(job) {
  const { directory, filename, destination, archive, bytes, plan } = job;
  await safeParents(directory);
  await safeParents(path.dirname(archive));
  const siblings = await entries(directory);
  const basename = filename.replace(/\.md$/i, '');
  const matches = siblings.filter(entry => !entry.name.startsWith('.') && slug(entry.name.replace(/\.md$/i, '')) === slug(basename));
  for (const entry of matches) {
    if (entry.name !== basename && entry.name !== filename) throw new Error(`Volume name/URL collision with ${entry.name}`);
  }
  for (const entry of siblings.filter(entry => !entry.name.startsWith('.') && !matches.includes(entry))) {
    let metadata;
    if (entry.isDirectory() && !entry.isSymbolicLink()) {
      const file = path.join(directory, entry.name, 'volume.json');
      if (await stat(file)) metadata = JSON.parse((await readRegular(file)).toString('utf8'));
    } else if (entry.isFile() && /\.md$/i.test(entry.name)) {
      metadata = makePlan(await readRegular(path.join(directory, entry.name)), entry.name).plan.metadata;
    }
    if (metadata && ((plan.metadata.id && plan.metadata.id === metadata.id) || plan.metadata.sourceSha256 === metadata.sourceSha256)) {
      throw new Error(`Duplicate id or renamed/already imported source at ${entry.name}; reconcile it manually`);
    }
  }
  const archiveMatches = (await entries(path.dirname(archive))).filter(entry => key(entry.name) === key(filename));
  if (archiveMatches.some(entry => entry.name !== filename)) throw new Error('Archive filename case collision');
  const flat = path.join(directory, filename);
  if (await stat(destination)) {
    if (await stat(flat)) throw new Error('Both a flat volume and chapter folder exist');
    await safeParents(path.join(destination, 'chapters'));
    const metadata = JSON.parse((await readRegular(path.join(destination, 'volume.json'))).toString('utf8'));
    if (!isDeepStrictEqual(metadata, JSON.parse(JSON.stringify(plan.metadata)))) throw new Error('Source or destination metadata changed; existing volume will not be overwritten');
    if (!same(await readRegular(archive), bytes)) throw new Error('Source differs from archived import');
    const children = await entries(path.join(destination, 'chapters'));
    if (!isDeepStrictEqual(children.map(entry => entry.name).sort(), plan.parts.map(part => part.filename).sort())) throw new Error('Chapter files added, missing, or renamed');
    for (const part of plan.parts) {
      if (!same(await readRegular(path.join(destination, 'chapters', part.filename)), Buffer.from(part.body))) throw new Error(`Chapter edited or corrupt: ${part.filename}`);
    }
    return 'skip';
  }
  if (await stat(archive)) throw new Error('Orphan archive exists without a chapter folder');
  if (await stat(flat)) {
    if (!same(await readRegular(flat), bytes)) throw new Error('Existing flat volume differs from source');
    return 'migrate';
  }
  return 'import';
}

async function preflight(sourceRoot, contentRoot) {
  const jobs = [], warnings = [], errors = [], targets = new Map(), identities = new Map(), courseTargets = new Map();
  await safeParents(sourceRoot);
  if (!(await stat(sourceRoot))) throw new Error(`Source directory does not exist: ${sourceRoot}`);
  await safeParents(contentRoot);
  const visible = entry => !entry.name.startsWith('.');
  const ignore = (file, reason) => warnings.push(`${file}: ${reason}`);
  for (const category of await entries(sourceRoot)) {
    if (!visible(category)) continue;
    const categoryPath = path.join(sourceRoot, category.name);
    if (!category.isDirectory() || category.isSymbolicLink()) { ignore(categoryPath, 'expected a category directory; ignored'); continue; }
    for (const course of await entries(categoryPath)) {
      if (!visible(course)) continue;
      const coursePath = path.join(categoryPath, course.name);
      if (!course.isDirectory() || course.isSymbolicLink()) { ignore(coursePath, 'expected a course directory; ignored'); continue; }
      try {
        validName(category.name); validName(course.name);
        const mapped = aliases.get(`${slug(category.name)}/${slug(course.name)}`) || [slug(category.name), slug(course.name)];
        if (['assets', 'volumes'].includes(mapped[0]) || ['assets', 'volumes'].includes(mapped[1])) throw new Error('Reserved category/course name');
        const cat = await existingName(contentRoot, mapped[0]);
        const name = await existingName(path.join(contentRoot, cat), mapped[1]);
        const directory = path.join(contentRoot, cat, name, 'volumes');
        const targetKey = key(directory);
        if (courseTargets.has(targetKey)) throw new Error(`Course mapping collision with ${courseTargets.get(targetKey)}`);
        courseTargets.set(targetKey, coursePath);
        let count = 0;
        const inputs = [];
        for (const entry of await entries(coursePath)) {
          if (!visible(entry)) continue;
          const input = path.join(coursePath, entry.name);
          if (entry.name === 'volumes' && entry.isDirectory() && !entry.isSymbolicLink()) {
            for (const child of await entries(input)) inputs.push([child, path.join(input, child.name)]);
          } else inputs.push([entry, input]);
        }
        for (const [entry, source] of inputs) {
          if (!visible(entry)) continue;
          if (!entry.isFile() || entry.isSymbolicLink() || !/\.md$/i.test(entry.name)) { ignore(source, 'only regular Markdown volumes are imported; ignored'); continue; }
          count++;
          try {
            validName(entry.name);
            const filename = entry.name.replace(/\.md$/i, '.md');
            const basename = filename.slice(0, -3);
            const collisionKey = `${targetKey}/${slug(basename)}`;
            if (targets.has(collisionKey)) throw new Error(`Volume name/URL collision with ${targets.get(collisionKey)}`);
            targets.set(collisionKey, source);
            const bytes = await readRegular(source);
            const { plan, validationError } = makePlan(bytes, filename);
            if (plan.metadata.id) {
              const idKey = `${targetKey}/${plan.metadata.id}`;
              if (identities.has(idKey)) throw new Error(`Duplicate volume id with ${identities.get(idKey)}`);
              identities.set(idKey, source);
            }
            const job = { source, directory, filename, bytes, plan, destination: path.join(directory, basename), archive: path.join(directory, '.originals', filename) };
            job.action = await inspect(job);
            if (validationError) {
              if (job.action !== 'skip') throw new Error(`Invalid frontmatter: ${validationError}`);
              ignore(source, `unchanged legacy import has invalid frontmatter: ${validationError}`);
            }
            jobs.push(job);
          } catch (error) { errors.push(`${source}: ${error.message}`); }
        }
        if (!count) ignore(coursePath, 'no Markdown volumes found');
      } catch (error) { errors.push(`${coursePath}: ${error.message}`); }
    }
  }
  return { jobs, warnings, errors };
}

async function publish(job, stage) {
  let ownsDestination = false, ownsArchive = false;
  try {
    if (!same(await readRegular(job.source), job.bytes)) throw new Error(`Source changed during import: ${job.source}`);
    if (await inspect(job) !== job.action) throw new Error(`Destination changed during import: ${job.destination}`);
    await fs.mkdir(path.dirname(job.archive), { recursive: true });
    await safeParents(job.directory);
    await safeParents(path.dirname(job.archive));
    await fs.mkdir(job.destination);
    ownsDestination = true;
    const handle = await fs.open(job.archive, 'wx');
    ownsArchive = true;
    try { await handle.writeFile(job.bytes); } finally { await handle.close(); }
    await fs.rename(path.join(stage, 'chapters'), path.join(job.destination, 'chapters'));
    await fs.rename(path.join(stage, 'volume.json'), path.join(job.destination, 'volume.json'));
    if (!isDeepStrictEqual(JSON.parse((await readRegular(path.join(job.destination, 'volume.json'))).toString('utf8')), JSON.parse(JSON.stringify(job.plan.metadata)))) throw new Error('Published metadata verification failed');
    for (const part of job.plan.parts) {
      if (!same(await readRegular(path.join(job.destination, 'chapters', part.filename)), Buffer.from(part.body))) throw new Error('Published chapter verification failed');
    }
    if (!same(await readRegular(job.archive), job.bytes)) throw new Error('Archive verification failed');
    if (!same(await readRegular(job.source), job.bytes)) throw new Error(`Source changed during import: ${job.source}`);
    if (job.action === 'migrate') {
      const flat = path.join(job.directory, job.filename);
      if (!same(await readRegular(flat), job.bytes)) throw new Error('Flat volume changed during import');
      await fs.unlink(flat);
    }
  } catch (error) {
    if (ownsDestination) await fs.rm(job.destination, { recursive: true, force: true });
    if (ownsArchive) await fs.unlink(job.archive);
    throw error;
  }
}

export async function importCourses({ sourceRoot = path.join(project, 'course'), contentRoot = path.join(project, 'content'), write = false } = {}) {
  sourceRoot = path.resolve(sourceRoot); contentRoot = path.resolve(contentRoot);
  if (within(sourceRoot, contentRoot) || within(contentRoot, sourceRoot)) throw new Error('Source and content roots must not overlap');
  await safeParents(contentRoot);
  const lock = path.join(contentRoot, '.course-import.lock');
  let locked = false;
  try {
    if (write) {
      await fs.mkdir(contentRoot, { recursive: true });
      try { await fs.mkdir(lock); locked = true; }
      catch (error) { if (error.code === 'EEXIST') throw new Error(`Import locked: ${lock}. If an earlier run was interrupted, inspect its outputs and remove this lock only after confirming no importer is running.`); throw error; }
    } else if (await stat(lock)) throw new Error(`Import locked: ${lock}`);
    const result = await preflight(sourceRoot, contentRoot);
    if (result.errors.length || !write) return { ...result, written: 0 };
    let written = 0;
    for (const job of result.jobs.filter(job => job.action !== 'skip')) {
      const temporary = await fs.mkdtemp(path.join(lock, 'volume-'));
      const volumes = path.join(temporary, 'volumes');
      await fs.mkdir(volumes);
      await fs.writeFile(path.join(volumes, job.filename), job.bytes, { flag: 'wx' });
      const [split] = await runSplit(temporary, true);
      await publish(job, split.destination);
      await fs.rm(temporary, { recursive: true, force: true });
      written++;
    }
    return { ...result, written };
  } finally {
    if (locked) await fs.rm(lock, { recursive: true, force: true });
  }
}

async function main(args) {
  const options = {};
  for (const arg of args) {
    if (arg === '--help') {
      console.log('Usage: npm run courses:plan | npm run courses:import\nOptions: --source=<directory> --content=<directory> --write\nInput: course/<category>/<course>/*.md (or <course>/volumes/*.md).\nNew categories/courses use kebab-case; existing names and legacy Debian/Tree routes are retained.\nSources are never modified. Exact completed imports are skipped. Changed or incomplete outputs block all writes; no force-overwrite or deletion propagation.\nOnly Markdown is imported; metadata files and images are not copied. Defaults are relative to the project, not the current directory.');
      return;
    }
    if (arg === '--write') options.write = true;
    else if (arg.startsWith('--source=') && arg.slice(9)) options.sourceRoot = arg.slice(9);
    else if (arg.startsWith('--content=') && arg.slice(10)) options.contentRoot = arg.slice(10);
    else throw new Error(`Unknown argument: ${arg}. Use --help.`);
  }
  const result = await importCourses(options);
  for (const warning of result.warnings) console.warn(`WARN ${warning}`);
  for (const job of result.jobs) console.log(`${job.action.toUpperCase()} ${job.source} -> ${job.destination} (${job.plan.parts.length} chapters)`);
  for (const error of result.errors) console.error(`CONFLICT ${error}`);
  console.log(`${options.write ? 'Import' : 'Dry run'}: ${result.written} written, ${result.jobs.filter(job => job.action === 'skip').length} unchanged, ${result.errors.length} conflicts.`);
  if (result.errors.length) { console.error('No volumes were written. Resolve conflicts and run again.'); process.exitCode = 1; }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main(process.argv.slice(2)).catch(error => { console.error(error.message); process.exitCode = 1; });
}