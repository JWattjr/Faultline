import { spawnSync } from "node:child_process";
import { ROOT } from "./lib.ts";

function run(command: string, optional = false): void {
  console.log(`\n> npm run ${command}`);
  const result = spawnSync("npm", ["run", command], {
    cwd: ROOT,
    stdio: "inherit",
    windowsHide: true,
    shell: process.platform === "win32",
  });
  if (result.error || result.status !== 0) {
    const message = result.error?.message ?? `exit code ${result.status}`;
    if (optional) {
      console.warn(`${command} did not produce data: ${message}. Continuing with the required reset and build.`);
      return;
    }
    throw new Error(`${command} failed (${message}).`);
  }
}

async function main(): Promise<void> {
  run("deploy");
  run("seed:demo");
  run("verify:proof");
  run("profile:fees", true);
  run("build");
  run("deploy:frontend");
}

main().catch((error: unknown) => {
  console.error(`Studio Next reset stopped: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
