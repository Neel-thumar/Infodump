// The only content gateway. Filesystem discovery and raw Markdown never enter client modules.
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import GithubSlugger from 'github-slugger';
import { visit } from 'unist-util-visit';
import { toString } from 'mdast-util-to-string';
import { can } from './access/policy.js';
import { parseDocument, displayName, accessMetadata, renderDocument, visibleTree, searchableText } from './markdown.js';
import { resolveThumbnail, imageResponse } from './thumbnails.js';

const documents = new Map();
const MAX_DOCUMENTS = 256;
const MAX_SOURCE_BYTES = 16 * 1024 * 1024;
export const contentRoot = () => path.resolve(/* turbopackIgnore: true */ process.env.CONTENT_ROOT || path.join(process.cwd(), 'content'));
const hash = text => crypto.createHash('sha256').update(text).digest('hex').slice(0, 8);
export const slug = name => name.replace(/\.md$/i, '').normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '') || `item-${hash(name)}`;
function slugs(names) {
  const counts = new Map();
  for (const name of names) counts.set(slug(name), (counts.get(slug(name)) || 0) + 1);
  return new Map(names.map(name => [name, counts.get(slug(name)) > 1 ? `${slug(name)}-${hash(name)}` : slug(name)]));
}
export const compareOrder = (a, b) => (a.order ?? Infinity) - (b.order ?? Infinity) || a.title.localeCompare(b.title, 'en', { numeric: true }) || a.key.localeCompare(b.key);
const route = (...segments) => '/c/' + segments.map(encodeURIComponent).join('/');
const metadataOrder = (meta, name) => Number.isFinite(meta.order) ? meta.order : /^\d+[-_]/.test(name) ? Number(name.match(/^\d+/)[0]) : null;
const description = (meta, fallback = '') => typeof meta.description === 'string' ? meta.description : fallback;
const text = value => typeof value === 'string' && value.trim() ? value : null;

async function entries(directory, warn) {
  try { return (await fs.readdir(directory, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name)); }
  catch (error) { if (error.code !== 'ENOENT') warn(`Cannot read ${directory}: ${error.code}`); return []; }
}
async function json(file, warn) {
  try {
    const real = await fs.realpath(file);
    const rel = path.relative(await fs.realpath(/* turbopackIgnore: true */ contentRoot()), real);
    if (rel.startsWith('..') || path.isAbsolute(rel)) throw new Error('Metadata symlink escapes content root');
    const value = JSON.parse(await fs.readFile(real, 'utf8'));
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Expected an object');
    return value;
  } catch (error) { if (error.code !== 'ENOENT') warn(`Invalid metadata ${file}: ${error.message}`); return {}; }
}
async function documentAt(file, warn) {
  const real = await fs.realpath(file);
  const root = await fs.realpath(/* turbopackIgnore: true */ contentRoot());
  const rel = path.relative(root, real);
  if (rel.startsWith('..') || path.isAbsolute(rel)) throw new Error('Markdown path escapes content root');
  const stat = await fs.stat(real);
  const stamp = `${stat.mtimeMs}:${stat.ctimeMs}:${stat.size}`;
  const cached = documents.get(real);
  if (cached?.stamp === stamp) {
    documents.delete(real); documents.set(real, cached);
    cached.warnings.forEach(warn);
    return cached.document;
  }
  const warnings = [];
  const document = parseDocument(await fs.readFile(real, 'utf8'), path.basename(real), message => { warnings.push(message); warn(message); });
  documents.set(real, { stamp, document, bytes: stat.size, warnings });
  let bytes = [...documents.values()].reduce((sum, d) => sum + d.bytes, 0);
  while (documents.size > MAX_DOCUMENTS || bytes > MAX_SOURCE_BYTES) {
    const key = documents.keys().next().value; bytes -= documents.get(key).bytes; documents.delete(key);
  }
  return document;
}
function context(node) { return { ...node.position, ancestors: node.ancestors || [] }; }
export async function decisionFor(viewer, action, node) { return can(viewer, action, node.resource, context(node)); }
const permitted = decision => decision.effect !== 'deny';

