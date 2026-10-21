#!/usr/bin/env bash
# Provisions everything a Cloudflare deployment needs, then deploys.
#
# Idempotent: re-running it leaves anything that already exists alone. It is
# safe to run on every deploy.
#
#   pnpm deploy:cloudflare
#
# Configuration comes from environment variables, all optional:
#   HEPTADEC_D1_NAME        D1 database name          (default: heptadec)
#   HEPTADEC_IMAGE_BUCKET   R2 bucket for logos/avatars (default: heptadec-images)
#   BETTER_AUTH_SECRET      set once, then reused forever
#   HEPTADEC_SECRET_KEY     set once, then reused forever — losing it breaks
#                           every stored data-source credential
#   CLOUDFLARE_ACCOUNT_ID   the account the Worker talks to for R2. It is read
#                           from apps/api/wrangler.jsonc, which is where the
#                           deployment's account lives.

set -euo pipefail

cd "$(dirname "$0")/.."

D1_NAME="${HEPTADEC_D1_NAME:-heptadec}"
BUCKET_NAME="${HEPTADEC_IMAGE_BUCKET:-heptadec-images}"
CONFIG="apps/api/wrangler.jsonc"
WRANGLER=(pnpm --filter @heptadec/api exec wrangler)

say() {
  printf '\n\033[1m%s\033[0m\n' "$1"
}

random_secret() {
  node -e 'console.log(require("crypto").randomBytes(32).toString("hex"))'
}

say "1/8 Checking your Cloudflare login"
if ! "${WRANGLER[@]}" whoami >/dev/null 2>&1; then
  echo "Not logged in yet. Run this once, then re-run the deploy:"
  echo
  echo "    pnpm --filter @heptadec/api exec wrangler login"
  echo
  exit 1
fi

# The first step that touches an account is well past the build, so a wrong
# account id surfaces as a failure in step three rather than in step one.
if ! "${WRANGLER[@]}" d1 list >/dev/null 2>&1; then
  echo "Wrangler cannot reach the account in $CONFIG."
  echo "Check the account_id in that file and that your login covers it."
  echo
  exit 1
fi

say "2/8 Building the web app"
pnpm --filter @heptadec/web build

say "3/8 Ensuring the D1 database exists"

