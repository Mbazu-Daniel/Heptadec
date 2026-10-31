#!/usr/bin/env bash

set -euo pipefail

cd "$(dirname "$0")/.."

WRANGLER=(pnpm exec wrangler)

say() {
  printf '\n\033[1m%s\033[0m\n' "$1"
}

random_secret() {
  node -e 'console.log(require("crypto").randomBytes(32).toString("base64"))'
}

read_env() {
  [ -f .env ] || return 0
  sed -n "s/^$1=//p" .env | tail -n 1 | sed 's/^"//; s/"$//'
}

export CLOUDFLARE_ACCOUNT_ID="${CLOUDFLARE_ACCOUNT_ID:-$(read_env CLOUDFLARE_ACCOUNT_ID)}"
export R2_PUBLIC_ID="${R2_PUBLIC_ID:-$(read_env R2_PUBLIC_ID)}"
export R2_CUSTOM_DOMAIN="${R2_CUSTOM_DOMAIN:-$(read_env R2_CUSTOM_DOMAIN)}"
export PUBLIC_URL="${PUBLIC_URL:-$(read_env PUBLIC_URL)}"
export RESEND_FROM="${RESEND_FROM:-$(read_env RESEND_FROM)}"
export RESEND_API_KEY="${RESEND_API_KEY:-$(read_env RESEND_API_KEY)}"
export BACHS_BASE_URL="${BACHS_BASE_URL:-$(read_env BACHS_BASE_URL)}"
export BACHS_SECRET_KEY="${BACHS_SECRET_KEY:-$(read_env BACHS_SECRET_KEY)}"
export BACHS_WEBHOOK_SECRET="${BACHS_WEBHOOK_SECRET:-$(read_env BACHS_WEBHOOK_SECRET)}"
export BACHS_PRICE_MONTHLY="${BACHS_PRICE_MONTHLY:-$(read_env BACHS_PRICE_MONTHLY)}"
export BACHS_PRICE_YEARLY="${BACHS_PRICE_YEARLY:-$(read_env BACHS_PRICE_YEARLY)}"
export BETTER_AUTH_SECRET="${BETTER_AUTH_SECRET:-$(read_env BETTER_AUTH_SECRET)}"
export HEPTADEC_SECRET_KEY="${HEPTADEC_SECRET_KEY:-$(read_env HEPTADEC_SECRET_KEY)}"
export R2_ACCESS_KEY_ID="${R2_ACCESS_KEY_ID:-$(read_env R2_ACCESS_KEY_ID)}"
export R2_SECRET_ACCESS_KEY="${R2_SECRET_ACCESS_KEY:-$(read_env R2_SECRET_ACCESS_KEY)}"
export R2_SESSION_TOKEN="${R2_SESSION_TOKEN:-$(read_env R2_SESSION_TOKEN)}"

if [ -z "$CLOUDFLARE_ACCOUNT_ID" ]; then
  echo "CLOUDFLARE_ACCOUNT_ID is not set. Put it in .env or in the environment."
  exit 1
fi

