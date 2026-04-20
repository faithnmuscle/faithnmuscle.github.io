# Faith n Muscle — Project Context

## What this is
A single-page static website for **Faith n Muscle**, an online personal fitness coaching business run by coach **Bernil**, based in Sri Lanka. The site replaces the original Google Sites page at https://sites.google.com/view/faithnmuscle.

The production site lives in the `faithnmuscle.github.io/` subdirectory and is deployed to GitHub Pages at **https://www.faithnmuscle.com/**.

---

## Project structure
```
CLAUDE.md                              — this file
faithnmuscle.github.io/
  index.html                           — main single-page site
  images/                              — all photos and service images
  apply/
    coaching.html                      — Online 1-on-1 Coaching form page
    workout.html                       — Workout Plan form page
    meal.html                          — Meal Plan form page
    athletes.html                      — Youth & School Athletes form page
    rehab.html                         — Rehab & Flexibility form page
    forms.css                          — shared form styles
    forms.js                           — shared form submit handler (Web3Forms + reCAPTCHA)
  test/
    index.html                         — test hub (links to all 5 test forms)
    coaching.html                      — test copy of coaching form
    workout.html                       — test copy of workout form
    meal.html                          — test copy of meal form
    athletes.html                      — test copy of athletes form
    rehab.html                         — test copy of rehab form
    forms.js                           — test submit handler (emails fvid.pro@gmail.com + saves to portal DB)
  CNAME                                — custom domain: faithnmuscle.com
  robots.txt                           — Allow all; sitemap points to faithnmuscle.com
  sitemap.xml                          — XML sitemap for SEO
```

---

## Tech stack
- Pure HTML/CSS/JS — no build tools, no npm, no frameworks
- Fonts: Google Fonts — **Bebas Neue** (headings) + **Inter** (body)
- Forms: custom HTML forms submitted via **Web3Forms** API
- Form spam protection: **reCAPTCHA v3** (site key: `6LdW5J0sAAAAAFwI7pNZOsvq_NrUoaqJeNpyxMOp`)
- Hosting: **GitHub Pages** (`faithnmuscles/faithnmuscles.github.io` repo, `main` branch)
- Custom domain: **www.faithnmuscle.com** (set via CNAME)

---

## Coach / Business details
| Field | Value |
|---|---|
| Coach name | Bernil |
| Email | bernilwickramasinghe@gmail.com |
| WhatsApp | +94 76 116 7303 |
| Instagram | @bernil500b.c → https://instagram.com/bernil500b.c |
| TikTok | @ichbinbernil → https://tiktok.com/@ichbinbernil |
| Country | Sri Lanka (area served: Worldwide) |

**Certifications:**
- NVQ Level 4 Fitness Trainer
- NVQ Level 4 Sports Massage Therapist
- FOFATO Emergency First Responder

---

## Services & pricing
| Service | Price | Form page |
|---|---|---|
| Online 1-on-1 Coaching | LKR 10,000 / month | `apply/coaching.html` |
| Detailed Workout Plan | LKR 4,500 / plan | `apply/workout.html` |
| Detailed Meal Plan | LKR 6,000 / plan | `apply/meal.html` |
| Youth & School Athletes Training | LKR 4,500 / plan | `apply/athletes.html` |
| Rehab & Flexibility | LKR 5,000 / plan | `apply/rehab.html` |

---

## Web3Forms
- **API endpoint:** `https://api.web3forms.com/submit`
- **Access key:** `345e0bec-46c8-4827-a347-e3d6a4f33189`
- All apply forms POST to Web3Forms which emails Bernil on confirmation
- The `forms.js` shared handler does: client-side validation → reCAPTCHA v3 token → Web3Forms POST → show success or error

---

## SEO / Meta
- Canonical: `https://www.faithnmuscle.com/`
- Open Graph + Twitter Card tags in `<head>`
- Schema.org JSON-LD: `LocalBusiness` + `FAQPage`
- `robots.txt`: Allow all crawlers; sitemap URL included
- `sitemap.xml`: lists all public URLs

---

## Design tokens
```css
--blue:       #004aad    /* primary CTA, buttons */
--blue-mid:   #1565c0    /* hover state */
--blue-light: #4285f4    /* accent, links, labels */
--bg:         #0a0a0a    /* primary background */
--bg2:        #101010    /* alternate section background */
--bg3:        #171717    /* card backgrounds */
--text:       #f0f0f0    /* body text */
--muted:      #888       /* secondary/caption text */
--border:     #1e1e1e    /* dividers and card borders */
```

---

