import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const command = process.argv[2];
if (!['dev', 'build', 'start'].includes(command)) throw new Error('Expected next command: dev, build, or start');
const env = { ...process.env };
const deploymentFile = resolve(root, 'deployments', 'studio-next.json');
if (existsSync(deploymentFile)) {
  const deployment = JSON.parse(readFileSync(deploymentFile, 'utf8'));
  if (/^0x[0-9a-fA-F]{40}$/.test(deployment.contractAddress ?? '')) env.NEXT_PUBLIC_CONTRACT_ADDRESS ??= deployment.contractAddress;
  if (typeof deployment.fixtureBaseUrl === 'string') env.NEXT_PUBLIC_FIXTURE_BASE_URL ??= deployment.fixtureBaseUrl;
}
env.NEXT_PUBLIC_CHAIN_ID ??= '61997';
env.NEXT_PUBLIC_RPC_URL ??= 'https://studio-dev.genlayer.com/api';
env.NEXT_PUBLIC_EXPLORER_URL ??= 'https://explorer-studio-dev.genlayer.com';
const bin = resolve(root, 'node_modules', 'next', 'dist', 'bin', 'next');
const result = spawnSync(process.execPath, [bin, command, ...process.argv.slice(3)], { cwd: root, env, stdio: 'inherit' });
process.exit(result.status ?? 1);