read -r WORKER_NAME DATABASE_NAME BUCKET_NAME < <(node --input-type=module -e '
  import { unstable_readConfig } from "wrangler";
  const config = unstable_readConfig({ config: "wrangler.jsonc" });
  console.log(
    config.name,
    config.d1_databases[0].database_name,
    config.r2_buckets[0].bucket_name,
  );
')

if [ -z "$WORKER_NAME" ] || [ -z "$DATABASE_NAME" ] || [ -z "$BUCKET_NAME" ]; then
  echo "wrangler.jsonc needs a name, a d1_databases entry, and an r2_buckets entry."
  exit 1
fi

remember() {
  local name="$1"
  local value="$2"
  if [ ! -f .env ]; then
    echo "  No .env to save it in. Save this yourself; it cannot be recovered:"
    echo "  $name=$value"
    return
  fi
  if grep -q "^$name=" .env; then
    sed -i "s|^$name=.*|$name=$value|" .env
  else
    printf '\n%s=%s\n' "$name" "$value" >>.env
  fi
  echo "  $name saved to .env"
}

say "1/8 Checking your Cloudflare login"
if ! "${WRANGLER[@]}" whoami >/dev/null 2>&1; then
  echo "Not logged in yet. Run this once, then re-run the deploy:"
  echo
  echo "    pnpm exec wrangler login"
  echo
  exit 1
fi

say "2/8 Ensuring the D1 database exists"
if "${WRANGLER[@]}" d1 info "$DATABASE_NAME" >/dev/null 2>&1; then
  echo "Already exists: $DATABASE_NAME"
else
  "${WRANGLER[@]}" d1 create "$DATABASE_NAME"
fi

say "3/8 Ensuring the image bucket exists"
if "${WRANGLER[@]}" r2 bucket create "$BUCKET_NAME" >/dev/null 2>&1; then
  echo "Created $BUCKET_NAME"
elif "${WRANGLER[@]}" r2 bucket info "$BUCKET_NAME" >/dev/null 2>&1; then
  echo "Already exists: $BUCKET_NAME"
else
  echo "Could not create or read the bucket $BUCKET_NAME" >&2
  exit 1
fi

domain="$("${WRANGLER[@]}" r2 bucket dev-url enable "$BUCKET_NAME" 2>&1 | grep -oE 'pub-[a-f0-9]+' | head -1 || true)"
if [ -n "$domain" ]; then
  R2_PUBLIC_ID="${domain#pub-}"
  remember R2_PUBLIC_ID "$R2_PUBLIC_ID"
  export R2_PUBLIC_ID
  echo "Reading images from https://$domain.r2.dev"
fi

say "4/8 Allowing the browser to upload to the bucket"
if [ -n "$PUBLIC_URL" ]; then
  cors_file="$(mktemp)"
  cat >"$cors_file" <<JSON
{
  "rules": [
    {
      "allowed": {
        "origins": ["$PUBLIC_URL"],
        "methods": ["GET", "HEAD", "PUT"],
        "headers": ["content-type"]
      },
      "exposeHeaders": ["etag"],
      "maxAgeSeconds": 3600
    }
  ]
}
JSON
  "${WRANGLER[@]}" r2 bucket cors set "$BUCKET_NAME" --file "$cors_file" --force
  rm -f "$cors_file"
  echo "Uploads allowed from $PUBLIC_URL"
else
  echo "PUBLIC_URL is not set: uploads from a browser are blocked."
fi

say "5/8 Applying database migrations"
pnpm db:migrate:d1

say "6/8 Building and deploying"
VARS=()
add_var() {
  local name="$1"
  local value="${!name:-}"
  if [ -n "$value" ]; then
    VARS+=(--var "$name:$value")
  fi
}

if deployments="$("${WRANGLER[@]}" deployments list --name "$WORKER_NAME" 2>&1)"; then
  echo "$WORKER_NAME already exists: its dashboard values are left alone"
elif grep -q 'code: 10007' <<<"$deployments"; then
  echo "First deploy: writing the plain values from .env to $WORKER_NAME"
  add_var CLOUDFLARE_ACCOUNT_ID
  add_var R2_PUBLIC_ID
  add_var R2_CUSTOM_DOMAIN
  add_var PUBLIC_URL
  add_var RESEND_FROM
  add_var BACHS_BASE_URL
  add_var BACHS_PRICE_MONTHLY
  add_var BACHS_PRICE_YEARLY
else
  echo "Could not tell whether $WORKER_NAME exists, so nothing was deployed:"
  printf '%s\n' "$deployments"
  exit 1
fi

pnpm run build
if [ ${#VARS[@]} -gt 0 ]; then
  "${WRANGLER[@]}" deploy "${VARS[@]}"
else
  "${WRANGLER[@]}" deploy
fi

say "7/8 Setting secrets that are not already set"
ensure_secret() {
  local name="$1"
  local value="${!name:-}"
  if "${WRANGLER[@]}" secret list 2>/dev/null | grep -q "\"$name\""; then
    echo "$name: already set"
    return
  fi
  if [ -z "$value" ]; then
    value="$(random_secret)"
    echo "$name: not set, generating a value"
    remember "$name" "$value"
  fi
  printf '%s' "$value" | "${WRANGLER[@]}" secret put "$name"
}
ensure_secret BETTER_AUTH_SECRET
ensure_secret HEPTADEC_SECRET_KEY

if [ -n "${RESEND_API_KEY:-}" ]; then
  ensure_secret RESEND_API_KEY
fi
if [ -n "${BACHS_SECRET_KEY:-}" ]; then
  ensure_secret BACHS_SECRET_KEY
fi
if [ -n "${BACHS_WEBHOOK_SECRET:-}" ]; then
  ensure_secret BACHS_WEBHOOK_SECRET
fi

if [ -n "${R2_ACCESS_KEY_ID:-}" ] && [ -n "${R2_SECRET_ACCESS_KEY:-}" ]; then
  ensure_secret R2_ACCESS_KEY_ID
  ensure_secret R2_SECRET_ACCESS_KEY
  if [ -n "${R2_SESSION_TOKEN:-}" ]; then
    ensure_secret R2_SESSION_TOKEN
  fi
else
  echo "R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY not set:"
  echo "  uploads will report image storage as unconfigured (reads still work)"
  echo "  create a key at Cloudflare -> R2 -> Manage R2 -> API Tokens, put both"
  echo "  in .env, then re-run:  pnpm deploy:cloudflare"
fi

say "8/8 Checking that Bachs converts the USD price for local buyers"
node scripts/check-bachs-adaptive-pricing.mjs
