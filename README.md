# Heptadec

Data visualization tool — query, explore, and monitor Postgres, MySQL, MariaDB, ClickHouse, SQLite, LibSQL, MongoDB, Redis, and Quickwit from one place, with teams, dashboards, alerts, and AI.

**Status:** Phase 1 in progress — auth (email/password, Google, GitHub) via Better Auth, configured and mounted by the API.

- `docs/PRD.md` — canon spec (what we build)
- `PLAN.md` — phases, acceptance criteria, proposals (how we build)
- `impl.html` — original PRD artifact (provenance)
- `AGENTS.md` — rules every contributor and agent follows

## Run it locally

```bash
pnpm install
cp .env.example .env     # then fill BETTER_AUTH_SECRET
pnpm db:migrate          # create the app database (SQLite)
pnpm compose:up          # demo Postgres, MySQL, Redis
pnpm dev                 # API on :8787, web on :5173
pnpm test                # persistence tests (Vitest)
```

Sign in at http://localhost:5173 with email + password. Google/GitHub buttons appear
once `GOOGLE_CLIENT_ID/SECRET` and `GITHUB_CLIENT_ID/SECRET` are set in `.env`.

## Deploy to Cloudflare

One command provisions everything the Worker needs and ships it:

```bash
pnpm --filter @heptadec/api exec wrangler login   # once per machine
pnpm deploy:cloudflare
```

The script is idempotent, so re-running it on every deploy is the intent. In order it
does the following, skipping anything already in place:

| Step | What it creates |
|---|---|
| Build | `apps/web/dist`, served by the Worker as static assets |
| D1 | `heptadec` database, recording its id in `apps/api/wrangler.jsonc` if it is the first run |
| R2 | `heptadec-images` bucket, bound as `IMAGES` |
| Secrets | `BETTER_AUTH_SECRET` and `HEPTADEC_SECRET_KEY`, generated on first run |
| Migrations | every file in `packages/db/drizzle`, applied to D1 |
| Deploy | one Worker carrying the API, the cron trigger, and the SPA |

Set `BETTER_AUTH_SECRET` and `HEPTADEC_SECRET_KEY` in the environment before the first
run if you want to choose them. They are read back from the Worker on later runs, never
regenerated — `HEPTADEC_SECRET_KEY` in particular encrypts stored data-source
credentials, so replacing it makes every saved connection unreadable.

After the first deploy, put the Worker URL in the `vars` block of
`apps/api/wrangler.jsonc` (`BETTER_AUTH_URL` and `WEB_URL`) and deploy again if you did
not already.

`HEPTADEC_D1_NAME` and `HEPTADEC_IMAGE_BUCKET` override the resource names.

### Image storage is optional

Organization logos and member avatars live in the R2 bucket under `logos/` and
`avatars/`, served by `GET /api/images/…`. Nothing else depends on them. To run without
it, delete the `r2_buckets` block from `apps/api/wrangler.jsonc` and remove the bucket —
the settings pages then say *"Image storage is not configured on this deployment"*
instead of offering an upload, and the API answers the same way if something calls it
directly.

## Demo databases

`pnpm compose:up` starts the three engines on their default ports, so a GUI client
(Beekeeper Studio, DBeaver, TablePlus) can reach them without remapping anything.
Password is `Delta1force` everywhere. These are throwaway local databases — never
reuse this password anywhere else.

| Engine | Host | Port | User | Password | Database |
|---|---|---|---|---|---|
| Postgres | localhost | 5432 | postgres | Delta1force | heptadec_demo |
| MySQL | localhost | 3306 | heptadec | Delta1force | heptadec_demo |
| Redis | localhost | 6379 | — | Delta1force | db 0 |

MySQL accepts either `heptadec` or `root`, both with `Delta1force`. Redis needs no
username, just the password.

Postgres seeds itself from `docker/initdb/01-schema.sql` on first start: 8 tables and
7 foreign keys across regions, categories, suppliers, products, and the orders chain,
which is what gives the entity-relationship diagram something to draw.

Changing a password in `docker-compose.yml` does not change an existing volume, because
the password is stored in the data directory on first init. Run `pnpm compose:down -v`
to wipe and re-apply.

## Test databases

`pnpm compose:test:up` starts a wider matrix on offset ports so it can run alongside the
demo stack: Postgres 5434, MySQL 3308, MariaDB 3309, Redis 6381, ClickHouse 8124,
libSQL 8081, Quickwit 7282, MongoDB 27018. Same password, `Delta1force`.

```bash
pnpm compose:test:up
pnpm seed:test            # waits for health, seeds, then verifies every row count
pnpm compose:test:down
```
