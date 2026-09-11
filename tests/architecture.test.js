import fs from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';

test('source boundaries: one can function, no client filesystem access or auth scaffolding', async () => {
  async function files(directory) {
    return (await Promise.all((await fs.readdir(directory, { withFileTypes: true })).map(async entry => entry.isDirectory() ? files(path.join(directory, entry.name)) : [path.join(directory, entry.name)]))).flat();
  }
  let decisions = 0;
  for (const file of (await files('src')).filter(f => f.endsWith('.js'))) {
    const code = await fs.readFile(file, 'utf8');
    decisions += (code.match(/export async function can\(/g) || []).length;
    if (/from ['"]node:fs/.test(code)) assert.ok(['content.js', 'thumbnails.js'].includes(path.basename(file)), `Unexpected filesystem reader: ${file}`);
    if (code.startsWith("'use client'")) assert.ok(!/from .*lib\/(content|thumbnails|access\/policy)/.test(code));
    assert.ok(!/jsonwebtoken|next-auth|createSession|passwordHash/.test(code));
    if (path.basename(file) === 'content.js') assert.ok(!/demoHidden|ACCESS_MODE|ACCESS_POLICY/.test(code), 'Content gateway must not contain demo policy rules');
  }
  assert.equal(decisions, 1);
});