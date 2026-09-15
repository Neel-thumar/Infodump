import { test, expect } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
import { write } from '../fixtures.js';
import { runSplit } from '../../scripts/split-chapters.mjs';

const root = path.resolve('.tmp/browser-open');
test('infodump branding and fullscreen focus mode hide chrome and restore the reader', async ({ page }) => {
  await page.goto('/c/a-os/linux/volume-0-chapter');
  await expect(page).toHaveTitle('infodump · Your local learning library');
  // Reading a volume merges the site header into the reader toolbar, so only that one bar is on screen.
  await expect(page.locator('.toolbar-brand')).toContainText('infodump');
  await expect(page.locator('.topbar')).toBeHidden();
  await page.getByRole('button', { name: 'Enter focus mode' }).click();
  await expect(page.locator('body')).toHaveAttribute('data-reading-focus', '');
  await expect(page.locator('.prose')).toBeVisible();
  for (const selector of ['.topbar', '.reader-toolbar', '.volume-sidebar', '.breadcrumbs', '.volume-header', '.toc', '.reading-meter', '.volume-pagination']) {
    await expect(page.locator(selector)).toBeHidden();
  }
  await expect.poll(() => page.evaluate(() => !!document.fullscreenElement)).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole('button', { name: 'Exit focus mode' }).click();
  await expect(page.locator('body')).not.toHaveAttribute('data-reading-focus');
  await expect(page.locator('.reader-toolbar')).toBeVisible();
  await expect.poll(() => page.evaluate(() => !!document.fullscreenElement)).toBe(false);

  // Unsupported/fullscreen-denied browsers still get a full-viewport, keyboard-exitable reader.
  await page.evaluate(() => { document.documentElement.requestFullscreen = () => Promise.reject(new Error('Unavailable')); });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'Enter focus mode' }).click();
  await expect(page.locator('.prose')).toBeVisible();
  await expect(page.locator('.reader-toolbar')).toBeHidden();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.keyboard.press('Escape');
  await expect(page.locator('.reader-toolbar')).toBeVisible();
  await expect(page.locator('body')).not.toHaveAttribute('data-reading-focus');
});

test('category grid, empty category, full breadcrumbs and real-time search', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.library-card')).toHaveCount(3);
  await page.getByRole('link', { name: /Networking/ }).click();
  await expect(page.getByText('A new collection, ready to grow.')).toBeVisible();
  await page.goto('/c/a-os/linux/volume-0-chapter');
  await expect(page.getByRole('navigation', { name: 'Breadcrumb', exact: true })).toContainText('Home');
  await expect(page.locator('.breadcrumbs')).toContainText('A Os');
  await expect(page.locator('.breadcrumbs')).toContainText('Linux Book');
  await expect(page.locator('.volume-link')).toHaveCount(10);
  await expect(page.locator('.volume-link').first()).toContainText('Volume 0');
  await page.goto('/'); await page.getByRole('searchbox').fill('SECRET_VOLUME_4');
  await expect(page.locator('.search-result')).toHaveCount(1);
  await expect(page.locator('.result-path')).toContainText('A Os → Linux Book → Volume 4');
  await page.getByRole('searchbox').fill('no-such-phrase-xyz');
  await expect(page.getByRole('heading', { name: /No results for/ })).toBeVisible();
});

