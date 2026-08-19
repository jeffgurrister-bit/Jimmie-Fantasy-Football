# Open questions for Jimmie

Ordered by how much they block the build. Questions 1–3 change the database
schema's contents, so they come first.

**Jimmie has now supplied the full RBB roster and the Dyno Mites franchise table**,
which resolved questions 2, 3, 11 and 17 outright and reduced the identity blockers
from nine managers to two. Run `pnpm --filter @jff/sync check-managers` at any time
to see what is still outstanding.

---

## Blocking the first real load

### 1. Confirm outright: `Yisha` = Josh Baker, bare `Josh` = Josh Jones — THE LAST BLOCKER

**Status: all but confirmed, needs a definite yes.** Jimmie's roster lists Josh
Baker and Josh Jones as two different people and notes Josh Baker *"might be Yisha
in there"*. That is the mapping now in `data/managers.yaml` — but "might be" is a
hedge, and this one point decides who owns two championships on the front page, so
it stays gated.

Under this mapping **Josh Baker is a two-time champion (2018, 2022)** and **Josh
Jones won 2019**. Get it backwards and both those facts land on the wrong man.

The Google `Banners` tab and the Excel `Finishes` sheet disagree about two
championships:

| Year | Google banner says | `Finishes` 1st place |
| --- | --- | --- |
| 2016 | Jimmie Perkins | Jimmie ✓ |
| 2017 | Ryan Hangartner | Ryan ✓ |
| 2018 | Josh Baker | **Yisha** ✗ |
| 2019 | Josh Jones | Josh ✓ |
| 2020 | Ryan Hangartner | Ryan ✓ |
| 2021 | Jimmie Perkins | Jimmie ✓ |
| 2022 | Josh Baker | **Yisha** ✗ |
| 2023 | Austin Jones | Austin ✓ |
| 2024 | Jim Perkins | (blank — see q5) |

Both mismatches land on the same two names, and both resolve if `Yisha` is Josh
Baker's nickname and bare `Josh` is Josh Jones. Nothing across the nine seasons
contradicts that reading — but it is inference, not evidence.

**Why it matters:** get it backwards and the site credits two championships to
the wrong man, on the front page, on day one.

### ~~2. Full name for every alias~~ — ANSWERED

Jimmie's roster gave all 15, including the three that were missing: **Trevor
Manzke**, **Jared Bosi** and **Nick Jones**. All are in `data/managers.yaml` and
confirmed. The list is exactly 15 names and matches the 15 short names in the
workbook one-for-one.

One loose end, not blocking: **`Joe G.` still has no surname** — Jimmie's own list
also says just "Joe G.", so that may simply be what he goes by.

### ~~3. Are `Joe G.` and `Joe` the same person?~~ — ANSWERED: no

Jimmie's roster lists **Joe Malak** and **Joe G. (Retired)** as separate entries.
Two different Joes. Bare `Joe` in the sheets is Joe Malak; `Joe G.` played 2016 only.

---

## Blocking the historical backfill

### 4. Where does 2025 RBB game and lineup data live?

`GameData`, `LineupData` and `Draft History` all stop at **2024**, but the Google
history sheet already shows a **2025** champion (Joe Malak) and 2025 division
champions.

Is 2025 in the Google sheet only, not yet pulled into Excel? The sync reports the
newest season it found in each source and warns when they disagree, rather than
silently preferring one — but it cannot load data that is not there.

### 5. 2024 postseason results are only half entered

**Refined against the real workbook.** It is not that all of 2024 is blank —
4 of the 12 teams have results and 8 do not, and it is the *top* of the table that
is missing:

| Has a 2024 result | Missing a 2024 result |
| --- | --- |
| Ryan (5th), Austin (6th), Trevor (11th), Josh (12th) | Jerry, Jim, Yisha, Jacob, Jimmie, Jonathan, Joe, Gil |

Jerry finished 1st in the 2024 regular season and Jim 2nd, and neither has a
playoff finish recorded. The Google banner credits Jim Perkins with the title.

So the eight consolation-bracket placings went in and the eight playoff-bracket
placings did not. **The site can show all of 2024's regular season and none of its
postseason until those eight `Playoff` cells are filled in.**

---

## Shape the features, not the schema

### 6. Divisions 2017–2022

`Division` is populated for **2016, 2023 and 2024 only**, and the names changed:

- 2016: `Biscuits`, `Gravy` (two divisions)
- 2017–2022: blank
- 2023–2024: `Bun Spreaders`, `Burnt Biscuits`, `Gravy Goons` (three divisions)

Did the league genuinely run no divisions in those six years, or is the data just
missing? The site currently treats it as genuine and shows no divisional
standings for 2017–2022, which is the safe reading either way.

### 7. Can the banner images be exported as files?

The championship and division banners live inside spreadsheet cells, served from
`docs.google.com/sheets-images-rt/...` URLs. Those URLs are not stable and must
not be hotlinked, so the images need exporting once and committing.

These banners are the emotional centre of a league history page — worth doing
properly even though the brief said "no images really needed".

### 8. Which Google Sheet tabs are canonical, and which are scratch?

Specifically: should the ongoing sync read the `Excel Drop` tab in the RBB League
History sheet, or the `Google Sheet Paste` output on the Excel side? And what is
`Sheet26`?

### 9. Are there hidden tabs the sync needs?

Hidden tabs are known to exist. The gviz reader used for the weekly sync can read
a hidden tab by name, but it cannot enumerate tabs — so any hidden tab the site
needs has to be named explicitly. Listing every tab, hidden included, requires the
Sheets API.

### 10. Power rankings: numbers only, or the commentary too?

