# How to update the site

Written for Jimmie. No code, no terminal.

## The one-sentence version

**Keep updating your spreadsheets exactly the way you already do.** The website
reads them. Nothing about your weekly routine changes.

## Your weekly routine, unchanged

1. Paste the Yahoo export into `Yahoo Drop` as usual.
2. Let the formulas do their thing into `GameData` and `LineupData`.
3. Copy from the `Google Sheet Paste` tab into `Excel Drop` in the League History
   sheet, as usual.

That's it. The website picks the change up on its own schedule — a few times a day
during the season.

## When you want it updated *right now*

Open the refresh page:

```
https://<the site>/admin/sync?token=<your secret link>
```

Bookmark that link. It's the whole admin interface. It shows you:

- whether the last update worked, in plain English
- when it ran
- how many games, lineups and picks it loaded
- anything that looked off, described in words rather than error codes

Press the button, wait a few seconds, read the result. There is no login, and the
secret in the link is the only thing protecting it — so don't post it in the
league chat.

## What you can change freely

- Add rows. Add whole new seasons. The site picks them up.
- Fix a wrong score or a misspelled player name.
- Reorder columns however you like.
- Add new columns of your own — the site ignores what it doesn't recognise, as long
  as you tell the developer once so it can be listed.

## What will stop the update

Two things:

1. **Renaming or deleting a column the site reads.** The full list is in
   [COLUMN-CONTRACT.md](./COLUMN-CONTRACT.md).
2. **Inserting or deleting a row above the header row** on one of the data sheets.
   The site knows the headers are on row 2 of `GameData`, row 3 of `LineupData`,
   row 4 of `Draft History`, row 2 of `Finishes` and row 2 of `Players`.

If either happens, **nothing breaks publicly.** The update refuses to run, the
site keeps showing the last good data, and the refresh page tells you exactly which
column or sheet it could not find. Put the name back, hit refresh, done.

That is deliberate. The alternative — importing blanks over nine years of history
and quietly publishing it — is the failure mode worth engineering against.

## Changing a manager's name, or adding a new manager

Managers are the one thing the site can't read from the sheets, because the short
names collide: there are two Perkinses, two Joneses, two Malaks and two Joshes. So
there's a small file listing who's who: `data/managers.yaml`.

To add a new manager, or a nickname the sheets started using, edit that file. It
has instructions at the top and is plain text — no code. Each person looks like
this:

```yaml
  - id: jimmie-perkins
    canonical_name: Jimmie Perkins
    display_name: Jimmie
    confirmed: true
    leagues: [rbb]
    aliases: ["Jimmie", "JIMMIE PERKINS"]
```

`aliases` is every spelling your sheets use for that person. If the site meets a
name that isn't listed anywhere, it stops and tells you the name — it will never
guess which person you meant, because guessing wrong would merge two people's
records.

## What "provisional" means on a manager's page

If a manager still shows as provisional, it means nobody has confirmed which human
that spreadsheet name belongs to yet. See
[OPEN-QUESTIONS.md](./OPEN-QUESTIONS.md) — answering questions 1 to 3 clears it.

## If something looks wrong on the site

Check the refresh page first. It records every update and what it noticed. Most
problems say plainly what they are: a season with no champion recorded, a game
missing its opponent's row, a name not in the managers file.