export async function scanLibrary(viewer) {
  const root = contentRoot(), warnings = [];
  const warn = message => { if (!warnings.includes(message)) { warnings.push(message); console.warn(`[content] ${message}`); } };
  const config = await json(path.join(root, 'thumbnails.config.json'), warn);
  const top = (await entries(root, warn)).filter(d => d.isDirectory() && !d.name.startsWith('.'));
  const categories = [], direct = [];
  const categorySlugs = slugs(top.map(d => d.name));
  for (const dir of top) {
    const directory = path.join(/* turbopackIgnore: true */ root, dir.name), children = await entries(directory, warn);
    if (children.some(d => d.isDirectory() && d.name === 'volumes')) { direct.push({ name: dir.name, directory }); continue; }
    // Shared image assets are not a category.
    if (dir.name === 'assets') continue;
    const meta = await json(path.join(directory, 'category.json'), warn);
    let categorySlug = categorySlugs.get(dir.name);
    if (categorySlug === 'uncategorized') categorySlug += `-${hash(dir.name)}`;
    categories.push({ name: dir.name, directory, meta, slug: categorySlug, candidates: children.filter(d => d.isDirectory()).map(d => ({ name: d.name, directory: path.join(/* turbopackIgnore: true */ directory, d.name) })) });
  }
  if (direct.length) categories.push({ name: 'Uncategorized', meta: {}, slug: 'uncategorized', candidates: direct, synthetic: true });
  // Generic catalog positions are policy context, not access rules or content IDs.
  for (const category of categories) {
    const courseCandidates = [];
    for (const candidate of category.candidates) {
      if ((await entries(candidate.directory, warn)).some(d => d.isDirectory() && d.name === 'volumes')) courseCandidates.push(candidate);
      else warn(`Skipping non-course folder ${candidate.directory}: no volumes/ directory.`);
    }
    category.candidates = courseCandidates;
  }
  const categoryCount = categories.filter(category => category.candidates.length).length;
  let nonemptyIndex = 0;
  const output = [], ids = new Set();
  const uniqueId = (id, fallback) => { if (ids.has(id)) { warn(`Duplicate resource ID ${id}; using path identity.`); id = fallback + ':' + hash(fallback); } ids.add(id); return id; };
  for (const category of categories) {
    const courseCandidates = category.candidates;
    const groupIndex = courseCandidates.length ? nonemptyIndex++ : -1;
    const catId = uniqueId(text(category.meta.id) || category.slug, category.slug);
    const cat = {
      resource: { type: 'category', id: catId, access: accessMetadata(category.meta.access, warn) },
      position: { categoryIndex: groupIndex, categoryCount },
      ancestors: [], title: text(category.meta.title) || displayName(category.name), description: description(category.meta, 'A collection of courses, ready to explore.'),
      order: metadataOrder(category.meta, category.name), slug: category.slug, key: category.slug, url: route(category.slug),
      contentKey: category.synthetic ? '' : category.name, directory: category.directory, explicitThumbnail: category.meta.thumbnail, courses: [],
    };
    if (!permitted(await decisionFor(viewer, 'list', cat))) continue;
    cat.thumbnail = await resolveThumbnail(cat, null, config, root, warn);
    const courseSlugs = slugs(courseCandidates.map(c => c.name));
    for (const [index, candidate] of courseCandidates.entries()) {
      const meta = await json(path.join(candidate.directory, 'meta.json'), warn), courseSlug = courseSlugs.get(candidate.name);
      const courseId = uniqueId(text(meta.id) || `${catId}/${courseSlug}`, `${catId}/${courseSlug}`);
      const course = {
        resource: { type: 'course', id: courseId, categoryId: catId, access: accessMetadata(meta.access, warn) },
        position: { ...cat.position, courseIndex: index },
        ancestors: [cat.resource], title: text(meta.title) || displayName(candidate.name), description: description(meta), order: metadataOrder(meta, candidate.name),
        slug: courseSlug, key: `${cat.key}/${courseSlug}`, url: route(cat.slug, courseSlug),
        contentKey: category.synthetic ? candidate.name : `${category.name}/${candidate.name}`, directory: candidate.directory,
        explicitThumbnail: meta.thumbnail, volumes: [],
      };
      if (!permitted(await decisionFor(viewer, 'list', course))) continue;
      const volumeDir = path.join(candidate.directory, 'volumes');
      const volumeEntries = (await entries(volumeDir, warn)).filter(d => !d.name.startsWith('.'));
      const folders = [];
      for (const dir of volumeEntries.filter(d => d.isDirectory())) {
        if ((await entries(path.join(volumeDir, dir.name), warn)).some(d => d.isDirectory() && d.name === 'chapters')) folders.push(dir);
      }
      const files = [...volumeEntries.filter(d => d.isFile() && /\.md$/i.test(d.name) && !folders.some(folder => folder.name === d.name.replace(/\.md$/i, ''))), ...folders];
      const volumeSlugs = slugs(files.map(d => d.name));
      for (const file of files) {
        let doc, error, chapterEntries = [], volumeMeta = {};
        const chapterDirectory = file.isDirectory() ? path.join(volumeDir, file.name, 'chapters') : null;
        try {
          if (chapterDirectory) {
            volumeMeta = await json(path.join(volumeDir, file.name, 'volume.json'), warn);
            chapterEntries = (await entries(chapterDirectory, warn)).filter(d => d.isFile() && /\.md$/i.test(d.name));
            const first = chapterEntries[0] ? await documentAt(path.join(chapterDirectory, chapterEntries[0].name), warn) : parseDocument('', file.name);
            doc = { ...first, title: text(volumeMeta.title) || first.bookTitle || displayName(file.name),
              bookTitle: text(volumeMeta.bookTitle) || first.bookTitle, description: description(volumeMeta, first.description),
              id: text(volumeMeta.id), order: metadataOrder(volumeMeta, `${file.name}.md`) ?? parseDocument('', `${file.name}.md`).order,
              draft: volumeMeta.draft === true, access: accessMetadata(volumeMeta.access, warn), thumbnail: volumeMeta.thumbnail };
          } else doc = await documentAt(path.join(volumeDir, file.name), warn);
        }
        catch (e) { error = `Cannot read ${file.name}: ${e.code || e.message}`; warn(error); doc = parseDocument('', file.name, warn); }
        if (doc.draft) continue;
        const volumeSlug = volumeSlugs.get(file.name);
        const volumeId = uniqueId(doc.id ? `${courseId}/${doc.id}` : `${courseId}/${volumeSlug}`, `${courseId}/${volumeSlug}`);
        const volume = {
          resource: { type: 'volume', id: volumeId, categoryId: catId, courseId, order: doc.order, access: doc.access },
          position: course.position,
          ancestors: [cat.resource, course.resource], title: doc.title, description: doc.description, order: doc.order, sortName: file.name,
          slug: volumeSlug, key: `${course.key}/${volumeSlug}`, url: route(cat.slug, course.slug, volumeSlug),
          file: chapterDirectory ? null : path.join(volumeDir, file.name), directory: volumeDir, basename: file.name.replace(/\.md$/i, ''),
          chapters: [], chapterDirectory,
          contentKey: `${course.contentKey}/${file.name.replace(/\.md$/i, '')}`, explicitThumbnail: doc.thumbnail,
          bookTitle: doc.bookTitle, error,
        };
        if (!permitted(await decisionFor(viewer, 'list', volume))) continue;
        volume.decision = await decisionFor(viewer, 'read', volume);
        volume.progressAllowed = (await decisionFor(viewer, 'progress', volume)).effect === 'allow' && volume.decision.effect === 'allow';
        if (chapterDirectory && volume.decision.effect !== 'deny') {
          const chapterSlugs = slugs(chapterEntries.map(d => d.name));
          for (const entry of chapterEntries) {
            try {
              const chapterFile = path.join(chapterDirectory, entry.name), chapterDoc = await documentAt(chapterFile, warn);
              if (chapterDoc.draft) continue;
              const chapterSlug = chapterSlugs.get(entry.name);
              const inheritedFrontmatter = volumeMeta.sourceFilename && entry.name === '00-overview.md';
              volume.chapters.push({ id: `${volumeId}/${(!inheritedFrontmatter && chapterDoc.id) || chapterSlug}`, slug: chapterSlug,
                title: inheritedFrontmatter ? (text(volumeMeta.chapterTitles?.[entry.name]) || 'Overview') : chapterDoc.explicitTitle || chapterDoc.firstHeading || text(volumeMeta.chapterTitles?.[entry.name]) || displayName(entry.name),
                order: inheritedFrontmatter ? 0 : chapterDoc.order, url: `${volume.url}/${encodeURIComponent(chapterSlug)}`, file: chapterFile,
                progressAllowed: volume.progressAllowed });
            } catch (e) { warn(`Cannot read chapter ${entry.name}: ${e.code || e.message}`); }
          }
          volume.chapters.sort((a, b) => (a.order ?? Infinity) - (b.order ?? Infinity) || a.slug.localeCompare(b.slug, 'en', { numeric: true }));
          // A preview limit applies once to the entire volume, not afresh to every chapter.
          if (volume.decision.effect === 'partial') {
            const permittedTree = visibleTree((await volumeDocument(volume)).tree, volume.decision);
            const available = new Set(permittedTree.children.map(n => n.data?.chapterId));
            volume.chapters = volume.chapters.filter(ch => available.has(ch.id));
          }
        }
        course.volumes.push(volume);
      }
      course.volumes.sort((a, b) => (a.order ?? Infinity) - (b.order ?? Infinity) || a.sortName.localeCompare(b.sortName, 'en', { numeric: true }));
      if (!text(meta.title) && course.volumes[0]?.bookTitle) course.title = course.volumes[0].bookTitle;
      if (!course.description) course.description = `${course.volumes.length} volumes · A self-paced technical course.`;
      course.thumbnail = await resolveThumbnail(course, cat, config, root, warn);
      for (const volume of course.volumes) {
        volume.thumbnail = permitted(await decisionFor(viewer, 'thumbnail', volume)) && volume.decision.effect !== 'deny'
          ? await resolveThumbnail(volume, course, config, root, warn) : null;
      }
      cat.courses.push(course);
    }
    cat.courses.sort(compareOrder); output.push(cat);
  }
  output.sort(compareOrder);
  return { categories: output, warnings, root };
}