The rankings sheet appears to carry blurbs. `power_rankings.blurb` exists in the
schema for them. Worth publishing, or is the commentary group-chat-only?

### 11. Dyno Mites: franchise names or manager names as the primary identity?

DM uses franchise names ("Bolingbrook Busters", "Homer Hound Dogs", "Orland Park
Burnt Ends") alongside manager names; RBB has none. The schema supports either
via `leagues.identity_display`, currently set to `franchise` for DM as a guess.

### 12. Domains — two subdomains off one domain, or two separate domains?

The two leagues should feel like visually distinct sites, since many of the same
people play in both.

---

## Answered by loading the real workbook

Recorded here so nobody re-asks them:

- **The A/B column is perfectly balanced** — 804 `A` and 804 `B`, giving 804 unique
  games and 1,608 team-rows, with no orphans and no unrecognised sides.
- **Nine seasons, 102 team-seasons**, 10 managers in 2016–2018 and 12 from 2019.
- **Divisions exist in 2016, 2023 and 2024 only** — confirmed genuine, not missing.
- **`Reason` never contradicts the roster slot** across all 24,668 lineup rows, so
  "was this player started" is unambiguous.
- **`Drafted From` is the draft slot the team picked from** (`1st`–`12th`), not free
  text. Drafting first is worth it: slot 1 wins 57.9% of regular-season games,
  slot 10 wins 40.5%.
- **`Best BN over STRT` and `Players above Min` are 0/1 flags, not magnitudes.**
  The handoff had this backwards. `BN Gap` is the points margin (−32.00 to 46.45)
  and is what the bench-regret leaderboard must sort on. The worst call in league
  history: Joe benching De'Von Achane's 55.35 points in 2023 week 3, a 46.45 gap.
- **`Undrafted` fills `Round Drafted` and `Drafted By` on 6,734 lineup rows** —
  waiver pickups, not a manager. **`Bye` fills the points columns on 173 rows**,
  matching `Reason = Bye` exactly.
- **Each sheet carries formula scaffolding below the data** (`GameData` and
  `Players` have one such row each), which is skipped by key and reported.
- **There are no hidden tabs in the Excel** — all 10 are visible. Any hidden tabs
  are on the Google Sheets side, which q9 still covers.

## Questions raised while building, not in the original handoff

### ~~13. What do `Wk Hi`, `Wk Lo`, `Sea Hi`, `Sea Lo`, `Car Hi`, `Car Lo` contain?~~ — ANSWERED

They hold the literal words `HIGH` and `LOW`, and are blank otherwise. They are
**flags**, and the counts prove it:

| Column | Rows set | Meaning |
| --- | --- | --- |
| `Wk Hi` / `Wk Lo` | 155 each | one per week across nine seasons |
| `Sea Hi` / `Sea Lo` | 102 each | one per team-season |
| `Car Hi` / `Car Lo` | 15 each | one per manager — a career-best game |

Cross-checked: the highest score in the whole table (Yisha, 210.57, 2019 week 1) is
exactly the row flagged `Car Hi`. They are now stored as booleans with partial
indexes, so "best game in league history" is an index lookup rather than a sort.

`Placed (Reg. S.)`, `Placed (Playoff)` and `Placed (Div/ Conf)` turned out to be
ordinals (`1st`–`12th`) and are stored as integers.

### 16. Is `Jacube` your Jacob? — needs a yes, but low risk

The draft-side sheets spell him **`Jacube`** (1,027 lineup rows, 87 draft picks)
while the team-side sheets say **`Jacob`**. Never both: `Jacob` appears only in
`Team` columns, `Jacube` only in `Drafted By` columns, and `Jacube`'s 87 picks match
Jonathan's and Austin's exactly — all three joined after the league grew.

Treated as the same person, because the backfill cannot run otherwise. Unlike the
Josh/Yisha question this one carries little risk: Jacob holds no championship, so a
wrong guess misattributes draft picks rather than a title. Still worth a yes.

### ~~17a. Where is `Gregg O'Connor`?~~ — ANSWERED

Dyno Mites, running the **Bolingbrook Busters**. Confirmed absent from every sheet
of the RBB workbook, as the data suggested.

### 17b. Did `Joe G.` ever draft?

Still open. He appears in `GameData` (15 games), `LineupData` (235 rows) and
`Finishes` (2016), but `Draft History` holds only 14 names and his is not among
them. Did he inherit a roster, join after the 2016 draft, or were his picks recorded
under someone else's name?

### 18. Two Jonathans — does Dyno Mites ever write a bare "Jonathan"?

`Jonathan Jawor` plays RBB and `Jonathan Barth` plays Dyno Mites. The bare alias
"Jonathan" is assigned to **Jawor**, because that is exactly what the RBB sheets
call him. Barth is only ever matched on his full name.

If the Dyno Mites sheets use a bare "Jonathan" for Barth, the sync will stop and
say so rather than guess — at which point the two need distinguishing at the
source. Same situation with **Mike** and **Arturo Amezcua**, though their first
names differ so there is no clash.

### 14. Is `Fixed` on the `Players` sheet the corrected player name?

It reads like a manual override for misspelled names. It is currently ignored per
the original brief. If it is the corrected name, it should become the canonical
one — worth confirming, because player name quality drives the lineup explorer.

Related, from the real data: the `Players` sheet lists 777 names, but lineups and
drafts reference names it does not carry, so the sync folds those in and ends up
with 825 players. The sheet is a working table, not a complete index — which is
what the brief said, now confirmed.

### 15. Do `Place/Yr` and `Reg/Yr` on `Finishes` hold display strings to reuse?

These are imported and kept as raw text rather than dropped, in case the exact
phrasing is something to show on the site. Safe to discard if not.
