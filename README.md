# Jimmie's Fantasy League History Sites

Two public, read-only, mobile-first league history sites, built from the
spreadsheets the commissioner already maintains.

- **Risky Biscuit Brigade (RBB)** — 2016–present, 12 managers. Full game history
  *and* full weekly lineup history (~24,700 roster rows).
- **Dyno Mites (DM)** — 2025–present, 12 managers, dynasty. Game-level data plus
  offseason activity (trades, valuations, money ledger).

## The constraint that drives the architecture

> "I would just want to be able to update it and not have to bother you with it
> after it's up."

So **the spreadsheets stay the system of record.** There is no admin CMS and no
change to his weekly routine. The site is a third consumer hanging off the end of
the pipeline he already runs:

```
Yahoo export → Yahoo Drop → Yahoo Formatting → GameData / LineupData (Excel)
             → Google Sheet Paste → Excel Drop (Google Sheets)
                                        │
                                        ▼
                              sync  →  Postgres  →  Next.js on Vercel
```

Corollaries, which are enforced in code rather than left to discipline:

- Never write back to the sheets.
- Never ask him to restructure a sheet to suit the code.
- Never recompute a stat he already computes — his definitions win.
- Fail loudly on schema drift; never import nulls over real history.

## What's in this repository right now

| Area | State |
| --- | --- |
| `data/managers.yaml` | Manager identity map, hand-authored, with the unresolved identity questions encoded as hard gates |
| `packages/db` | Postgres schema (4 migrations), migration runner, row types |
| `packages/sync` | Column contract, fail-loud validation, xlsx + Google Sheets readers, transforms, idempotent loader, CLI |
| `docs/` | Column contract (generated), open questions, data model, how-to-update guide |
| Tests | 142 passing — unit, end-to-end against real Postgres, 11 against the real workbook, and 12 asserting the snapshot matches the SQL |
| `apps/rbb` | Next.js site — home, champions, all-time standings, seasons, season detail, manager profiles, records, bench regret. Mobile-first, builds without a database |
| `apps/dynomites`, `packages/ui` | **Not built yet** |

### Not built yet

The `/admin/sync` page and its cron trigger (phase 6), the lineup explorer and
draft browser (phase 3), power rankings (phase 4), and the Dyno Mites site and its
dynasty-table sync (phase 5). The schema for all of it is in place.

### How the site gets its data — no database

`pnpm snapshot --file RBB_League_History.xlsx` reads the workbook and writes
everything the site needs into `apps/rbb/data/snapshot.json` (255 KB), which is
committed. The site imports that file directly, so **every page is statically
prerendered and the deployment needs no database, no connection string and no
environment variables at all.**

That was a deliberate reversal. The original plan went straight to Postgres, which
is right for the *lineup explorer* — filtering 24,668 roster rows live — but wrong
as a prerequisite for a nine-season standings table that fits in a quarter of a
megabyte. Fewer moving parts matters more here than query power the current pages
never use.

The Postgres path in `packages/db` is unchanged and still tested. It is there for
the lineup explorer, and `docs/OPTIONAL-DATABASE.md` covers setting it up when that
arrives. `packages/sync/test/snapshot-parity.test.ts` loads the same workbook both
ways and asserts the JSON aggregations and the SQL agree on every number, so the
two cannot drift.

### Deploying

This is a pnpm monorepo, so each site is its own Vercel project pointed at its own
app folder — the pattern Vercel documents for monorepos.

| Setting | Value |
| --- | --- |
| **Root Directory** | `apps/rbb` |
| Include files outside the root directory | **Enabled** — required, `apps/rbb` imports types from `packages/db` |
| Framework | Next.js (auto-detected) |
| Build / install commands | leave empty — auto-detected |
| Environment variables | none |

There is deliberately no `vercel.json`. An earlier attempt kept Root Directory at
the repo root and used `vercel.json` to redirect the build with `buildCommand` plus
an `outputDirectory` of `apps/rbb/.next`. That is not how Vercel expects Next.js to
be deployed from a monorepo, and it failed. Pointing Root Directory at the app
instead lets normal framework detection do the work.

The Dyno Mites site will be a second project with Root Directory `apps/dynomites`,
sharing the same repository.

### Verified against the real workbook

The full `RBB_League_History.xlsx` has been loaded. **Zero column drift** — all five
sheets matched the contract with nothing missing or unexpected, and every declared
header-row index was correct.

| | |
| --- | --- |
| Seasons | 9 (2016–2024) |
| Games | 804 unique from 1,608 rows — the A/B column is perfectly balanced 804/804 |
| Team-seasons | 102 |
| Lineup rows | 24,668 |
| Draft picks | 1,494 |
| Full backfill | ~20 seconds |

Every game has exactly two sides, no orphans, no unrecognised A/B values, and no
`Reason`/roster-slot contradictions across all 24,668 lineup rows.

Loading it corrected five things the handoff notes had wrong or unknown — see
[docs/OPEN-QUESTIONS.md](docs/OPEN-QUESTIONS.md):

