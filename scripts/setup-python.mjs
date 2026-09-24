import { existsSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const venvPython = process.platform === 'win32' ? join(root, '.venv', 'Scripts', 'python.exe') : join(root, '.venv', 'bin', 'python');
const run = (file, args) => spawnSync(file, args, { cwd: root, encoding: 'utf8', stdio: 'inherit' });

function supportedVersion(python) {
  const result = spawnSync(python, ['-c', 'import sys; print(f"{sys.version_info.major}.{sys.version_info.minor}")'], { cwd: root, encoding: 'utf8' });
  if (result.status !== 0) return null;
  const [major, minor] = result.stdout.trim().split('.').map(Number);
  return major > 3 || (major === 3 && minor >= 12) ? `${major}.${minor}` : null;
}

function findPython() {
  const candidates = [];
  if (process.platform === 'win32') {
    candidates.push(['py', ['-3.12']], ['py', ['-3.13']]);
    const appData = process.env.APPDATA;
    const uvRoot = appData ? join(appData, 'uv', 'python') : '';
    if (uvRoot && existsSync(uvRoot)) {
      for (const folder of readdirSync(uvRoot).filter((name) => /^cpython-3\.(12|13)-/.test(name))) {
        candidates.push([join(uvRoot, folder, 'python.exe'), []]);
      }
    }
    if (process.env.PYTHON) candidates.push([process.env.PYTHON, []]);
    candidates.push(['py', ['-3']]);
  } else {
    if (process.env.PYTHON) candidates.push([process.env.PYTHON, []]);
    candidates.push(['python3.12', []], ['python3.13', []], ['python3', []]);
  }
  for (const [file, args] of candidates) {
    if (process.platform === 'win32' && file.includes(':') && !existsSync(file)) continue;
    const probe = spawnSync(file, [...args, '-c', 'import sys; print(sys.executable)'], { cwd: root, encoding: 'utf8' });
    if (probe.status === 0) {
      const python = probe.stdout.trim();
      if (supportedVersion(python)) return python;
    }
  }
  return null;
}

if (existsSync(venvPython) && supportedVersion(venvPython)) {
  console.log(`Using project Python ${supportedVersion(venvPython)} at ${venvPython}`);
} else {
  const base = findPython();
  if (!base) {
    console.error('Python 3.12+ is required. Install Python 3.12 or 3.13, then rerun npm run setup:python.');
    process.exit(1);
  }
  if (existsSync(venvPython)) {
    console.error(`The existing project interpreter at ${venvPython} is older than Python 3.12. Remove this project's .venv and retry.`);
    process.exit(1);
  }
  console.log(`Creating the project virtual environment with ${base}`);
  const created = run(base, ['-m', 'venv', join(root, '.venv')]);
  if (created.status !== 0) process.exit(created.status ?? 1);
}

const pip = run(venvPython, ['-m', 'pip', 'install', '--upgrade', 'pip']);
if (pip.status !== 0) process.exit(pip.status ?? 1);
const installed = run(venvPython, ['-m', 'pip', 'install', '--requirement', join(root, 'requirements.txt')]);
if (installed.status !== 0) process.exit(installed.status ?? 1);
console.log('Pinned GenLayer Python tooling is ready in .venv.');
