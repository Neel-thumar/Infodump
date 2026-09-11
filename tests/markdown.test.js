import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { parseDocument, renderDocument, visibleTree, searchableText } from '../src/lib/markdown.js';
import { autoComplete, toggleComplete, progressKey } from '../src/lib/state.js';

test('title precedence, YAML, H2 intro, paragraph break, outlier and numeric zero', () => {
  const doc = parseDocument('# Shared book\n\n## Volume 0 — Prologue\n\nText', 'volume-0-prologue.md');
  assert.equal(doc.title, 'Volume 0 — Prologue'); assert.equal(doc.order, 0);
  assert.equal(doc.bookTitle, 'Shared book');
  assert.equal(parseDocument('# Guide\n\nBody\n\n## Later', 'btree-nbtree-guide.md').title, 'Guide');
  assert.equal(parseDocument('plain', 'volume-4-package-management.md').title, 'Package Management');
  const future = parseDocument('---\ntitle: Custom\norder: 20\nid: stable\ndraft: true\naccess: { tier: free }\n---\n# Book\n## Other', 'volume-1-x.md');
  assert.equal(future.title, 'Custom'); assert.equal(future.order, 20); assert.equal(future.id, 'stable'); assert.equal(future.draft, true); assert.equal(future.access.tier, 'free');
  const warnings = [];
  assert.deepEqual(parseDocument('---\naccess: invalid\n---\n# A', 'a.md', m => warnings.push(m)).access, {});
  assert.ok(warnings.length);
  assert.doesNotThrow(() => parseDocument('---\naccess: [bad\n---\n# A', 'a.md', () => {}));
});

test('math never consumes bash PID, inline code, plain diagrams or nested code', async () => {
  const raw = '# Book\n## Intro\n\n`$$` and `/proc/$$/fd/9`\n\n```bash\ncat /proc/$$/environ\n```\n\n```\n┌───┐\n│ x │\n└───┘\n```\n\n> ```bash\n> cat /proc/$$/status\n> ```\n\n$$\n\\frac{n}{2} = x\n$$\n\n> $$\\big|\\,x\\,\\big| \\le 1$$';
  const { html } = await renderDocument(parseDocument(raw, 'a.md'), { effect: 'allow' });
  assert.ok(html.includes('/proc/$$/environ')); assert.ok(html.includes('<code>$$</code>'));
  assert.ok(html.includes('/proc/$$/status')); assert.ok(html.includes('class="katex"'));
  assert.ok(html.includes('<code>┌───┐\n│ x │\n└───┘\n</code>'));
  assert.match(html, /<blockquote>\s*<pre/); assert.match(html, /hljs/);
});

test('stable TOC H2/H3 only, duplicate slugs, clean preview and safe raw HTML', async () => {
  const raw = '# Book\n## 39.5 Loops, and the gotcha that eats an hour\none\n### § `tick` — A!\ntwo\n## Repeat\nthree\n## Repeat\nWITHHELD_SECRET\n<script>alert(1)</script>\n[x](javascript:alert%281%29)';
  const doc = parseDocument(raw, 'a.md');
  const full = await renderDocument(doc, { effect: 'allow' });
  assert.equal(full.toc.length, 4); assert.notEqual(full.toc[2].id, full.toc[3].id);
  assert.ok(full.toc.every(t => full.html.includes(`id="${t.id}"`)));
  assert.ok(!full.html.includes('<script>')); assert.ok(!full.html.includes('javascript:'));
  const preview = await renderDocument(doc, { effect: 'partial', limit: { type: 'headings', count: 3 } });
  assert.equal(preview.toc.length, 3); assert.ok(!preview.html.includes('WITHHELD_SECRET'));
  assert.ok(!searchableText(visibleTree(doc.tree, { effect: 'deny' })));
  assert.equal(searchableText(visibleTree(parseDocument('# Only H1\nSECRET', 'a.md').tree, { effect: 'partial', limit: { type: 'headings', count: 3 } })), '');
  const intersection = visibleTree(doc.tree, { effect: 'partial', limits: [{ type: 'headings', count: 1 }, { type: 'headings', count: 3 }] });
  assert.ok(!searchableText(intersection).includes('two'));
});

test('manual completion decisions beat scroll, keys are scoped and versioned', () => {
  const complete = autoComplete(undefined), unmarked = toggleComplete(complete);
  assert.equal(unmarked.complete, false); assert.deepEqual(autoComplete(unmarked), unmarked);
  assert.match(progressKey('alice', 'c:a', 'v/b'), /^cp:v1:alice:progress:c%3Aa:v%2Fb$/);
});

test('real source corpus: 10 distinct Linux titles, math, PID, diagrams and nested fences', async () => {
  const root = path.resolve('course');
  const linuxDir = path.join(root, 'Linux/Debian');
  const files = (await fs.readdir(linuxDir)).filter(f => f.endsWith('.md'));
  const linux = await Promise.all(files.map(async f => parseDocument(await fs.readFile(path.join(linuxDir, f), 'utf8'), f)));
  assert.equal(linux.length, 10); assert.equal(new Set(linux.map(d => d.title)).size, 10);
  const shell = await renderDocument(linux.find(d => d.order === 1), { effect: 'allow' });
  assert.ok(shell.html.includes('/proc/$$/environ')); assert.match(shell.html, /<blockquote>[\s\S]*?<pre/);
  const trees = parseDocument(await fs.readFile(path.join(root, 'Data Structure/Tree/volume-1-foundations.md'), 'utf8'), 'volume-1-foundations.md');
  const rendered = await renderDocument(trees, { effect: 'allow' });
  assert.ok(rendered.html.includes('class="katex"')); assert.ok(rendered.html.includes('─'));
});