function publicNode(node) {
  const result = { id: node.resource.id, type: node.resource.type, title: node.title, description: node.description, slug: node.slug, url: node.url, order: node.order,
    thumbnail: node.thumbnail ? { url: node.thumbnail.url, origin: node.thumbnail.origin } : null };
  if (node.courses) result.courses = node.courses.map(publicNode);
  if (node.volumes) result.volumes = node.volumes.map(publicNode);
  if (node.chapters) result.chapters = node.chapters.map(({ file, ...chapter }) => chapter);
  if (node.decision) { result.decision = node.decision; result.progressAllowed = node.progressAllowed; }
  return result;
}
export function publicLibrary(library) {
  return { categories: library.categories.map(publicNode), warnings: process.env.NODE_ENV === 'development' ? library.warnings : library.warnings.length ? ['Some content could not be loaded. Check the server log.'] : [] };
}
async function volumeDocument(volume) {
  if (!volume.chapterDirectory) return documentAt(volume.file, console.warn);
  let body = '';
  const ranges = [];
  for (const chapter of volume.chapters) {
    const doc = await documentAt(chapter.file, console.warn);
    ranges.push({ start: body.length, chapter });
    body += doc.body + '\n\n';
  }
  const document = parseDocument(body, 'volume.md');
  for (const node of document.tree.children) {
    const range = ranges.findLast(r => r.start <= (node.position?.start.offset ?? 0));
    node.data = { ...node.data, chapterId: range?.chapter.id, chapterUrl: range?.chapter.url };
  }
  const slugger = new GithubSlugger();
  visit(document.tree, 'heading', node => { node.data = { ...node.data, hProperties: { id: slugger.slug(toString(node)) } }; });
  return document;
}

