# Open questions for Jimmie

Ordered by how much they block the build. Questions 1–3 change the database
schema's contents, so they come first.

The sync currently **refuses to load real names** until 1–3 are answered — see
`data/managers.yaml`. Run `pnpm --filter @jff/sync check-managers` at any time to
see what is still outstanding.

---

## Blocking the first real load

### 1. Is `Yisha` a nickname for Josh Baker, and does bare `Josh` mean Josh Jones?

This is the most consequential question in the project.

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

### 2. Full name for every alias, plus the years each person played

Needed for: `Joe G.`, `Trevor`, `Nick`, `Jared` — none of these appear in the
Google history sheet, which only names champions and division winners.

Also: `Gregg O'Connor` is named in the Google sheet but matches no short name in
the Excel. Which name does he play under — or is he a Dyno Mites manager?

Already inferred and just needing a yes: Jimmie Perkins, Jim Perkins, Josh Jones,
Josh Baker, Joe Malak, Jerry Malak, Ryan Hangartner, Austin Jones, Jacob
Schmiegelt, Jonathan Jawor, Gil Smit.

### 3. Are `Joe G.` (2016 only) and `Joe` (2017 onward) the same person?

The `.G` suffix suggests two different Joes, which would make this a fourth name
collision alongside the two Perkinses, two Joneses and two Malaks. If they are the
same person, `Joe G.` should be folded into `joe-malak` in `data/managers.yaml`
rather than left as a separate entry.

---

## Blocking the historical backfill

### 4. Where does 2025 RBB game and lineup data live?

`GameData`, `LineupData` and `Draft History` all stop at **2024**, but the Google
history sheet already shows a **2025** champion (Joe Malak) and 2025 division
champions.

Is 2025 in the Google sheet only, not yet pulled into Excel? The sync reports the
newest season it found in each source and warns when they disagree, rather than
silently preferring one — but it cannot load data that is not there.

### 5. 2024 postseason results are blank in `Finishes`

Every 2024 row has empty `Playoff` and `Finals` values, so on the Excel side 2024
has no champion at all. The Google banner credits Jim Perkins. Where are the real
2024 postseason results?

Until this is resolved the site can show 2024's regular season but not its
playoffs, and `pnpm check-managers` will keep reporting it.

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

## Questions raised while building, not in the original handoff

### 13. What do `Wk Hi`, `Wk Lo`, `Sea Hi`, `Sea Lo`, `Car Hi`, `Car Lo` contain?

Are these YES/NO flags marking "this game was a career high", or the numeric high
and low values themselves? They are currently imported as raw text, which is
lossless either way but cannot be sorted or filtered until narrowed. Once we know,
they become the records book's fastest queries.

The same question applies to `Placed (Reg. S.)`, `Placed (Playoff)` and
`Placed (Div/ Conf)`.

### 14. Is `Fixed` on the `Players` sheet the corrected player name?

It reads like a manual override for misspelled names. It is currently ignored per
the original brief. If it is the corrected name, it should become the canonical
one — worth confirming, because player name quality drives the lineup explorer.

### 15. Do `Place/Yr` and `Reg/Yr` on `Finishes` hold display strings to reuse?

These are imported and kept as raw text rather than dropped, in case the exact
phrasing is something to show on the site. Safe to discard if not.
