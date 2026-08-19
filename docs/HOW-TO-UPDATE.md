# How to update the site

Written for Jimmie. No database, no accounts, nothing to set up.

## How it works, in one line

```
your Excel workbook  →  one command  →  a file in the repo  →  the live site
```

The site does not read your spreadsheet directly. One command reads the workbook and
writes everything the site needs into a single file
(`apps/rbb/data/snapshot.json`). That file *is* part of the website. Push it and the
site updates.

Nothing runs in the background, there is no database to maintain, and there is
nothing that can quietly stop working while you are not looking.

## Updating it

1. Update your workbook exactly as you always do — Yahoo paste, formulas, done.
2. Run one command:

   ```bash
   pnpm snapshot --file /path/to/RBB_League_History.xlsx
   ```

   It tells you what it found:

   ```
   Wrote apps/rbb/data/snapshot.json
     255 KB — 9 seasons, 804 games, 8 champions, 15 managers

   1 thing(s) worth a look:
     • 2024 has no team with a 1st-place finish in the Finishes sheet …
   ```

3. Commit and push:

   ```bash
   git add apps/rbb/data/snapshot.json
   git commit -m "Update league data"
   git push
   ```

Vercel rebuilds on its own. A minute later the site is current.

## What the messages mean

The command reports anything odd rather than hiding it. The ones you will see today:

- **"2024 has no team with a 1st-place finish"** — the 2024 playoff results are not
  filled in on the `Finishes` sheet; eight of the twelve teams have no `Playoff`
  value. Fill those in and 2024 gets a champion.
- **"Skipped 1 row … that had no Name_Yr_Wk value"** — the formula row at the very
  bottom of the sheet. Expected, and correctly ignored.

If it stops with an error instead, it names the sheet and the column. That happens
when a column is **renamed or deleted**, or when a row is **inserted above the
header row**. Put it back and re-run. Nothing on the live site changes in the
meantime — it keeps serving the last good data.

## What you can change freely

- Add rows. Add whole new seasons.
- Fix a wrong score or a misspelled player name.
- Reorder columns however you like.
- Add new columns of your own.

The columns the site depends on are listed in
[COLUMN-CONTRACT.md](./COLUMN-CONTRACT.md).

## Adding or renaming a manager

Managers are the one thing the site cannot read from the sheets, because the short
names collide — two Perkinses, two Malaks, three Joneses, two Joshes. So there is a
plain-text file listing who is who: `data/managers.yaml`.

Each person looks like this:

```yaml
  - id: josh-baker
    canonical_name: Josh Baker
    display_name: Yisha
    confirmed: true
    aliases: ["Yisha", "JOSH BAKER", "Josh Baker"]
    leagues:
      - id: rbb
        first_year: 2016
```

`aliases` is every spelling your sheets use for that person; `display_name` is what
the site shows. If the site meets a name that is not listed, it stops and tells you
which name — it will never guess, because guessing wrong would merge two people's
records.

Check it any time:

```bash
pnpm --filter @jff/sync check-managers
```

## Later, if you want it fully hands-off

Updating currently means running one command on a computer. Two future options:

- **A button on the site** — a page you open on your phone that re-reads the Google
  Sheet and updates the site, no computer needed.
- **A schedule** — the site re-reads the sheet a few times a day in season, on its
  own.

Both need the site to read your Google Sheets directly, which is Phase 6. The
snapshot approach came first because it works today with nothing to set up.
