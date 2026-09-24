import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const python = process.platform === 'win32' ? join(root, '.venv', 'Scripts', 'python.exe') : join(root, '.venv', 'bin', 'python');
if (!existsSync(python)) {
  console.error('Project Python environment is missing. Run npm run setup:python first.');
  process.exit(1);
}
const result = spawnSync(python, process.argv.slice(2), { cwd: root, stdio: 'inherit', env: { ...process.env, PYTHONIOENCODING: 'utf-8' } });
process.exit(result.status ?? 1);