function chapterDocument(document, tree, chapter) {
  const headingLinks = {};
  visit(tree, 'heading', n => { if (n.data?.chapterUrl && n.data?.hProperties?.id) headingLinks[n.data.hProperties.id] = `${n.data.chapterUrl}#${n.data.hProperties.id}`; });
  return { ...document, headingLinks, tree: { ...tree, children: tree.children.filter(n => n.data?.chapterId === chapter.id || n.type === 'definition') } };
}

export async function loadVolume(viewer, course, volume, chapterSlug) {
  const decision = await decisionFor(viewer, 'read', volume);
  const chapter = chapterSlug ? volume.chapters.find(ch => ch.slug === chapterSlug) : null;
  let rendered = { html: '', toc: [], minutes: 0, preview: false };
  if (decision.effect !== 'deny') {
    try {
      const document = await volumeDocument(volume);
      if (chapter) {
        const tree = visibleTree(document.tree, decision);
        rendered = await renderDocument(chapterDocument(document, tree, chapter), { effect: 'allow' });
        const firstNode = tree.children.find(n => n.data?.chapterId === chapter.id && n.type !== 'definition');
        rendered.repeatedTitle = firstNode?.type === 'heading' && toString(firstNode) === chapter.title;
        rendered.preview = decision.effect === 'partial';
      } else rendered = await renderDocument(document, decision);
    }
    catch (error) { rendered.error = `This volume could not be read (${error.code || 'invalid content'}). Check its file and permissions.`; }
  }
  const index = course.volumes.indexOf(volume);
  const neighbor = async v => v && (await decisionFor(viewer, 'navigate', v)).effect !== 'deny' ? publicNode(v) : null;
  const chapterIndex = chapter ? volume.chapters.indexOf(chapter) : -1;
  const chapterNeighbor = ch => ch ? (({ file, ...publicChapter }) => publicChapter)(ch) : null;
  const navigate = await decisionFor(viewer, 'navigate', volume);
  return { ...rendered, decision, chapter: chapterNeighbor(chapter),
    previous: chapter ? (navigate.effect !== 'deny' ? chapterNeighbor(volume.chapters[chapterIndex - 1]) : null) : await neighbor(course.volumes[index - 1]),
    next: chapter ? (navigate.effect !== 'deny' ? chapterNeighbor(volume.chapters[chapterIndex + 1]) : null) : await neighbor(course.volumes[index + 1]),
    previousVolume: await neighbor(course.volumes[index - 1]), nextVolume: await neighbor(course.volumes[index + 1]) };
}