## Page sections (index.html, in order)
| # | Section ID | Background | Notes |
|---|---|---|---|
| 1 | `#hero` | bg + image overlay | Title, subtitle, stats, CTA buttons |
| 2 | `#gallery` | bg | Horizontal photo strip (hover to expand) |
| 3 | `#about` | bg2 | Coach bio + `about-question` lead-in text |
| 4 | *(mission strip)* | blue | Mission / Approach / What You Get |
| 5 | `#services` | bg2 | 5 service cards with pricing |
| 6 | `#how-it-works` | bg2 | 4-step process + image |
| 7 | `#apply` | bg | Apply cards (link to `/apply/*.html` pages) |
| 8 | `#contact` | bg2 | WhatsApp, Instagram, TikTok links |
| 9 | `#faq` | bg | 6 FAQ items |
| 10 | `#disclaimer` | bg2 | Educational purposes / liability notice |
| 11 | `#policies` | bg2 | Privacy (`#privacy-policy`), Terms (`#terms-and-conditions`), Refund (`#refund-policy`) |
| 12 | footer | bg2 | Links + legal + tagline |

---

## Images
| File | Used for |
|---|---|
| `logo.jpg` | Nav logo |
| `hero-bg.jpg` | Hero section background |
| `bernil-coach.jpg` | About section photo |
| `photo1.jpg` | Photo strip |
| `photo2.jpg` | Photo strip + How It Works sidebar |
| `photo3.jpg` | Rehab & Flexibility card |
| `photo4.jpg` | Photo strip |
| `photo5.jpg` | Photo strip + 1-on-1 Coaching card |
| `photo6.jpg` | Available (unused) |
| `photo7.jpg` | Photo strip |
| `photo8.jpg` | Photo strip |
| `photo-athletes.jpg` | Available for athletes card |
| `svc-workout.jpg` | Workout Plan card |
| `svc-meal.jpg` | Meal Plan card |
| `svc-athletes.jpg` | Youth & School Athletes card |
| `svc-rehab.jpg` | Available (replaced with photo3) |

---

## Apply forms (PAR-Q included)
Each apply page includes a **PAR-Q (Physical Activity Readiness Questionnaire)** as Section 1 before service-specific questions, per fitness coaching best practice.

---

## Test server (apply forms)

The `test/` directory is a sandboxed copy of all 5 apply forms for end-to-end testing without touching production.

**Start the test server:**
```bash
cd faithnmuscle.github.io
python3 -m http.server 4000
```
Then open **http://localhost:4000/test/**

**What the test forms do differently from production:**
- Emails go to `fvid.pro@gmail.com` (Web3Forms key `5d162465-2b87-4253-bb24-dcfa3362f964`) — Bernil never receives test emails
- Also POSTs to `https://portal.faithnmuscle.com/api/apply` to save the record in the Supabase `applications` table
- Shows a yellow `TEST MODE` banner at the top of every page
- Subject lines are prefixed with `[TEST]`
- Google Analytics removed
- Production `faithnmuscle.github.io/apply/` files are completely untouched

**To verify a test submission worked:**
1. Check `fvid.pro@gmail.com` for the confirmation email
2. Check `portal.faithnmuscle.com/admin/applications.html` for the new record

**Port conflicts:** Port 3000 is used by the portal dev server (`bash dev.sh` in `faithnmuscle-portal/`). Use 4000 (or any free port) for the main site.

---

## Surge preview (main site)

The main site (`faithnmuscle.github.io/`) is also deployed to Surge.sh as a public preview environment.

**Preview URL:** https://faithnmuscle-preview.surge.sh/

**To redeploy after changes:**
```bash
cd faithnmuscle.github.io
surge . faithnmuscle-preview.surge.sh
```

- Serves the full main site publicly (not just test forms)
- Useful for sharing previews before pushing to production GitHub Pages
- Does **not** replace production at `www.faithnmuscle.com` — that is still GitHub Pages
- Surge account: `fvid.pro@gmail.com`

---

## Portal dev server (port 3000)

The client portal (`faithnmuscle-portal/`) has its own dev server that serves the portal pages locally against the **live Supabase database** (no local DB).

**Start the portal dev server:**
```bash
cd faithnmuscle-portal
bash dev.sh        # starts on http://localhost:3000
bash dev.sh 8080   # custom port if 3000 is taken
```
Then open **http://localhost:3000/**

- Hits the real Supabase project (`omvsxvkwbufskkowqhlr`, ap-southeast-1) — all reads/writes are live
- Cloudflare Pages Functions (`/functions/`) do **not** run locally — R2 uploads and document URL signing won't work without `wrangler pages dev`
- Login with any real portal account (admin or client)

---

## Key rules
- Do **not** add external links back to the original Google Sites
- All policy pages are local anchors: `#privacy-policy`, `#terms-and-conditions`, `#refund-policy`
- Do **not** use `gh` CLI for this project — use plain `git` only
- The working site is in `faithnmuscle.github.io/` subdirectory, **not** the project root
- Never apply changes to production without confirmation
- Do not modify `Web3Forms access_key` or `reCAPTCHA site key` without confirming with owner
- Do **not** modify files in `test/` to match production changes automatically — test forms are intentionally separate
- **Localhost testing must never send emails to Bernil or any client.** Any form submission or notification triggered during local development must route only to `fvid.pro@gmail.com`. Never use Bernil's Web3Forms key (`345e0bec-46c8-4827-a347-e3d6a4f33189`) or any client email address in test code.
