# Heptadec

Data visualization tool — query, explore, and monitor Postgres, Redis, and Quickwit from one place, with teams, dashboards, alerts, and AI.

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
libSQL 8081, Quickwit 7282. Same password, `Delta1force`.

```bash
pnpm compose:test:up
pnpm seed:test            # waits for health, seeds, then verifies every row count
pnpm compose:test:down
```
