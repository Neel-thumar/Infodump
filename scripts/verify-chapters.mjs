import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';

const root = path.resolve(process.env.CONTENT_ROOT || 'content');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
let volumes = 0, chapters = 0, errors = 0;
async function walk(directory) {
  for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name.startsWith('.')) continue;
    const dir = path.join(directory, entry.name);
    const metadata = await fs.readFile(path.join(dir, 'volume.json'), 'utf8').then(JSON.parse).catch(() => null);
    if (!metadata?.sourceFilename || !metadata.sourceSha256) { await walk(dir); continue; }
    volumes++;
    const names = (await fs.readdir(path.join(dir, 'chapters'))).filter(name => /\.md$/i.test(name)).sort((a, b) => a.localeCompare(b, 'en', { numeric: true }));
    const combined = Buffer.concat(await Promise.all(names.map(name => fs.readFile(path.join(dir, 'chapters', name)))));
    const archive = await fs.readFile(path.join(path.dirname(dir), '.originals', path.basename(metadata.sourceFilename)));
    const matches = hash(combined) === metadata.sourceSha256 && combined.equals(archive);
    chapters += names.length;
    if (!matches) errors++;
    console.log(`${matches ? 'MATCH' : 'CHANGED'} ${path.relative(root, dir)}: ${names.length} chapters`);
  }
}
await walk(root);
console.log(`${volumes} volumes, ${chapters} chapters, ${errors} differences from archived originals.`);
process.exitCode = errors ? 1 : 0;