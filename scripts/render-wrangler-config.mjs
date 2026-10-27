import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const templatePath = join(repoRoot, "apps/api/wrangler.jsonc.example");
const configPath = join(repoRoot, "apps/api/wrangler.jsonc");

if (existsSync(join(repoRoot, ".env"))) {
  process.loadEnvFile(join(repoRoot, ".env"));
}

function required(name) {
  const value = process.env[name]?.trim();
  if (value === undefined || value === "") {
    throw new Error(`${name} is not set, and the Worker's configuration needs it`);
  }
  return value;
}

function optional(name) {
  return process.env[name]?.trim() ?? "";
}

function escaped(value) {
  return JSON.stringify(value).slice(1, -1);
}

const values = {
  __CLOUDFLARE_ACCOUNT_ID__: required("CLOUDFLARE_ACCOUNT_ID"),
  __CLOUDFLARE_D1_DATABASE_ID__: required("CLOUDFLARE_D1_DATABASE_ID"),
  __R2_BUCKET_NAME__: required("R2_BUCKET_NAME"),
  __R2_PUBLIC_ID__: optional("R2_PUBLIC_ID"),
  __PUBLIC_URL__: required("PUBLIC_URL"),
  __RESEND_FROM__: optional("RESEND_FROM"),
  __BACHS_BASE_URL__: optional("BACHS_BASE_URL"),
  __BACHS_PRICE_MONTHLY__: optional("BACHS_PRICE_MONTHLY"),
  __BACHS_PRICE_YEARLY__: optional("BACHS_PRICE_YEARLY"),
};

const template = readFileSync(templatePath, "utf8");
const rendered = Object.entries(values).reduce(
  (text, [placeholder, value]) => text.replaceAll(placeholder, escaped(value)),
  template,
);

const config = JSON.parse(rendered);

for (const [name, value] of Object.entries(config.vars)) {
  if (value === "") {
    delete config.vars[name];
  }
}

writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`);
console.log(`[config] wrote ${configPath}`);
