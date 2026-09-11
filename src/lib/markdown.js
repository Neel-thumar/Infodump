import matter from 'gray-matter';
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import remarkRehype from 'remark-rehype';
import rehypeKatex from 'rehype-katex';
import rehypeHighlight from 'rehype-highlight';
import rehypeStringify from 'rehype-stringify';
import GithubSlugger from 'github-slugger';
import { visit } from 'unist-util-visit';
import { toString } from 'mdast-util-to-string';

const parser = unified().use(remarkParse).use(remarkGfm).use(remarkMath, { singleDollarTextMath: false });
export function displayName(name) {
  return name.replace(/\.md$/i, '').replace(/^volume-\d+[-_]?/i, '').replace(/^\d+[-_]/, '')
    .replace(/[-_]+/g, ' ').replace(/\b\p{L}/gu, c => c.toUpperCase()) || 'Untitled';
}
export function accessMetadata(value, warn) {
  if (value === undefined) return {};
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    warn('Malformed access metadata; defaulting to open.'); return {};
  }
  return value;
}
export function parseDocument(raw, filename, warn = console.warn) {
  let data = {}, body = raw;
  try { ({ data, content: body } = matter(raw)); }
  catch (error) {
    warn(`Malformed frontmatter in ${filename}: ${error.message}`);
    // Do not interpret invalid YAML as document headings or a title.
    body = raw.replace(/^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/, '');
  }
  const tree = parser.parse(body);
  const firstIndex = tree.children.findIndex(n => n.type === 'heading');
  const first = tree.children[firstIndex];
  const after = tree.children.slice(firstIndex + 1);
  const next = after.find(n => !['thematicBreak', 'html'].includes(n.type));
  const shared = first?.depth === 1 && next?.type === 'heading' && next.depth === 2;
  const heading = shared ? next : first?.depth === 1 ? first : null;
  const number = filename.match(/^(?:volume-)(\d+)(?:-|\.|$)/i) || filename.match(/^(\d+)[-_]/);
  const order = Number.isFinite(data.order) ? data.order : number ? Number(number[1]) : null;
  return {
    explicitTitle: typeof data.title === 'string' ? data.title : null,
    firstHeading: first ? toString(first) : '',
    body, tree, title: typeof data.title === 'string' && data.title.trim() ? data.title : heading ? toString(heading) : displayName(filename),
    bookTitle: first?.depth === 1 ? toString(first) : '',
    description: typeof data.description === 'string' ? data.description : '',
    id: typeof data.id === 'string' && data.id.trim() ? data.id : null,
    order, draft: data.draft === true, access: accessMetadata(data.access, warn),
    thumbnail: typeof data.thumbnail === 'string' ? data.thumbnail : null,
  };
}

export function visibleTree(tree, decision = { effect: 'allow' }) {
  if (decision.effect === 'deny') return { type: 'root', children: [] };
  if (decision.effect !== 'partial') return tree;
  if (decision.limits) return decision.limits.reduce((current, limit) => visibleTree(current, { effect: 'partial', limit }), tree);
  const boundaries = tree.children.flatMap((n, i) => n.type === 'heading' && [2, 3].includes(n.depth) ? [i] : []);
  if (!boundaries.length) return { ...tree, children: [] };
  const limit = decision.limit || {};
  const count = limit.type === 'headings' ? Math.max(0, Math.floor(limit.count || 0))
    : limit.type === 'percent' ? Math.floor(boundaries.length * Math.min(100, Math.max(0, limit.value || 0)) / 100) : 0;
  // Never cut a fence, table, paragraph or blockquote in half.
  let end = count <= 0 ? 0 : boundaries[count] ?? tree.children.length;
  if (boundaries[count] !== undefined && count > 0) {
    // A new H1 starts the next chapter; don't leak that chapter's preamble before its first H2.
    const nextChapter = tree.children.findIndex((node, i) => i > boundaries[count - 1] && i < end && node.type === 'heading' && node.depth === 1);
    if (nextChapter >= 0) end = nextChapter;
  }
  return { ...tree, children: tree.children.slice(0, end) };
}

export function searchableText(tree) {
  const chunks = [];
  visit(tree, n => { if (['text', 'inlineCode', 'code', 'math', 'inlineMath'].includes(n.type)) chunks.push(n.value); });
  return chunks.join(' ').replace(/\s+/g, ' ').trim();
}

export async function renderDocument(document, decision) {
  const tree = structuredClone(visibleTree(document.tree, decision));
  const toc = [], slugger = new GithubSlugger();
  let words = 0, codeLines = 0, tableRows = 0;
  visit(tree, (node, index, parent) => {
    if (node.type === 'heading') {
      const text = toString(node), id = node.data?.hProperties?.id || slugger.slug(text);
      node.data = { ...node.data, hProperties: { id } };
      if ([2, 3].includes(node.depth)) toc.push({ text, id, depth: node.depth });
    }
    if (node.type === 'text') words += node.value.split(/\s+/).filter(Boolean).length;
    if (node.type === 'code') codeLines += node.value.split('\n').length;
    if (node.type === 'tableRow') tableRows++;
    if (node.type === 'link' && node.url?.startsWith('#') && document.headingLinks) {
      const target = document.headingLinks[node.url.slice(1)];
      if (target) node.url = target;
    }
    // Raw HTML is never enabled. Only safe document link/image schemes are emitted.
    if (['link', 'image', 'definition'].includes(node.type) && !/^(https?:|mailto:|#|\/|\.\/|\.\.\/)/i.test(node.url || '')) {
      if (/^[a-z][a-z\d+.-]*:/i.test(node.url || '')) node.url = '';
    }
    if (node.type === 'image' && parent && !/^https?:\/\//i.test(node.url)) {
      parent.children[index] = { type: 'text', value: `[Image: ${node.alt || 'local image not served'}]` };
    }
  });
  const processor = unified().use(remarkRehype).use(rehypeKatex, { throwOnError: false, strict: false })
    .use(rehypeHighlight, { detect: false, ignoreMissing: true })
    .use(() => tree => {
      visit(tree, 'element', (node, i, parent) => {
        if (node.tagName === 'table' && parent?.tagName !== 'div') {
          parent.children[i] = { type: 'element', tagName: 'div', properties: { className: ['table-scroll'], tabIndex: 0, role: 'region', ariaLabel: 'Scrollable table' }, children: [node] };
        }
        if (node.tagName === 'pre') node.properties = { ...node.properties, tabIndex: 0 };
      });
    }).use(rehypeStringify);
  const html = processor.stringify(await processor.run(tree));
  return { html, toc, minutes: Math.max(1, Math.ceil(words / 220 + codeLines / 35 + tableRows / 12)), preview: decision?.effect === 'partial', empty: !searchableText(tree) };
}