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
| Tests | 121 passing — unit, end-to-end against real Postgres, and 11 against the real workbook |
| `apps/rbb`, `apps/dynomites`, `packages/ui` | **Not built yet** — see below |

### Not built yet

The read-only sites themselves (phases 2–5 of the build plan), the
`/admin/sync` page and its cron trigger (phase 6), and the Dyno Mites–specific
tables' sync. The schema for all of it is in place.

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
