import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fixture } from './fixtures.js';
const mode = process.argv[2], port = process.argv[3];
const root = path.resolve('.tmp', `browser-${mode}`);
await fs.rm(root, { recursive: true, force: true });
await fixture(root);
// Use the already built application: two readers of immutable .next output, distinct content roots.
const child = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', '--hostname', '127.0.0.1', '--port', port], {
  stdio: 'inherit', env: { ...process.env, CONTENT_ROOT: root, ACCESS_MODE: mode, ACCESS_POLICY: 'demo' },
});
const stop = () => child.kill();
process.on('SIGINT', stop); process.on('SIGTERM', stop);
child.on('exit', code => process.exit(code || 0));