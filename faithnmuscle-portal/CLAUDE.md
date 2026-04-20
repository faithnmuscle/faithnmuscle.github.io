# Faith n Muscle - Client Portal (faithnmuscle-portal)

## What this is
A private member portal for Bernil's fitness coaching clients. Separate repo from the public website (`faithnmuscle.github.io`). Deployed to Cloudflare Pages at **portal.faithnmuscle.com**.

---

## Stack
- Vanilla HTML/CSS/JS - no build tools, no npm, no frameworks
- **Backend**: Supabase (Postgres + Auth + RLS)
- **Hosting**: Cloudflare Pages (auto-deploy from GitHub on push to `main`)
- **Edge functions**: Cloudflare Pages Functions in `/functions/`
- **Storage**: Cloudflare R2 (plan documents + progress photos)
- **Keep-alive**: Cloudflare Worker in `/workers/keepalive.js` (prevents Supabase free tier from pausing)

---

## Key files
| File | Purpose |
|---|---|
| `assets/portal.js` | Shared auth, sidebar, helpers |
| `assets/portal.css` | Dark theme, all shared styles |
| `assets/supabase-client.js` | Supabase SDK init |
| `assets/features.js` | Static feature flags (fallback) |
| `functions/` | Cloudflare Pages Functions (edge, server-side) |
| `admin/` | Admin portal pages |
| `dev.sh` | Local dev server: `bash dev.sh [port]` (Python HTTP server) |

---

## Running locally
```bash
cd faithnmuscle-portal
bash dev.sh       # starts on http://localhost:3000
bash dev.sh 8080  # custom port
```
Local server hits the **remote Supabase database** - there is no local DB.

---

## Auth & roles
- `profiles.role = 'admin'` → Bernil (coach)
- `profiles.role = 'client'` → all clients
- Admin can visit client pages - `initSidebar()` auto-calls `gateClientNav('coaching')` for admins
- Admin has **no row in `plans`** as a client - `getActivePlan(admin_id)` returns null
- Pages that need a plan must handle admin separately (fall back to `'coaching'` for nav gating)

---

## Critical bug pattern (TDZ)
**All `let`/`const` module-level state variables MUST be declared BEFORE the `if/else` gate block that calls `init()` or `loadXxx()`.**

ES modules with top-level `await` execute sequentially. If state vars like `let lastCount = 0` appear AFTER an `await init(plan)` call, they are in the Temporal Dead Zone when `init` runs → silent ReferenceError → page stuck loading.

**Fixed in:** `bookings.html`, `meal-history.html`, `messages.html`, `log-meal.html`

Pattern to follow in every page script:
```js
// 1. imports
// 2. await auth / profile
// 3. ALL module-level let/const state vars
// 4. gate if/else (calls init/loadXxx)
// 5. function declarations (hoisted, safe anywhere)
```

---

## Feature gating
Nav items hidden by default with `style="display:none"` and CSS class:
- `nav-coaching` → shown for coaching plan
- `nav-workout` → shown for coaching/workout/athletes/rehab
- `nav-meal` → shown for coaching/meal
- `nav-progress` → shown for coaching/workout/athletes/rehab
- `nav-photos` → shown for coaching/workout/athletes/rehab

`gateClientNav(planType)` in `portal.js` applies the show/hide logic. Call it explicitly per page OR let `initSidebar()` auto-call it.

---

## Database - key tables
- `profiles` - one per user; `role: 'admin' | 'client'`
- `plans` - client plans; `plan_type: 'coaching' | 'workout' | 'meal' | 'athletes' | 'rehab'`
- `plan_documents` - Bernil's uploaded files per plan (metadata; files in R2)
- `workout_logs` + `workout_exercises` - client workout sessions
- `meal_logs` + `meal_log_entries` - client daily meal logs
- `progress_checkins` - body stats + weekly check-ins
- `bookings` - session booking requests (client → Bernil)
- `availability_templates` - Bernil's weekly schedule
- `availability_blocks` - blocked dates
- `portal_settings` - feature flags + config (key/value)
- `messages` - in-portal messaging per plan
- `notifications` - system notifications per user
- `payments` - manual payment ledger
- `progress_photos` - metadata only; photos in R2

---

## Edit/delete windows
- Workout logs: editable/deletable within **7 days** of `log_date`
- Meal logs: deletable within **7 days** of `log_date`

Cutoff check: `log.log_date >= cutoffStr` where `cutoffStr = new Date() - 7 days` as ISO date string.

---

## Testing rules
- **Localhost testing must never send emails to Bernil or any client.** Any form, notification, or invite triggered during local development must route only to `fvid.pro@gmail.com`.
- Do not use the production portal (`portal.faithnmuscle.com`) as a test target from scripts or automated tools. Use `wrangler pages dev` locally or the Supabase SQL editor for data operations.

---

## Writing style
- **Never use em dashes (`-`)** anywhere - not in UI text, labels, placeholders, comments, or code. Use a hyphen (`-`) or reword the sentence instead.

---

## Delete button style
Use a `×` icon button, not a red danger button:
```html
<button class="btn-icon-delete" title="Delete" style="background:none;border:none;cursor:pointer;padding:0.25rem;color:var(--muted);font-size:1.1rem;line-height:1;">&times;</button>
```

---

## SQL migrations needed (if resetting DB)
Run in Supabase SQL editor:
- `availability_templates`, `availability_blocks`, `bookings` columns, `portal_settings`, `applications` tables
- All have been run on the live Supabase project

---

## Deployment
- Push to `main` → Cloudflare Pages auto-deploys
- Supabase project ref: `omvsxvkwbufskkowqhlr` (ap-southeast-1)
- Portal URL: `portal.faithnmuscle.com`

---

## Pages status
| Page | Status |
|---|---|
| `login.html` | Done |
| `dashboard.html` | Done |
| `my-plan.html` | Done |
| `bookings.html` | Done |
| `log-workout.html` | Done |
| `workout-history.html` | Done (edit + delete within 7 days) |
| `log-meal.html` | Done |
| `meal-history.html` | Done (delete within 7 days) |
| `progress.html` | Done |
| `weekly-checkin.html` | Done |
| `messages.html` | Done |
| `notifications.html` | Done |
| `profile.html` | Done |
| `progress-photos.html` | Done |
| `admin/dashboard.html` | Done |
| `admin/clients.html` | Done |
| `admin/client-detail.html` | Done |
| `admin/bookings.html` | Done |
| `admin/checkins.html` | Done |
| `admin/renewals.html` | Done |
| `admin/payments.html` | Done |
| `admin/applications.html` | Done |
| `admin/settings.html` | Done |