test('rendered math, literal code, anchors, long-line overflow and mobile drawer', async ({ page }) => {
  await page.goto('/c/a-os/linux/volume-0-chapter');
  await expect(page.locator('.katex').first()).toBeVisible();
  await expect(page.locator('pre').filter({ hasText: '/proc/$$/environ' })).toBeVisible();
  await expect(page.locator('blockquote pre')).toContainText('echo nested');
  const diagram = page.locator('pre').filter({ hasText: '┌───┐' });
  expect(await diagram.locator('code').textContent()).toBe('┌───┐\n│ x │\n└───┘\n' + 'x'.repeat(440) + '\n');
  expect(await diagram.locator('.hljs').count()).toBe(0);
  const checkWidth = async () => {
    expect(await diagram.evaluate(el => el.scrollWidth > el.clientWidth)).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(await diagram.evaluate(el => getComputedStyle(el).whiteSpace)).toBe('pre');
  };
  await checkWidth();
  await page.getByRole('navigation', { name: 'Table of contents' }).getByRole('link', { name: 'Section one', exact: true }).click();
  await expect(page).toHaveURL(/#section-one$/);
  await page.setViewportSize({ width: 390, height: 844 });
  await checkWidth();
  await expect(page.locator('#volume-sidebar')).toBeHidden();
  await page.getByRole('button', { name: 'Toggle course navigation' }).click();
  await expect(page.getByRole('dialog', { name: 'Volume navigation' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('#volume-sidebar')).toBeHidden();
});

test('manual unmark survives rescrolling and reload; category progress rolls up; continue restores position', async ({ page }) => {
  await page.goto('/c/a-os/linux/volume-0-chapter');
  await page.locator('.article-region').evaluate(el => window.scrollTo(0, el.offsetTop + el.offsetHeight));
  const toggle = page.locator('.complete-button');
  await expect(toggle).toContainText('Completed');
  await toggle.click();
  await expect(toggle).toContainText('Mark as complete');
  await page.locator('.article-region').evaluate(el => window.scrollTo(0, el.offsetTop + el.offsetHeight));
  await expect(toggle).toContainText('Mark as complete');
  await page.reload();
  await expect(toggle).toContainText('Mark as complete');
  await toggle.click();
  await expect(toggle).toContainText('Completed');
  await page.locator('.article-region').evaluate(el => window.scrollTo(0, el.getBoundingClientRect().top + scrollY + el.offsetHeight * .5));
  await expect.poll(async () => page.evaluate(() => JSON.parse(localStorage.getItem('cp:v1:local:position:a-os%2Flinux:a-os%2Flinux%2Fvolume-0-chapter'))?.ratio)).toBeGreaterThan(.4);
  await page.goto('/');
  await expect(page.locator('.library-card').filter({ hasText: 'A Os' }).getByRole('progressbar')).toHaveAttribute('aria-valuenow', '10');
  await expect(page.locator('.continue-card')).toContainText('A Os → Linux Book → Volume 0');
  await page.locator('.continue-card').click();
  await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(500);
});

test('theme persists and is already dark before hydration', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => { localStorage.setItem('cp:v1:local:theme', 'dark'); });
  await page.reload({ waitUntil: 'commit' });
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.getByRole('button', { name: 'Toggle color theme' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  expect(await page.evaluate(() => localStorage.getItem('cp:v1:local:theme'))).toBe('light');
});

test('live disk additions, bare course, direct course, config changes and missing root', async ({ page }) => {
  await write(root, 'a-os/linux/volumes/volume-10-hot.md', '# Linux Book\n\n## Volume 10 — Hot discovery');
  await page.goto('/c/a-os/linux'); await expect(page.locator('.volume-link')).toHaveCount(11);
  await write(root, 'new-category/bare-course/volumes/intro.md', '# Bare course\n\n## Introduction');
  await write(root, 'direct-course/volumes/intro.md', '# Uncategorized course\n\n## Introduction');
  await page.goto('/'); await expect(page.locator('.library-card')).toHaveCount(5);
  await page.goto('/c/new-category/bare-course/intro'); await expect(page.locator('.prose')).toContainText('Introduction');
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><path fill="red" d="M0 0h100v100H0z"/></svg>';
  await write(root, 'assets/red.svg', svg); await write(root, 'a-os/thumbnail.svg', svg);
  await write(root, 'thumbnails.config.json', JSON.stringify({ map: { 'a-os': 'assets/red.svg' } }));
  await page.goto('/');
  await expect(page.locator('.library-card').filter({ hasText: 'A Os' }).locator('img')).toHaveAttribute('data-origin', 'map');
  await write(root, 'thumbnails.config.json', '{broken');
  await page.reload(); await expect(page.locator('.notice')).toBeVisible();
  await expect(page.locator('.library-card').filter({ hasText: 'A Os' }).locator('img')).toHaveAttribute('data-origin', 'sidecar');
  // Windows cannot rename a directory while in-flight image requests still hold its files.
  await page.waitForLoadState('networkidle');
  await page.goto('about:blank');
  const moved = `${root}-temporarily-missing`;
  await fs.rename(root, moved);
  try { await page.goto('/'); await expect(page.getByText('Your library is ready for its first chapter.')).toBeVisible(); }
  finally { await fs.rename(moved, root); }
});

test('demo: network responses contain no locked or preview-withheld text, hidden category or thumbnails', async ({ page, request }) => {
  const base = 'http://127.0.0.1:3101';
  const lockedResponse = await page.goto(`${base}/c/a-os/linux/volume-4-chapter`);
  const lockedHtml = await lockedResponse.text();
  await expect(page.getByText('This volume is locked')).toBeVisible();
  expect(lockedHtml).not.toContain('SECRET_VOLUME_4');
  expect(lockedHtml).not.toContain('/proc/$$/environ');
  const previewResponse = await page.goto(`${base}/c/a-os/linux/volume-1-chapter`);
  const previewHtml = await previewResponse.text();
  await expect(page.getByText('This is a preview.')).toBeVisible();
  await expect(page.locator('.prose h2, .prose h3')).toHaveCount(3);
  expect(previewHtml).not.toContain('SECRET_VOLUME_1');
  await expect(page.locator('.complete-button')).toBeDisabled();
  const flight = await request.get(`${base}/c/a-os/linux/volume-4-chapter?_rsc=test`, { headers: { RSC: '1' } });
  expect(await flight.text()).not.toContain('SECRET_VOLUME_4');
  await page.goto(base); await expect(page.locator('.library-card')).toHaveCount(2);
  expect(await (await request.get(`${base}/api/search?q=HIDDEN_COURSE_SECRET`)).json()).toEqual({ results: [], truncated: false });
  expect(await (await request.get(`${base}/api/search?q=SECRET_VOLUME_4`)).json()).toEqual({ results: [], truncated: false });
  expect(await (await request.get(`${base}/api/search?q=SECRET_VOLUME_1`)).json()).toEqual({ results: [], truncated: false });
  expect((await request.get(`${base}/c/b-db/trees/volume-1-foundations`)).status()).toBe(404);
  expect((await request.get(`${base}/thumb?node=b-db%2Ftrees`)).status()).toBe(404);
  expect((await request.get(`${base}/thumb?node=..%2F..%2Fetc%2Fpasswd`)).status()).toBe(400);
  expect((await request.get(`${base}/thumb/%2e%2e/%2e%2e/etc/passwd`)).status()).toBe(404);
});

test('chapter navigation, keyboard guards, reading controls and chapter completion', async ({ page }) => {
  const chapterRoot = path.join(root, 'reader-test');
  await write(chapterRoot, 'course/volumes/volume-1-reading.md', '# Reader Book\n\n## Volume 1 — Reading\n\nOverview text.\n\n# Chapter 1 — First\n\n## Details\n' + 'Readable text. '.repeat(700) + '\n\n```bash\necho readable\n```\n\n## Caveats\n\nOne more section, so this chapter earns an outline.\n\n# Chapter 2 — Second\n\n## More\nSecond chapter only.');
  await runSplit(chapterRoot, true);
  await page.goto('/c/reader-test/course/volume-1-reading');
  await expect(page).toHaveURL(/\/00-overview$/);
  await expect(page.getByRole('combobox', { name: 'Go to chapter' })).toBeVisible();
  // A single-heading chapter gets no outline column; it would only repeat the page title.
  await expect(page.locator('.toc')).toBeHidden();
  await page.locator('.complete-button').click();
  await page.locator('body').click({ position: { x: 400, y: 400 } });
  await page.keyboard.press('ArrowRight');
  await expect(page).toHaveURL(/\/01-chapter-1-first$/);
  await expect(page.locator('.prose')).not.toContainText('Second chapter only');
  const url = page.url();
  await page.locator('.prose pre').focus();
  await page.keyboard.press('ArrowLeft');
  expect(page.url()).toBe(url);
  await page.getByRole('button', { name: 'Hide course navigation', exact: true }).click();
  await expect(page.locator('.volume-sidebar')).toBeHidden();
  await page.getByRole('button', { name: 'Hide table of contents' }).click();
  await expect(page.locator('.toc')).toBeHidden();
  await page.locator('.reader-settings summary').click();
  await page.getByRole('combobox', { name: 'Reading width' }).selectOption('full');
  await page.getByRole('slider', { name: 'Text size' }).fill('23');
  await page.getByLabel('Site header', { exact: true }).uncheck();
  await expect(page.locator('.toolbar-brand')).toBeHidden();
  await page.keyboard.press('Escape');
  await expect(page.locator('.prose')).toHaveCSS('font-size', '23px');
  await page.locator('.reader-settings summary').click();
  await page.getByLabel('Reading toolbar', { exact: true }).uncheck();
  await expect(page.locator('.reader-toolbar')).toBeHidden();
  await page.getByRole('button', { name: 'Show reading controls' }).click();
  await expect(page.locator('.reader-toolbar')).toBeVisible();
  await page.keyboard.press('Escape');
  await page.reload();
  await expect(page.locator('.volume-sidebar')).toBeHidden();
  await expect(page.locator('.toolbar-brand')).toBeHidden();
  await expect(page.locator('.prose')).toHaveCSS('font-size', '23px');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.locator('.reader-settings summary').click();
  await page.getByRole('button', { name: 'Reset', exact: true }).click();
  await page.keyboard.press('Escape');
  await expect(page.locator('.volume-sidebar')).toBeVisible();
  await expect(page.locator('.toolbar-brand')).toBeVisible();
  // Focusing the code near the end may already have auto-completed this long chapter.
  if ((await page.locator('.complete-button').textContent()).includes('Mark as complete')) await page.locator('.complete-button').click();
  await expect(page.locator('.complete-button')).toContainText('Completed');
  await page.getByRole('link', { name: 'Next chapter', exact: true }).click();
  await expect(page).toHaveURL(/\/02-chapter-2-second$/);
  await expect(page.locator('.prose')).toContainText('Second chapter only');
  await expect(page.getByRole('button', { name: 'Next chapter', exact: true })).toBeDisabled();
  await page.locator('.complete-button').click();
  await expect(page.locator('.volume-sidebar').getByRole('progressbar')).toHaveAttribute('aria-valuenow', '100');
  await page.locator('.volume-progress-controls summary').click();
  await page.getByRole('button', { name: 'Unmark whole volume' }).click();
  await expect(page.locator('.volume-sidebar').getByRole('progressbar')).toHaveAttribute('aria-valuenow', '0');
  await page.getByRole('button', { name: 'Use chapter progress' }).click();
  await expect(page.locator('.volume-sidebar').getByRole('progressbar')).toHaveAttribute('aria-valuenow', '100');
  await page.goto('/');
  await expect(page.locator('.continue-card')).toContainText('Chapter 2 — Second');
});