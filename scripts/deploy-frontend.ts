import { spawnSync } from "node:child_process";
import { copyFileSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { relative, resolve, sep } from "node:path";
import { DEPLOYMENT_FILE, ENV_FILE, ROOT, readJson, type Deployment } from "./lib.ts";

function setEnvValue(name: string, value: string): void {
  const source = existsSync(ENV_FILE) ? readFileSync(ENV_FILE, "utf8") : "";
  const pattern = new RegExp(`^${name}=.*$`, "m");
  const line = `${name}=${value}`;
  const next = pattern.test(source) ? source.replace(pattern, line) : `${source}${source && !source.endsWith("\n") ? "\n" : ""}${line}\n`;
  writeFileSync(ENV_FILE, next, "utf8");
}

function vercelEnvironment(): NodeJS.ProcessEnv {
  const environment = { ...process.env };
  for (const key of Object.keys(environment)) if (/_PRIVATE_KEY$/i.test(key)) delete environment[key];
  return environment;
}

function runVercel(args: string[], cwd: string) {
  const result = spawnSync(process.platform === "win32" ? "vercel.cmd" : "vercel", args, {
    cwd,
    encoding: "utf8",
    windowsHide: true,
    timeout: 20 * 60 * 1000,
    shell: process.platform === "win32",
    env: vercelEnvironment(),
  });
  if (result.error) throw new Error(`Could not run Vercel CLI: ${result.error.message}. Install the CLI and authenticate, then retry.`);
  if (result.status !== 0) throw new Error(`Vercel command failed (${result.status}): ${(result.stderr || result.stdout).trim()}`);
  return `${result.stdout}\n${result.stderr}`;
}

async function main(): Promise<void> {
  const identity = runVercel(["whoami"], ROOT);
  console.log(`Vercel account: ${identity.trim()}`);
  const deployment = readJson<Deployment>(DEPLOYMENT_FILE);
  const stagingParent = resolve(tmpdir());
  const stagingRoot = mkdtempSync(resolve(stagingParent, "faultline-vercel-"));
  const stagingRelative = relative(stagingParent, stagingRoot);
  if (!stagingRelative || stagingRelative.startsWith(`..${sep}`) || resolve(stagingRoot) === stagingParent) throw new Error("Refusing to stage Vercel files outside the temporary staging directory.");
  const excludedDirectories = new Set([".pytest_cache", ".venv", "node_modules", ".next", "artifacts", "screenshots", "playwright-report", "test-results", "tests", "docs", ".agents", ".codex"]);
  const environment = vercelEnvironment();
  if (deployment) {
    environment.NEXT_PUBLIC_CONTRACT_ADDRESS = deployment.contractAddress;
    environment.NEXT_PUBLIC_FIXTURE_BASE_URL = deployment.fixtureBaseUrl;
    environment.NEXT_PUBLIC_CHAIN_ID = String(deployment.chainId);
    environment.NEXT_PUBLIC_RPC_URL = deployment.rpcUrl;
    environment.NEXT_PUBLIC_EXPLORER_URL = deployment.explorerUrl;
  } else if (process.env.FIXTURE_BASE_URL) {
    environment.NEXT_PUBLIC_FIXTURE_BASE_URL = process.env.FIXTURE_BASE_URL;
  }
  try {
    cpSync(ROOT, stagingRoot, {
      recursive: true,
      filter: (source) => {
        const relativePath = relative(ROOT, source).replaceAll("\\", "/");
        if (!relativePath || relativePath === ".") return true;
        const segments = relativePath.split("/");
        if (segments.some((segment) => excludedDirectories.has(segment))) return false;
        if (segments[0] === ".impeccable" && segments[1] === "review") return false;
        if (relativePath === ".env" || (relativePath.startsWith(".env.") && relativePath !== ".env.example")) return false;
        if (relativePath.startsWith("deployments/integration")) return false;
        if (relativePath.startsWith(".vercel/") && relativePath !== ".vercel/project.json") return false;
        return true;
      },
    });
    const result = spawnSync(process.platform === "win32" ? "vercel.cmd" : "vercel", ["deploy", "--prod", "--yes", "--project", "faultline"], {
      cwd: stagingRoot,
      encoding: "utf8",
      windowsHide: true,
      timeout: 20 * 60 * 1000,
      env: environment,
      shell: process.platform === "win32",
    });
    const output = `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
    process.stdout.write(output);
    if (result.error) throw new Error(`Vercel deployment could not start: ${result.error.message}`);
    if (result.status !== 0) throw new Error(`Vercel deployment failed with exit code ${result.status}.`);
    const deploymentUrl = output.match(/"deployment"\s*:\s*\{[\s\S]*?"url"\s*:\s*"(https?:\/\/[^\"]+)"/i)?.[1];
    const productionLine = output.match(/^\s*Production\s*:?\s*(https?:\/\/[^\s]+)/im)?.[1];
    const vercelHosts = [...output.matchAll(/https?:\/\/[a-z0-9][a-z0-9-]*\.vercel\.app/gi)].map((match) => match[0]);
    const productionUrl = (deploymentUrl ?? productionLine ?? vercelHosts[0])?.replace(/[),]+$/, "");
    if (!productionUrl) throw new Error("Vercel reported success but did not return a production URL; inspect the output above before proceeding.");
    const evidenceOrigin = deployment?.fixtureBaseUrl?.trim() || new URL(productionUrl).origin;
    const evidenceUrl = new URL(evidenceOrigin);
    if (evidenceUrl.protocol !== "https:" || evidenceUrl.pathname !== "/" || evidenceUrl.search || evidenceUrl.hash) {
      throw new Error("The fixture evidence host must be a public HTTPS origin without a path.");
    }
    const homepage = await fetch(productionUrl, { redirect: "follow" });
    if (!homepage.ok) throw new Error(`Production URL returned HTTP ${homepage.status}: ${productionUrl}`);
    const homepageHtml = await homepage.text();
    if (!homepage.headers.get("content-type")?.includes("text/html") || !homepageHtml.includes("Faultline")) {
      throw new Error(`Production URL did not serve the Faultline homepage: ${productionUrl}`);
    }
    const fixture = await fetch(new URL("/evidence/manifest.json", productionUrl), { redirect: "follow" });
    if (!fixture.ok) throw new Error(`Production evidence manifest returned HTTP ${fixture.status}; the hosted fixture pages are not available yet.`);
    if (!fixture.headers.get("content-type")?.includes("application/json")) {
      throw new Error("Production evidence manifest returned a non-JSON response; refusing to record it as a public fixture host.");
    }
    const manifest = await fixture.json() as { cases?: unknown[] };
    if (!Array.isArray(manifest.cases) || manifest.cases.length !== 4) {
      throw new Error("Production evidence manifest did not contain all four synthetic cases.");
    }
    const evidenceResponse = await fetch(new URL("/evidence/manifest.json", evidenceUrl.origin), { redirect: "follow" });
    if (!evidenceResponse.ok || !evidenceResponse.headers.get("content-type")?.includes("application/json")) {
      throw new Error(`Configured evidence host did not return a public JSON manifest (HTTP ${evidenceResponse.status}): ${evidenceUrl.origin}`);
    }
    const evidenceManifest = await evidenceResponse.json() as { cases?: unknown[] };
    if (!Array.isArray(evidenceManifest.cases) || evidenceManifest.cases.length !== 4) {
      throw new Error(`Configured evidence host did not serve all four fixtures: ${evidenceUrl.origin}`);
    }
    setEnvValue("FIXTURE_BASE_URL", evidenceUrl.origin);
    if (!deployment || !/^0x[\da-fA-F]{40}$/.test(deployment.contractAddress)) {
      console.log(`Saved verified production evidence origin to the gitignored .env: ${evidenceUrl.origin}`);
      console.log("Next, run npm run deploy, npm run seed:demo, npm run verify:proof, npm run build, and npm run deploy:frontend again to publish the live contract and receipts.");
    } else {
      console.log(`Production Faultline verified at ${productionUrl}; public evidence host ${evidenceUrl.origin} serves all four fixture cases.`);
    }
  } finally {
    const linkedProject = resolve(stagingRoot, ".vercel", "project.json");
    if (existsSync(linkedProject)) {
      const projectConfig = resolve(ROOT, ".vercel", "project.json");
      mkdirSync(resolve(ROOT, ".vercel"), { recursive: true });
      copyFileSync(linkedProject, projectConfig);
    }
    try {
      rmSync(stagingRoot, { recursive: true, force: true });
    } catch (error) {
      console.warn(`Could not remove the temporary Vercel staging folder: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}

main().catch((error: unknown) => {
  console.error(`Frontend deployment stopped: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
