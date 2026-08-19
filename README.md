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
| Tests | 97 passing — 88 unit plus 9 end-to-end against a real Postgres |
| `apps/rbb`, `apps/dynomites`, `packages/ui` | **Not built yet** — see below |

### Not built yet

The read-only sites themselves (phases 2–5 of the build plan), the
`/admin/sync` page and its cron trigger (phase 6), and the Dyno Mites–specific
tables' sync. The schema for all of it is in place.

### What has and has not been verified

**Verified.** The pipeline runs end-to-end. A synthetic workbook that mimics the
real one's shape — same header strings, same banner rows above the headers,
`LineupData`'s row of loose integers at index 1, every game stored twice via the
A/B column — is read, validated, transformed and loaded into a real Postgres 16,
and the invariants are asserted: 8 source games become 8 game rows and 16 team
rows (not 16 and 32), every game has exactly two sides, per-manager totals are not
doubled, wins across the league equal games played, blank finishes stay null rather
than becoming last place, divisions attach only to the seasons that had them, and
three consecutive syncs leave every count unchanged.

That end-to-end run caught two real bugs, both now fixed: `sync_runs` referencing a
`leagues` row that did not exist yet, and alias spellings that collapse to the same
normalised key (`"JIMMIE PERKINS"` and `"Jimmie Perkins"`) violating uniqueness.

**Not verified.** The real workbook is not in this repository and
`docs.google.com` was unreachable from the environment this was built in, so the
sync has **not** been run against the actual sources. The column maps are authored
from the documented inspection of the workbook, and a test asserts that the full
transcribed header inventory of all five sheets — 60 / 65 / 14 / 15 / 5 columns —
validates against the maps with nothing missing or unexpected. But the first run
against the genuine file is still the first run. If something is off, the header
validator is what will say so, by name, which is what it is for.

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

`check-managers` exits non-zero and lists what is outstanding while any manager
identity is unconfirmed. That is expected today — see below.

## Before this can go live

`data/managers.yaml` deliberately blocks a real sync. The sheets identify managers
by short first names, and those names collide: two Perkinses, two Joneses, two
Malaks, two Joshes. Cross-referencing the Google `Banners` tab against the Excel
`Finishes` sheet shows the 2018 and 2022 championships landing on different names in
each source, which resolves *if* `Yisha` is Josh Baker's nickname and bare `Josh` is
Josh Jones — but that is inference.

Guess it wrong and the site credits two championships to the wrong man on the front
page. So the sync refuses to load unverified identities rather than picking one:

```
$ pnpm --filter @jff/sync check-managers
9 of 16 manager identities are not confirmed yet: ...
Open questions blocking a verified launch: ...
```

`--allow-unconfirmed` overrides it for local preview, and flags those managers as
provisional. See [docs/OPEN-QUESTIONS.md](docs/OPEN-QUESTIONS.md).

## Documentation

- **[docs/DATA-MODEL.md](docs/DATA-MODEL.md)** — read before touching the schema.
  Covers the A/B duplication and the manager identity rule.
- **[docs/COLUMN-CONTRACT.md](docs/COLUMN-CONTRACT.md)** — generated. Which sheet
  columns the site reads, and what breaks it.
- **[docs/OPEN-QUESTIONS.md](docs/OPEN-QUESTIONS.md)** — 15 questions, ordered by
  how much they block.
- **[docs/HOW-TO-UPDATE.md](docs/HOW-TO-UPDATE.md)** — written for Jimmie, no code.

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