- The six `Wk Hi`/`Car Lo`-style columns are **flags** holding the words `HIGH`/`LOW`,
  not numbers. `career_high` is set on exactly 15 rows — one per manager — and the
  all-time high score is exactly the row flagged. Now booleans with partial indexes.
- **`Best BN over STRT` is a 0/1 flag, not a magnitude.** `BN Gap` carries the points
  margin, and is what the bench-regret leaderboard must sort on.
- **`Drafted From` is the draft slot** (`1st`–`12th`), not free text. Slot 1 wins
  57.9% of regular-season games; slot 10 wins 40.5%.
- **`Undrafted`** fills `Round Drafted` and `Drafted By` on 6,734 rows, and **`Bye`**
  fills the points columns on 173. Declared as sentinels.
- **2024's postseason is half-entered** — 4 of 12 teams have results, and the eight
  missing ones are the top of the table.

**Still not verified:** the Google Sheets. `docs.google.com` is blocked by this
environment's network policy, so the weekly-sync path and the hidden tabs on that
side remain untested. The Excel has no hidden tabs — all 10 are visible.

Three real bugs were caught by running against actual data rather than by
typechecking: `sync_runs` referencing a `leagues` row that did not exist yet, alias
spellings colliding after normalisation (`"JIMMIE PERKINS"` / `"Jimmie Perkins"`),
and the formula-scaffolding row at the bottom of each sheet.

## Getting started

```bash
pnpm install
cp .env.example .env.local          # fill in DATABASE_URL

pnpm --filter @jff/sync check-managers   # what's still unverified
pnpm migrate                             # apply the schema
pnpm --filter @jff/sync backfill --file /path/to/RBB_League_History.xlsx --dry-run
pnpm test
```

`--dry-run` validates and transforms without writing, which is the right first move
against a workbook the sync has not seen before.

To run the end-to-end test, which needs a throwaway Postgres:

```bash
initdb -D /tmp/pg/data -A trust -U jff
pg_ctl -D /tmp/pg/data -o "-h 127.0.0.1 -p 5433" -w start
createdb -h 127.0.0.1 -p 5433 -U jff jff
export DATABASE_URL=postgresql://jff@127.0.0.1:5433/jff PGSSL_DISABLE=1
pnpm migrate && pnpm test
```

It skips itself unless `DATABASE_URL` points at localhost, so `pnpm test` stays safe
to run anywhere.

To run the checks against the real workbook, point at your copy:

```bash
RBB_WORKBOOK_PATH=/path/to/RBB_League_History.xlsx pnpm test
```

These also skip when the variable is unset — the workbook is private and is not
committed.

`check-managers` exits non-zero and lists what is outstanding while any manager
identity is unconfirmed. That is expected today — see below.

## Identity: settled

All 20 managers across both leagues are confirmed, so the sync loads real names with
no override:

```
$ pnpm --filter @jff/sync check-managers
All 20 manager identities are confirmed. Cleared to publish.
```

The question that drove the whole design — whether `Yisha` was Josh Baker — is
answered: it is, and the bare `Josh` is Josh Jones. That reconciles the Google
`Banners` tab with the Excel `Finishes` sheet completely; they had been describing
the same people under different names. **Josh Baker is a two-time champion (2018,
2022)** and **Josh Jones won 2019**, with three managers tied on two titles each.

Had that been guessed the other way, two championships would have sat on the wrong
man's profile from day one — which is why the sync refused to run until it was
confirmed, rather than picking the likelier option.

### Names still collide, so nothing keys off them

Across the two leagues: two Perkinses, two Malaks, **three** Joneses, two Joshes,
two Joes, two Jonathans and two Amezcuas. Every table keys off `managers.id` from
the hand-authored map, and the map refuses to let one alias belong to two people.
League status is per league — Gil Smit still plays RBB and has retired from Dyno
Mites.

## Documentation

- **[docs/DATA-MODEL.md](docs/DATA-MODEL.md)** — read before touching the schema.
  Covers the A/B duplication and the manager identity rule.
- **[docs/COLUMN-CONTRACT.md](docs/COLUMN-CONTRACT.md)** — generated. Which sheet
  columns the site reads, and what breaks it.
- **[docs/OPEN-QUESTIONS.md](docs/OPEN-QUESTIONS.md)** — 15 questions, ordered by
  how much they block.
- **[docs/HOW-TO-UPDATE.md](docs/HOW-TO-UPDATE.md)** — written for Jimmie. One
  command, no database.
- **[docs/OPTIONAL-DATABASE.md](docs/OPTIONAL-DATABASE.md)** — Postgres setup, for
  when the lineup explorer needs it. Not required today.

## Layout

```
apps/rbb          Next.js — Risky Biscuit Brigade    (not built yet)
apps/dynomites    Next.js — Dyno Mites               (not built yet)
packages/ui       shared components                  (not built yet)
packages/db       schema, migrations, row types
packages/sync     column maps, readers, transforms, loader, CLI
data/             the hand-authored manager identity map
docs/             the contract and the handoff docs
```
