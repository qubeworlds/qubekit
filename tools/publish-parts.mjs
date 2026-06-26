// Publish the QubeKit PRIMITIVE catalog to the PUBLIC R2 bucket (cdn-qubeworlds),
// served at cdn.qubeworlds.com/qubekit/parts/. Each primitive is a parametric
// descriptor (kind + params) — the canonical record, built into a mesh at
// runtime by the kind->builder registry (like props' {kind:"fedora"}); no baked
// mesh. Writes a canonical asset.json per primitive + a compact index.json, then
// uploads them via wrangler.
//
//   node tools/publish-parts.mjs            # generate + upload
//   node tools/publish-parts.mjs --dry-run  # generate only (./parts-dist)
//
// Needs CLOUDFLARE_API_TOKEN + CLOUDFLARE_ACCOUNT_ID for the qubeworlds account.
import { readFileSync, readdirSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const srcDir = join(root, "catalog/primitives");
const out = join(root, "parts-dist");
const PREFIX = "qubekit/parts"; // cdn.qubeworlds.com/qubekit/parts/
const dryRun = process.argv.includes("--dry-run");

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

const files = [];
const index = [];
for (const f of readdirSync(srcDir).filter((n) => n.endsWith(".json")).sort()) {
  const desc = JSON.parse(readFileSync(join(srcDir, f), "utf8"));
  const slug = desc.id.split("/").pop();
  const rel = `${slug}/asset.json`;
  mkdirSync(join(out, slug), { recursive: true });
  writeFileSync(join(out, rel), JSON.stringify(desc, null, 2) + "\n");
  files.push(rel);
  index.push({
    id: desc.id, kind: desc.kind, name: desc.name, category: desc.category,
    tags: desc.tags ?? [], version: desc.version ?? 1,
    asset: `${slug}/asset.json`, thumbnail: desc.thumbnail ?? null,
  });
}
writeFileSync(join(out, "index.json"), JSON.stringify(index, null, 2) + "\n");
files.push("index.json");
console.log(`generated ${index.length} primitives + index.json -> ${out}`);

if (dryRun) process.exit(0);

for (const key of files) {
  execFileSync("npx", ["wrangler", "r2", "object", "put",
    `cdn-qubeworlds/${PREFIX}/${key}`, `--file=${join(out, key)}`,
    "--content-type=application/json", "--remote"], { stdio: "inherit" });
}
console.log(`published ${files.length} objects -> cdn.qubeworlds.com/${PREFIX}/`);