export async function searchLibrary(viewer, query, suppliedLibrary) {
  const library = suppliedLibrary || await scanLibrary(viewer);
  const q = query.trim().slice(0, 160).toLocaleLowerCase();
  if (q.length < 2) return { results: [], truncated: false };
  const results = [];
  const push = (node, fullPath, text, kind) => {
    const at = text.toLocaleLowerCase().indexOf(q);
    if (at < 0 && !fullPath.toLocaleLowerCase().includes(q)) return;
    results.push({ title: node.title, path: fullPath, url: node.url, kind, snippet: at < 0 ? '' : text.slice(Math.max(0, at - 65), at + q.length + 130) });
  };
  for (const category of library.categories) {
    if (!permitted(await decisionFor(viewer, 'list', category))) continue;
    if (permitted(await decisionFor(viewer, 'search-index', category)) && permitted(await decisionFor(viewer, 'search-result', category))) push(category, category.title, category.description, 'Category');
    for (const course of category.courses) {
      if (!permitted(await decisionFor(viewer, 'list', course))) continue;
      const coursePath = `${category.title} → ${course.title}`;
      if (permitted(await decisionFor(viewer, 'search-index', course)) && permitted(await decisionFor(viewer, 'search-result', course))) push(course, coursePath, course.description, 'Course');
      for (const volume of course.volumes) {
        const indexing = await decisionFor(viewer, 'search-index', volume);
        const read = await decisionFor(viewer, 'read', volume);
        const result = await decisionFor(viewer, 'search-result', volume);
        if ([indexing, read, result].some(d => d.effect === 'deny')) continue;
        try {
          const doc = await volumeDocument(volume);
          // Apply all limits, before text extraction. No unredacted index is exposed or shared between viewers.
          let tree = doc.tree;
          for (const decision of [indexing, read, result]) tree = visibleTree(tree, decision);
          if (volume.chapters.length) {
            for (const chapter of volume.chapters) {
              const selected = chapterDocument(doc, tree, chapter);
              if (selected.tree.children.some(n => n.type !== 'definition')) push(chapter, `${coursePath} → ${volume.title} → ${chapter.title}`, searchableText(selected.tree), 'Chapter');
            }
          } else push(volume, `${coursePath} → ${volume.title}`, searchableText(tree), 'Volume');
        } catch { /* Already surfaced in discovery warnings. */ }
      }
    }
  }
  return { results: results.slice(0, 40), truncated: results.length > 40 };
}

export async function serveThumbnail(viewer, key) {
  if (!key || key.includes('..') || key.includes('\\') || key.startsWith('/') || key.includes('\0')) return new Response('Invalid path', { status: 400 });
  const library = await scanLibrary(viewer);
  const nodes = library.categories.flatMap(c => [c, ...c.courses.flatMap(course => [course, ...course.volumes])]);
  const node = nodes.find(n => n.key === key);
  if (!node || !permitted(await decisionFor(viewer, 'list', node)) || !permitted(await decisionFor(viewer, 'thumbnail', node)) || (node.resource.type === 'volume' && (await decisionFor(viewer, 'read', node)).effect === 'deny')) return new Response('Not found', { status: 404 });
  return imageResponse(node.thumbnail, library.root, console.warn);
}