# The recorded id belongs to whoever created it, so a fresh account has to make
# its own database and take the new id down. Creating is the only way to tell
# the two apart: wrangler refuses an existing name and prints nothing usable.
write_database_id() {
  node -e '
    const fs = require("fs");
    const [file, id] = process.argv.slice(1);
    const source = fs.readFileSync(file, "utf8");
    const written = /"database_id"\s*:/.test(source)
      ? source.replace(/"database_id"\s*:\s*"[^"]*"/, `"database_id": "${id}"`)
      : source.replace(/("[ \t]*"database_name"[ \t]*:[^\n]*,)/, `$1\n      "database_id": "${id}",`);
    if (written === source) {
      console.error("Could not write database_id into " + file);
      process.exit(1);
    }
    fs.writeFileSync(file, written);
  ' "$CONFIG" "$1"
}

recorded="$(grep -oE '"database_id":[[:space:]]*"[^"]+"' "$CONFIG" | head -1 | sed 's/.*"database_id":[[:space:]]*"\([^"]*\)".*/\1/')"
if created="$("${WRANGLER[@]}" d1 create "$D1_NAME" </dev/null 2>&1)"; then
  database_id="$(printf '%s' "$created" | grep -oE '[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}' | head -1 || true)"
  if [ -z "$database_id" ]; then
    echo "Created the database but could not read its id. Add this to $CONFIG:"
    printf '%s\n' "$created"
    exit 1
  fi
  write_database_id "$database_id"
  echo "Created $D1_NAME and recorded its id in $CONFIG"
elif [ -n "$recorded" ]; then
  echo "Already exists, keeping the id recorded in $CONFIG: $recorded"
else
  echo "$D1_NAME already exists but $CONFIG records no id for it."
  echo "Run this and paste the database_id into $CONFIG:"
  echo "    ${WRANGLER[*]} d1 create $D1_NAME"
  exit 1
fi

say "4/8 Ensuring the image bucket exists"
if "${WRANGLER[@]}" r2 bucket create "$BUCKET_NAME" >/dev/null 2>&1; then
  echo "Created $BUCKET_NAME"
else
  echo "Already exists: $BUCKET_NAME"
fi

say "5/8 Setting secrets that are not already set"
ensure_secret() {
  local name="$1"
  local value="$2"
  if "${WRANGLER[@]}" secret list 2>/dev/null | grep -q "$name"; then
    echo "$name: already set"
    return
  fi
  printf '%s' "$value" | "${WRANGLER[@]}" secret put "$name"
}
ensure_secret BETTER_AUTH_SECRET "${BETTER_AUTH_SECRET:-$(random_secret)}"
ensure_secret HEPTADEC_SECRET_KEY "${HEPTADEC_SECRET_KEY:-$(random_secret)}"

# The R2 access key signs an upload for the browser to PUT straight to the
# bucket. Without it the deployment serves images but cannot replace them, so
# this is part of provisioning rather than an optional extra.
if [ -n "${R2_ACCESS_KEY_ID:-}" ] && [ -n "${R2_SECRET_ACCESS_KEY:-}" ]; then
  ensure_secret R2_ACCESS_KEY_ID "$R2_ACCESS_KEY_ID"
  ensure_secret R2_SECRET_ACCESS_KEY "$R2_SECRET_ACCESS_KEY"
  if [ -n "${R2_SESSION_TOKEN:-}" ]; then
    ensure_secret R2_SESSION_TOKEN "$R2_SESSION_TOKEN"
  fi
else
  echo "R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY not set:"
  echo "  uploads will report image storage as unconfigured (reads still work)"
  echo "  create a key at Cloudflare -> R2 -> Manage R2 -> API Tokens, then:"
  echo "      R2_ACCESS_KEY_ID=… R2_SECRET_ACCESS_KEY=… $0"
fi

# The browser PUTs an upload straight to the bucket, and the browser only lets
# it when the bucket answers the preflight. A bucket with no CORS rule answers
# "CORS not configured" and the upload fails in the browser, not in the API.
say "6/8 Allowing the browser to upload to the bucket"
origin="$(grep -oE '"BETTER_AUTH_URL"[[:space:]]*:[[:space:]]*"[^"]+"' "$CONFIG" | sed 's/.*:[[:space:]]*"\([^"]*\)".*/\1/')"
if [ -n "$origin" ]; then
  cors_file="$(mktemp)"
  cat >"$cors_file" <<JSON
{
  "rules": [
    {
      "allowed": {
        "origins": ["$origin"],
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
  echo "Uploads allowed from $origin"
else
  echo "No BETTER_AUTH_URL in $CONFIG: uploads from a browser are blocked."
fi

# Images are read from the bucket's public URL, which is a property of the bucket
# and not of this deployment, so it is checked rather than configured here.
public_id="$(grep -oE '"R2_PUBLIC_ID"[[:space:]]*:[[:space:]]*"[^"]+"' "$CONFIG" | sed 's/.*:[[:space:]]*"\([^"]*\)".*/\1/')"
if [ -n "$public_id" ]; then
  echo "Reading images from https://pub-$public_id.r2.dev"
  echo "  if avatars 404, public access is off on the bucket:"
  echo "      cf r2 buckets domains managed update $BUCKET_NAME --enabled true"
else
  echo "R2_PUBLIC_ID not set: images will be proxied through the API instead,"
  echo "  which works but costs a request per image."
fi

say "7/8 Applying database migrations"
"${WRANGLER[@]}" d1 migrations apply "$D1_NAME" --remote

say "8/8 Deploying"
"${WRANGLER[@]}" deploy
