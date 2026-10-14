# Estate Land Scan — Abuja and Lagos + Ogun

| Region | Dashboard | Studio |
|---|---|---|
| Abuja (FCT + Nasarawa border) | [`/`](./) | [`studio.html`](studio.html) |
| Lagos + Ogun commuter belt | [`/lagos/`](lagos/) | [`lagos/studio.html`](lagos/studio.html) |

The sections below describe the Abuja edition. The Lagos + Ogun edition works the same way, with two differences: every estate gets two scores (**build in 1–3 years** and **hold 5+ years**, which swaps infrastructure and commute for growth catalysts), and drive times are measured to the nearest of Ikeja, Victoria Island/Lekki Phase 1 or the Lekki Free Trade Zone. Its method is explained at the bottom of the page.

## Abuja edition

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

The same disclaimer, plus an NDPA 2023 privacy notice, is on [privacy.html](privacy.html). Prices on the site are public asking prices.

## Enquiries, WhatsApp and analytics

Visitors can send an enquiry from the land scan and from the studio summary, and can open a WhatsApp chat that names the estate on screen. Edit **`site-config.js`** only. The enquiry form posts JSON to Formspree at `https://formspree.io/f/mvkzbdqq`. The WhatsApp button uses `2347068124363` (+234 706 812 4363). Do not put visitor messages or client names in the repository. The site is public, and the form does not save submissions here.

| Config value | Replace the placeholder with | Left as a placeholder |
|---|---|---|
| `FORM_ENDPOINT` | Set to `https://formspree.io/f/mvkzbdqq`. A Web3Forms URL also works if you switch. | Enquiry form accepts nothing |
| `WEB3FORMS_ACCESS_KEY` | The Web3Forms access key, only if the endpoint is Web3Forms | Required for Web3Forms; ignored for Formspree |
| `WHATSAPP_NUMBER` | Country code and digits only, no plus sign, in the shape `2348XXXXXXXXX` | WhatsApp button is hidden |
| `ANALYTICS_PROVIDER` | `goatcounter` or `plausible` | No analytics script is loaded |
| `GOATCOUNTER_HOST` | Your GoatCounter host, such as `abujaland.goatcounter.com` | GoatCounter stays off |
| `PLAUSIBLE_DOMAIN` | The domain you added in Plausible, such as `username.github.io` | Plausible stays off |

A value still containing `YOUR_` is treated as unset.

### Formspree

`FORM_ENDPOINT` is `https://formspree.io/f/mvkzbdqq`. Leave `WEB3FORMS_ACCESS_KEY` as the placeholder. The form posts JSON (`Accept: application/json`) with `name`, `phone`, `email`, `estate`, `budget`, `buyer_type` and `consent`. The form id is visible in the page source; that is normal for a static site. In the Formspree dashboard, allow AJAX submissions and restrict the form to your GitHub Pages domain if that setting is available.

### Web3Forms

1. Create an access key at [web3forms.com](https://web3forms.com).
2. Set `FORM_ENDPOINT` to `https://api.web3forms.com/submit`.
3. Set `WEB3FORMS_ACCESS_KEY` to that key. It is a public frontend key, not a server secret. Limit it to your domain in the Web3Forms dashboard.

Google Forms cannot be posted to directly from this site (the browser blocks the cross-origin request). Use Formspree or Web3Forms, including a form that forwards mail to you.

### WhatsApp

`WHATSAPP_NUMBER` is `2347068124363` (+234 706 812 4363), digits only, which is the `wa.me` form. The button stays hidden if that value is put back to a `YOUR_` placeholder or is not 8 to 15 digits. The draft message names the estate scorecard on the land scan, or the estate field in the studio. It does not include the visitor’s name, phone, or email.

### Analytics

Leave `ANALYTICS_PROVIDER` as `""` to load nothing. GoatCounter and Plausible are cookieless, advertising-free counters.

- GoatCounter: create a site, then set `ANALYTICS_PROVIDER` to `goatcounter` and `GOATCOUNTER_HOST` to the host in your GoatCounter code (the part before `/count`).
- Plausible: add the GitHub Pages domain, then set `ANALYTICS_PROVIDER` to `plausible` and `PLAUSIBLE_DOMAIN` to that domain.

When analytics are on, the site records a page view plus three events: **Form submit**, **WhatsApp click**, and **Scorecard view**. The scorecard event includes the estate name only. Form contents, phone numbers, and email addresses are not sent.

Do not commit enquiry exports, screenshots of submissions, or Plot-to-Home backups. Studio sessions stay in the browser that created them.
