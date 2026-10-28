#!/usr/bin/env bash
# Provisions everything a Cloudflare deployment needs, then deploys.
#
# Idempotent: re-running it leaves anything that already exists alone. It is
# safe to run on every deploy.
#
#   pnpm deploy:cloudflare
#
# This is the laptop path. Pushing to main is the other one: Workers Builds
# reads the same root wrangler.jsonc and runs `pnpm run deploy`.
#
# The deployment's own values come from the environment: the gitignored .env on
# a laptop. The plain ones are written to the Worker on the first deploy, after
# which the dashboard owns them; the secrets are set here and kept.
#   CLOUDFLARE_ACCOUNT_ID   the account to deploy into
#   R2_PUBLIC_ID            the bucket's managed r2.dev domain
#   PUBLIC_URL              the address users open; the app derives its auth
#                           and web URLs from it
#   RESEND_FROM             the sender address
#   BETTER_AUTH_SECRET      read from .env if set, otherwise generated once
#   HEPTADEC_SECRET_KEY     read from .env if set, otherwise generated once —
#                           losing it breaks every stored data-source credential
#
# The database, the bucket, and the Worker's name are not here: they are read
# from wrangler.jsonc, because that is where the deploy resolves its bindings.

set -euo pipefail

cd "$(dirname "$0")/.."

WRANGLER=(pnpm exec wrangler)

say() {
  printf '\n\033[1m%s\033[0m\n' "$1"
}

random_secret() {
  node -e 'console.log(require("crypto").randomBytes(32).toString("base64"))'
}

# One key out of .env, so the values the deployment needs reach the steps
# below without handing .env's other secrets to the ones that push secrets.
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

# Wrangler resolves the D1 database and the R2 bucket by the names in its own
# configuration, so the names come from there rather than from this script: a
# database or bucket provisioned under a different name is one the deploy
# never reads.
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

# A value the deployment has to keep between runs is written back to .env, so
# the next run starts from it rather than from a fresh account.
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

# Wrangler finds the database by the name in wrangler.jsonc, so there is no id
# to record here. Rename it in the configuration before deploying into an
# account that already holds a database called heptadec.
say "2/8 Ensuring the D1 database exists"
if "${WRANGLER[@]}" d1 info "$DATABASE_NAME" >/dev/null 2>&1; then
  echo "Already exists: $DATABASE_NAME"
else
  "${WRANGLER[@]}" d1 create "$DATABASE_NAME"
fi

say "3/8 Ensuring the image bucket exists"
if "${WRANGLER[@]}" r2 bucket create "$BUCKET_NAME" >/dev/null 2>&1; then
  echo "Created $BUCKET_NAME"
else
  echo "Already exists: $BUCKET_NAME"
fi

# The bucket is read from its public domain, so the domain is on and its id
# is known. The id is the bucket's, which the domain's host name carries.
domain="$("${WRANGLER[@]}" r2 bucket dev-url enable "$BUCKET_NAME" 2>&1 | grep -oE 'pub-[a-f0-9]+' | head -1 || true)"
if [ -n "$domain" ]; then
  R2_PUBLIC_ID="${domain#pub-}"
  remember R2_PUBLIC_ID "$R2_PUBLIC_ID"
  export R2_PUBLIC_ID
  echo "Reading images from https://$domain.r2.dev"
fi

# The browser PUTs an upload straight to the bucket, and the browser only lets
# it when the bucket answers the preflight. A bucket with no CORS rule answers
# "CORS not configured" and the upload fails in the browser, not in the API.
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

# The Worker is not rolled out ahead of the schema it reads: the migrations
# land first, so a merge that adds a migration and a Worker that queries it
# never meet in the wrong order.
say "5/8 Applying database migrations"
pnpm db:migrate:d1

# The plain values are only handed to the Worker when it is created. After
# that the dashboard holds them, and passing them again would replace whatever
# an operator edited there: --var always wins, and keep_vars only stops a deploy
# from deleting values it does not mention.
say "6/8 Building and deploying"
VARS=()
add_var() {
  local name="$1"
  local value="${!name:-}"
  if [ -n "$value" ]; then
    VARS+=(--var "$name:$value")
  fi
}

# A Worker that already exists keeps whatever the dashboard holds, so this has
# to tell "first deploy" apart from "could not check" rather than treating any
# failure as a first deploy.
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

# Secrets are set after the first deploy, because a Worker that does not exist
# yet has nowhere to store them. On later runs they are already there and this
# step only reads the list.
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

# The rest are issued elsewhere, so they are only pushed when .env supplies
# them: a generated value would be a key nobody issued.
if [ -n "${RESEND_API_KEY:-}" ]; then
  ensure_secret RESEND_API_KEY
fi
if [ -n "${BACHS_SECRET_KEY:-}" ]; then
  ensure_secret BACHS_SECRET_KEY
fi
if [ -n "${BACHS_WEBHOOK_SECRET:-}" ]; then
  ensure_secret BACHS_WEBHOOK_SECRET
fi

# The R2 access key signs an upload for the browser to PUT straight to the
# bucket. Without it the deployment serves images but cannot replace them, so
# this is part of provisioning rather than an optional extra.
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
