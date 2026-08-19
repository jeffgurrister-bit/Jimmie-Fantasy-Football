# Setting up Supabase

Step by step, start to finish. About 20 minutes, most of it waiting for the
database to provision and the backfill to run.

You need: a Supabase account (the free tier is plenty — nine seasons is roughly
30 MB), this repo cloned, `pnpm install` already run, and a copy of
`RBB_League_History.xlsx`.

---

## 1. Create the project

1. Go to <https://supabase.com/dashboard> and click **New project**.
2. Name it something like `jimmie-fantasy-football`.
3. **Generate a database password and save it somewhere safe.** Supabase shows it
   once, and you need it in step 2.
4. Pick the region closest to the league — `East US` for Chicago.
5. Create it and wait for provisioning (a minute or two).

> If the password contains `@`, `:`, `/`, `?`, `#` or `%`, either regenerate it
> without them or percent-encode it in the connection string. An unencoded `@`
> silently breaks the URL, because the parser reads it as the start of the
> hostname.

## 2. Get the two connection strings

**Project Settings → Database → Connection string.** There are several, and
**you need two different ones for two different jobs.**

| Job | Which string | Port |
| --- | --- | --- |
| Migrations and the backfill, from your laptop | **Session pooler** | 5432 |
| The website running on Vercel | **Transaction pooler** | 6543 |

Copy both, substituting your real password for `[YOUR-PASSWORD]`:

```
# Session pooler — migrations and backfill
postgresql://postgres.abcdefghijkl:PASSWORD@aws-0-us-east-1.pooler.supabase.com:5432/postgres

# Transaction pooler — the deployed site
postgresql://postgres.abcdefghijkl:PASSWORD@aws-0-us-east-1.pooler.supabase.com:6543/postgres
```

Why two: the deployed site runs as serverless functions that open and close
connections constantly, which is what the transaction pooler is for. Migrations
and a 25,000-row bulk insert want one long-lived connection instead.

> **Avoid the "Direct connection" string** (`db.xxxx.supabase.co:5432`) unless you
> know your network has IPv6. Supabase serves direct connections over IPv6 only,
> and on an IPv4-only network it fails with an unhelpful timeout. The pooler
> addresses are IPv4 and work everywhere.

## 3. Create the schema

From the repo root:

```bash
cp .env.example .env.local
```

Put the **session pooler** string in `.env.local` as `DATABASE_URL`, then:

```bash
export DATABASE_URL='postgresql://postgres.abcdefghijkl:PASSWORD@aws-0-us-east-1.pooler.supabase.com:5432/postgres'
pnpm migrate
```

Expected:

```
  applied 0001_core.sql
  applied 0002_games.sql
  applied 0003_lineups_drafts.sql
  applied 0004_media_dynasty_sync.sql
Applied 4 migration(s).
```

Safe to re-run — applied migrations are skipped.

## 4. Check the identity map, then load the history

```bash
pnpm --filter @jff/sync check-managers
```

You want:

```
All 20 manager identities are confirmed. Cleared to publish.
```

If it lists unconfirmed managers instead, stop and fix `data/managers.yaml` first.
That guard exists so unverified names never reach a public page.

Dry run first — validates and transforms, writes nothing:

```bash
pnpm --filter @jff/sync backfill --file /path/to/RBB_League_History.xlsx --dry-run
```

Then the real load:

```bash
pnpm --filter @jff/sync backfill --file /path/to/RBB_League_History.xlsx
```

Expected, in 30–60 seconds against Supabase:

```
Loaded 804 games across 9 seasons, 24668 lineup rows and 1494 draft picks.
4 thing(s) worth a look:
  • Skipped 1 row(s) in GameData that had no "Name_Yr_Wk" value …
  • Skipped 1 row(s) in Players that had no "Name" value …
  • 2024 has no team with a 1st-place finish in the Finishes sheet …
  • The newest season in this source is 2024 …
```

All four are expected and explained in [OPEN-QUESTIONS.md](./OPEN-QUESTIONS.md).
Re-running is safe: every write is an upsert, so the counts do not change.

## 5. See it locally

```bash
pnpm dev
```

Open <http://localhost:3000>. You should see 9 seasons, 804 games, and the
championship wall.

## 6. Point Vercel at the database

1. Vercel dashboard → your project → **Settings → Environment Variables**.
2. Add:
   - **Name:** `DATABASE_URL`
   - **Value:** the **transaction pooler** string (port **6543**)
   - **Environments:** Production, Preview and Development
3. Add a second variable:
   - **Name:** `PGPOOL_MAX`
   - **Value:** `2`

   Each serverless instance opens its own pool. At the default of 5, a busy
   moment can exhaust the free tier's connection budget. 2 is ample for a
   read-only site.
4. **Redeploy.** Environment variables only apply to builds started after they are
   set: Deployments → the latest → ⋯ → **Redeploy**.

## 7. Verify

Visit the deployed URL. If it still says "Not connected to the database yet", the
variable did not reach the running deployment — check the spelling of
`DATABASE_URL`, that it is enabled for Production, and that you redeployed
*after* adding it.

---

## Keeping it current

For now, updating the site means re-running the backfill after you update the
workbook:

```bash
pnpm --filter @jff/sync backfill --file /path/to/RBB_League_History.xlsx
```

The self-service refresh page (`/admin/sync`), the scheduled sync, and reading
straight from Google Sheets are not built yet — that is Phase 6, and it is what
makes the site genuinely hands-off for Jimmie.

## Things that commonly go wrong

**`DATABASE_URL is not set`** — your shell does not have it exported.
`.env.local` is read by the Next.js app, not by the CLI tools; `export` it for
those.

**Connection times out from your laptop** — you are on the Direct connection on an
IPv4-only network. Switch to the session pooler (step 2).

**`password authentication failed`** — usually an unencoded special character in
the password. Percent-encode it, or reset it to something alphanumeric under
Project Settings → Database.

**`too many connections`** — set `PGPOOL_MAX=2` in Vercel and close any local
`psql` sessions.

**The site loads but every table is empty** — the schema exists but the backfill
has not run against *this* database. Re-run step 4, and confirm the
`DATABASE_URL` you migrated is the same project Vercel is using.

**Deployment succeeds but shows the "not connected" notice** — by design. The site
builds and renders without a database so the pipeline works before the data does.
It means the variable is missing, not that the build broke.
