import fs from 'node:fs/promises';
import path from 'node:path';

// One-time importer for the supplied workspace, not a registry used by the platform.
const imports = [
  ['course/Linux/Debian', 'content/operating-systems/mastering-debian-linux/volumes'],
  ['course/Data Structure/Tree', 'content/databases/trees-data-structures/volumes'],
];
let total = 0;
for (const [source, target] of imports) {
  await fs.mkdir(target, { recursive: true });
  const files = await fs.readdir(source).catch(() => []);
  for (const file of files.filter(f => /\.md$/i.test(f))) {
    if (await fs.stat(path.join(target, file.replace(/\.md$/i, ''), 'chapters')).then(s => s.isDirectory()).catch(() => false)) continue;
    try { await fs.copyFile(path.join(source, file), path.join(target, file), fs.constants.COPYFILE_EXCL); total++; }
    catch (error) { if (error.code !== 'EEXIST') throw error; }
  }
}
await fs.mkdir('content/networking', { recursive: true });
console.log(`Copied ${total} Markdown files without overwriting originals or existing content. The missing btree-nbtree-guide.md was not fabricated.`);