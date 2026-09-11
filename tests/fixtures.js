import fs from 'node:fs/promises';
import path from 'node:path';
export async function write(root, name, data) {
  const file = path.join(root, name); await fs.mkdir(path.dirname(file), { recursive: true }); await fs.writeFile(file, data); return file;
}
export async function fixture(root) {
  await fs.mkdir(root, { recursive: true });
  await fs.mkdir(path.join(root, 'networking'), { recursive: true });
  for (let i = 0; i < 10; i++) {
    const name = `a-os/linux/volumes/volume-${i}-chapter.md`;
    const content = `# Linux Book\n\n## Volume ${i} — Chapter ${i}\n\nIntro ${i}.\n\n## Section one\n\nOne\n\n### Section two\n\nTwo\n\n## Section three\n\nSECRET_VOLUME_${i}\n\n`;
    await write(root, name, content + 'A paragraph for reading. '.repeat(300) + '\n\n```bash\ncat /proc/$$/environ\n```\n\n```\n┌───┐\n│ x │\n└───┘\n' + 'x'.repeat(440) + '\n```\n\n> ```bash\n> echo nested\n> ```\n\n$$\n\\frac{n}{2}=x\n$$\n');
  }
  await write(root, 'b-db/trees/volumes/volume-1-foundations.md', '# Trees Book\n\n## Volume 1 — Foundations\n\nHIDDEN_COURSE_SECRET');
  await write(root, 'b-db/trees/volumes/btree-nbtree-guide.md', '# B-tree and nbtree guide\n\nAn unnumbered supplemental guide.');
}