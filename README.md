# Abuja Estate Land Scan

Two static web tools. They need no build step and no server code.

- **`index.html`: Land Scan dashboard.** Estate land projects in the FCT and the Nasarawa border belt, scored 0–100 for value for money for a buyer who plans to build within 1–3 years. It has a clickable map, filters, a score-versus-price chart and a corridor comparison.
- **`studio.html`: Plot-to-Home Studio.** A guided co-design session covering brief, interiors, landscape, energy and summary, with a live cost estimate and a 10-year solar-versus-generator comparison. Sessions are saved only in the browser that runs the studio; use **Back up** and **Restore** to move them.

## Data

`estates.csv` is the master data. The dashboard reads it every time it loads, together with `map_layers.min.json` (roads, the border line and place labels) and `area_market.min.json` (area asking-price benchmarks).

This file is updated by a weekly sync. Please don't edit it here, or the next sync will overwrite your change. Send corrections to the maintainer instead.

## Scoring

| Component | Weight | Basis |
|---|---|---|
| Price | 25% | ₦/sqm against the corridor median, and against an absolute scale from ₦5k to ₦300k. Capped at 50 if the price is stale. |
| Title | 25% | The title the seller claims, from FCDA C of O plus approved plan (95) down to not stated (25). |
| Infrastructure | 25% | How ready the estate is to build in today. |
| Access | 15% | Off-peak drive time to the Central Area. |
| Transparency | 10% | How recent and consistent the pricing is, and whether there are hidden fees. |

Grades: A ≥ 68, B ≥ 60, C ≥ 50, D below 50.

## Important

This is a screening tool, not advice. Titles are as claimed by sellers and have **not** been verified at AGIS or NAGIS. Coordinates are approximate to area level. Do your own title search and site visit before you pay anything.
