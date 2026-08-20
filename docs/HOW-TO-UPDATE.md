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

## Updating it — from a browser, no terminal

This is the way meant for Jimmie. Nothing to install, no commands.

1. Update the workbook exactly as always — Yahoo paste, formulas, done.
2. Go to the repository on **github.com** and open the `data/workbook/` folder.
3. **Add file → Upload files.** Drag `RBB_League_History.xlsx` in. Commit.
4. Wait about two minutes.

That's it. Uploading the file starts a robot that reads the workbook, rebuilds the
site's data, and commits it; Vercel then redeploys on its own. Replacing the file
with a newer copy of the same name is expected — that is how each update works.

You can also start it by hand without uploading anything: **Actions → "Update
league data" → Run workflow**. Useful after editing `data/managers.yaml`.

### Watching it work

The **Actions** tab shows each run. A green tick means the site is updating. A red
cross means it stopped and changed nothing — click into it and the failing step says
why, in the same plain language as below. The live site is never left broken; it
keeps serving the last good data until a run succeeds.

If the workbook has not actually changed any numbers, the run finishes without
committing and no deployment happens. That is normal.

## Updating it from a terminal

Same thing, if you would rather:

```bash
pnpm snapshot --file /path/to/RBB_League_History.xlsx
git add apps/rbb/data/snapshot.json
git commit -m "Update league data"
git push
```

It prints what it found:

```
Wrote apps/rbb/data/snapshot.json
  255 KB — 9 seasons, 804 games, 8 champions, 15 managers

1 thing(s) worth a look:
  • 2024 has no team with a 1st-place finish in the Finishes sheet …
```

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

## The version with no steps at all

Uploading a file is only a browser away, but it is still a step, and it puts a 12 MB
workbook into the repository each time.

The real goal is for the site to read the **Google Sheets** directly, on a schedule
during the season. Then there is nothing to upload and nothing to click: the sheet
already being maintained every week *is* the update.

Nothing about that is blocked in principle. A GitHub Actions runner has ordinary
internet access and can fetch a link-shared sheet, and Google will hand over a whole
spreadsheet as `.xlsx` from a plain URL:

```
https://docs.google.com/spreadsheets/d/<id>/export?format=xlsx
```

which is a better door than the per-tab CSV endpoint because it arrives as one file,
includes hidden tabs, and can go through the very same reader the local workbook
uses.

What is missing is knowledge of the layout. The Google history sheet is arranged
differently from the Excel workbook — its tabs are `Banners`, `Championships`,
`History`, `Records`, `Game Data`, `Previous Drafts`, `Excel Drop`, not the
`GameData` / `LineupData` / `Finishes` structure the importer knows — and the
environment this was developed in cannot reach Google to look.

So there is a workflow that looks on our behalf:

**Actions → "Read Google Sheets" → Run workflow.**

It downloads each sheet, prints every tab with its size and first few rows into the
run log, and attaches the spreadsheets as artifacts. It reads only: it changes
nothing, commits nothing and deploys nothing. Its output is what the real reader
gets written from — and running it also proves the network path works before any
code depends on it.
