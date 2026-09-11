import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

export const imageExtensions = ['.avif', '.webp', '.png', '.jpg', '.jpeg', '.svg'];
const mime = { '.avif': 'image/avif', '.webp': 'image/webp', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.svg': 'image/svg+xml' };
const inside = (root, file) => { const rel = path.relative(root, file); return rel === '' || (!rel.startsWith(`..${path.sep}`) && rel !== '..' && !path.isAbsolute(rel)); };

export async function safeImage(source, root, warn) {
  if (typeof source !== 'string' || !source) return null;
  if (/^https?:\/\//i.test(source)) {
    try { const url = new URL(source); return { remote: url.href }; } catch { return null; }
  }
  if (source.split(/[\\/]/).includes('..')) { warn(`Rejected thumbnail traversal: ${source}`); return null; }
  try {
    const target = await fs.realpath(path.isAbsolute(source) ? source : path.resolve(root, source));
    const roots = [root, ...(process.env.THUMBNAIL_ROOTS || '').split(path.delimiter).filter(Boolean)];
    const allowed = await Promise.all(roots.map(r => fs.realpath(path.resolve(r)).catch(() => null)));
    if (!allowed.some(r => r && inside(r, target))) { warn(`Thumbnail outside allowed roots: ${source}`); return null; }
    const ext = path.extname(target).toLowerCase();
    if (!mime[ext] || !(await fs.stat(target)).isFile()) return null;
    return { local: target, mime: mime[ext] };
  } catch (error) { warn(`Missing/unreadable thumbnail ${source}: ${error.code || error.message}`); return null; }
}

export function matches(pattern, key) {
  const segments = pattern.split('/');
  const expression = segments.map((part, i) => part === '**' ? (i === segments.length - 1 ? '.*' : '(?:[^/]+/)*')
    : part.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '[^/]*') + (i < segments.length - 1 ? '/' : '')).join('');
  return new RegExp(`^${expression}$`, 'i').test(key);
}
export function patternOrder(a, b) {
  const prefix = s => s.split('*')[0].length;
  const wild = s => (s.match(/\*/g) || []).length;
  return prefix(b) - prefix(a) || wild(a) - wild(b) || a.localeCompare(b, 'en');
}
export function placeholder(id, title) {
  const hue = parseInt(crypto.createHash('sha256').update(id).digest('hex').slice(0, 6), 16) % 360;
  const initials = title.split(/\s+/).slice(0, 2).map(s => [...s][0]).join('').toUpperCase().replace(/[<>&"']/g, '');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="720" height="400" viewBox="0 0 720 400"><defs><linearGradient id="g" x2="1" y2="1"><stop stop-color="hsl(${hue},42%,24%)"/><stop offset="1" stop-color="hsl(${(hue + 35) % 360},36%,12%)"/></linearGradient></defs><path fill="url(#g)" d="M0 0h720v400H0z"/><g fill="none" stroke="white" opacity=".12"><circle cx="640" cy="50" r="210"/><circle cx="640" cy="50" r="150"/><path d="M0 320h720M0 340h720M0 360h720"/></g><text x="52" y="270" fill="white" font-family="system-ui,sans-serif" font-size="100" font-weight="600">${initials}</text></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}
export async function resolveThumbnail(node, parent, config, root, warn) {
  const trySource = async (value, origin) => { const hit = await safeImage(value, root, warn); return hit ? { ...hit, origin } : null; };
  let hit = await trySource(node.explicitThumbnail, 'metadata');
  if (!hit) hit = await trySource(config.map?.[node.contentKey], 'map');
  if (!hit) {
    for (const pattern of Object.keys(config.patterns || {}).filter(p => matches(p, node.contentKey)).sort(patternOrder)) {
      hit = await trySource(config.patterns[pattern], 'pattern');
      if (hit) break;
    }
  }
  if (!hit && node.directory) {
    const files = await fs.readdir(node.directory).catch(() => []);
    const basename = node.basename || 'thumbnail';
    for (const ext of imageExtensions) {
      const file = files.filter(f => f.toLowerCase() === `${basename}${ext}`.toLowerCase()).sort()[0];
      if (file) hit = await trySource(path.join(node.directory, file), 'sidecar');
      if (hit) break;
    }
  }
  if (!hit && config.inherit === true && parent?.thumbnail?.origin !== 'placeholder' && parent?.thumbnail) {
    hit = { ...parent.thumbnail, origin: 'inherited' };
  }
  if (!hit) hit = await trySource(config.defaults?.[node.resource.type], 'default');
  if (!hit) return { url: placeholder(node.resource.id, node.title), origin: 'placeholder' };
  return { ...hit, url: `/thumb?node=${encodeURIComponent(node.key)}` };
}

export async function imageResponse(thumbnail, root, warn) {
  if (!thumbnail || thumbnail.origin === 'placeholder') return new Response('Not found', { status: 404 });
  if (thumbnail.remote) return new Response(null, { status: 307, headers: { Location: thumbnail.remote, 'Cache-Control': 'private, no-store' } });
  // Revalidate realpath at serving time, not only discovery time.
  const safe = await safeImage(thumbnail.local, root, warn);
  if (!safe?.local) return new Response('Not found', { status: 404 });
  try {
    return new Response(await fs.readFile(/* turbopackIgnore: true */ safe.local), { headers: {
      'Content-Type': safe.mime, 'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'none'; sandbox",
    } });
  } catch { return new Response('Not found', { status: 404 }); }
}