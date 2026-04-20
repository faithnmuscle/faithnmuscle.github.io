# Faith n Muscle — Member Portal: Requirements & Architecture Plan

## Context
The current site is a pure static HTML/CSS/JS site on GitHub Pages with no backend, no user accounts, and no database. Applications are submitted via Web3Forms and emailed to Bernil — there is no follow-up system for clients after they pay. This plan defines what is needed to build a **member portal** at `portal.faithnmuscle.com` where clients can book sessions, log workouts, and log meals — with features gated by the plan they have purchased. It also covers what Bernil needs as an admin. Security is treated as a first-class requirement throughout.

> **UX principle:** Every feature must be seamless and user-friendly first. Complexity lives in the backend; the interface should feel effortless — minimal taps, obvious actions, no dead ends.

> **Build philosophy (Bernil's words):** *"Let's start small and move slowly TOGETHER!"* — roll out each phase only when it's genuinely easier and more useful than what exists today. Don't ship complexity for its own sake.

> **Admin UX note:** Bernil is not technical. Every admin screen must use plain language, guided flows, and one-click actions. No raw data tables, no jargon, no multi-step forms where a single screen will do.

### Why this portal exists
Before this portal, Bernil considered using the **Hevy app** (great exercise library, free for clients) for workout tracking — but the coach version that lets him see client progress is expensive and considered overrated. Google Sheets were tried as a stopgap but aren't attractive or structured enough. The portal directly replaces the need for a paid third-party coaching app and gives Bernil full visibility into every client's journey at zero recurring cost.

---

## 1. Technology Stack

| Layer | Choice | Why |
|---|---|---|
| Backend / DB | **Supabase** (Postgres + Auth + Storage) | Relational data fits SQL perfectly; Row-Level Security enforces ownership at the DB layer; free tier handles a small coaching business; SDK loads from CDN — no build tools needed |
| Portal hosting | **Cloudflare Pages** | Free, global CDN, no cold starts, custom domain, automatic HTTPS, supports edge functions |
| Transactional email | **Resend** (free: 3,000/month) | Reliable auth + notification emails; replaces Supabase's default sender |
| Portal URL | `portal.faithnmuscle.com` | Clean separation; existing site on GitHub Pages is completely untouched |
| Frontend | **Vanilla HTML/CSS/JS** | Matches zero-toolchain philosophy; no npm, no framework |

The existing `faithnmuscle.github.io` repo and GitHub Pages deployment are **not touched**.

### Cost at launch (free tier)
| Service | Cost |
|---|---|
| Supabase | $0 |
| Cloudflare Pages + R2 + Workers | $0 |
| Resend (email) | $0 |
| GitHub (repo) | $0 |
| **Total** | **$0/month** |

Scale trigger: upgrade Supabase to Pro ($25/month) only if the business grows beyond ~50 active clients or the DB approaches 500MB.

---

## 2. Security Architecture (State of the Art)

### Authentication
- **Supabase Auth** with email + password (bcrypt hashed, salted — never stored plaintext)
- **Passwords enforced:** minimum 12 characters, at least one uppercase, one number, one symbol — validated both client-side and enforced via Supabase Auth config
- **Magic-link invite flow** for new clients (Bernil creates the account; client sets their own password via a one-time signed link — they never share a password with anyone)
- **Password reset** via time-limited signed tokens (1 hour expiry) sent to registered email
- **Account lockout:** Supabase Auth built-in rate limiting — max 5 failed logins before temporary lockout + CAPTCHA prompt
- No self-registration: accounts are created by Bernil only after confirming payment — eliminates unauthorized access entirely

### Session Security
- **Short-lived JWTs** (1-hour expiry) with auto-refresh via Supabase's refresh token rotation
- **Refresh token rotation:** each use issues a new refresh token and invalidates the old one — prevents token replay attacks
- Tokens stored in `localStorage` (Supabase default); optionally upgraded to `httpOnly` cookies via Supabase SSR helpers if session hijacking risk is a concern
- **Sign-out invalidates the session** server-side (Supabase revokes the refresh token)
- Idle session auto-logout after 30 minutes of inactivity (client-side timer that calls `supabase.auth.signOut()`)

### Data Access Control — Row-Level Security (RLS)
Every table has RLS enabled. Policies enforce:
- Clients can only read/write **their own rows** — no client can see another client's data
- Admin (`role = 'admin'` on `profiles`) can read all rows — enforced in SQL, not just JS
- All writes validated by RLS — even if a client crafts a raw API call, they cannot insert/update rows they don't own
- `service_role` key (bypasses RLS) is **never exposed client-side** — it lives only in a Cloudflare Pages Function (edge function, server-side)

### Transport Security
- **TLS 1.3 only** on Cloudflare Pages (enforce minimum TLS version in Cloudflare settings)
- **HSTS** header with `max-age=31536000; includeSubDomains; preload` — forces HTTPS forever
- **Content Security Policy (CSP):** strict CSP header on all portal pages — `default-src 'self'`; only Supabase and CDN fonts/scripts explicitly whitelisted
- **CORS:** Supabase project CORS allows only `portal.faithnmuscle.com` and `www.faithnmuscle.com`

### Secrets Management
```
Client-side (safe to expose in JS):
  SUPABASE_URL       = https://xxxx.supabase.co
  SUPABASE_ANON_KEY  = eyJ...  (anon key — RLS enforces all access control)

Server-side only (Cloudflare env variable, never in code):
  SUPABASE_SERVICE_ROLE_KEY  (only used in functions/create-user.js edge function)
  VAPID_PRIVATE_KEY          (only used in functions/push-notify.js)
```

### File / Document Security
- **Both plan documents and progress photos stored in Cloudflare R2** — Supabase Storage not used at all; eliminates the 500MB cap and 5GB/month egress limit entirely
- All R2 buckets are private — no object is publicly accessible by URL
- Clients receive **presigned URLs** (10-minute expiry) generated server-side via Pages Functions
- Plan documents: only admin JWT can write; clients get read-only presigned URLs for their own plan
- Progress photos: client uploads enforced within quota (see below); server-side check is authoritative

### Input Security
- All user-facing inputs sanitised before display (no raw `innerHTML` with user data — use `textContent`)
- Server-side: Supabase Postgres constraints enforce field types, lengths, and enums — malformed data rejected at the DB layer
- No dynamic SQL — all queries use Supabase's parameterised query builder (PostgREST), eliminating SQL injection

### Audit & Monitoring
- Supabase Auth logs all sign-in, sign-out, password reset, and failed login events — visible in Supabase Studio
- Cloudflare Analytics logs all requests to the portal — DDoS protection built-in at Cloudflare's network layer

---

## 3. Database Schema

### `profiles` — one row per user, extends `auth.users`
```
id              uuid PK → auth.users(id)
full_name       text
email           text
contact_phone   text
age             int
sex             text        ('Male' | 'Female' | 'Other')
height_cm       numeric
weight_kg       numeric
target_weight_kg numeric
role            text        DEFAULT 'client' ('client' | 'admin')
country         text        DEFAULT 'LK'   ← ISO 3166-1 alpha-2; **set by Bernil when creating the client account** (he knows where the client is from); drives LKR vs USD display. Do not rely on browser auto-detection — timezone shares across countries (e.g. Asia/Colombo covers both Sri Lanka and India) make it unreliable.
timezone        text        DEFAULT 'Asia/Colombo'  ← IANA timezone, auto-detected on first login
pinned_note     text        ← Bernil's at-a-glance reminder (e.g. "knee injury — avoid squats")
created_at      timestamptz
```
*Created automatically via a DB trigger on `auth.users` insert.*

### `plans` — which service a client is enrolled in
```
id              uuid PK
client_id       uuid → profiles(id)
plan_type       text  ('coaching' | 'workout' | 'meal' | 'athletes' | 'rehab')
status          text  ('pending' | 'active' | 'expired' | 'cancelled')
start_date      date
end_date        date  (null = open-ended, e.g. monthly coaching)
price_lkr       int
notes           text  (Bernil's private notes)
created_at      timestamptz
```

### `plan_documents` — files Bernil uploads per plan
```
id              uuid PK
plan_id         uuid → plans(id)
file_name       text
storage_path    text  (Supabase Storage path)
file_type       text  ('workout_program' | 'meal_program' | 'general')
description     text
uploaded_by     uuid → profiles(id)
created_at      timestamptz
```

### `availability_slots` — Bernil's bookable time slots
```
id              uuid PK
slot_date       date
start_time      time
end_time        time
slot_type       text  DEFAULT 'checkin'
is_available    boolean DEFAULT true
UNIQUE(slot_date, start_time)
```

### `bookings` — client booking requests
```
id              uuid PK
slot_id         uuid → availability_slots(id)
client_id       uuid → profiles(id)
plan_id         uuid → plans(id)
status          text  ('pending' | 'approved' | 'rejected' | 'cancelled' | 'completed')
client_notes    text
coach_notes     text
session_link    text  (Google Meet / Zoom URL)
created_at      timestamptz
UNIQUE(slot_id)   ← prevents double-booking at DB level
```

### `workout_logs` — one row per session
```
id              uuid PK
client_id       uuid → profiles(id)
plan_id         uuid → plans(id)
log_date        date DEFAULT today
session_name    text
duration_min    int
perceived_effort int  (RPE 1–10)
body_weight_kg  numeric
overall_notes   text
created_at      timestamptz
```

### `workout_exercises` — exercises within a session
```
id              uuid PK
log_id          uuid → workout_logs(id) ON DELETE CASCADE
exercise_name   text
sets_completed  int
reps_per_set    text   (allows "8/8/7" notation)
weight_kg       numeric
notes           text
sort_order      int
```

### `meal_logs` — one row per client per day
```
id              uuid PK
client_id       uuid → profiles(id)
plan_id         uuid → plans(id)
log_date        date
water_ml        int
overall_notes   text
UNIQUE(client_id, log_date)
```

### `meal_log_entries` — individual meals within a day
```
id              uuid PK
meal_log_id     uuid → meal_logs(id) ON DELETE CASCADE
meal_slot       text  ('Breakfast' | 'Morning Snack' | 'Lunch' | 'Afternoon Snack' | 'Dinner' | 'Evening Snack' | 'Other')
food_items      text
portion_notes   text
calories_kcal   int   (optional)
protein_g       numeric
carbs_g         numeric
fat_g           numeric
sort_order      int
```

### `progress_checkins` — periodic body stat snapshots
```
id              uuid PK
client_id       uuid → profiles(id)
plan_id         uuid → plans(id)
checkin_date    date DEFAULT today
body_weight_kg  numeric
chest_cm / waist_cm / hips_cm / thighs_cm / arms_cm  numeric (optional)
energy_level / mood_level / sleep_quality  int (1–10)
notes           text
```

### `notifications`
```
id              uuid PK
user_id         uuid → profiles(id)
type            text  ('booking_approved' | 'booking_rejected' | 'plan_assigned' | 'document_uploaded' | 'booking_request' | 'message' | 'checkin_reviewed')
title           text
body            text
is_read         boolean DEFAULT false
related_id      uuid
created_at      timestamptz
```

### `weekly_checkins` — structured weekly check-in submitted by clients
```
id              uuid PK
client_id       uuid → profiles(id)
plan_id         uuid → plans(id)
week_start_date date NOT NULL
adherence_pct   int          (0–100, workout adherence this week)
energy_level    int          (1–10)
sleep_quality   int          (1–10)
stress_level    int          (1–10)
client_note     text         (free-text message to Bernil)
coach_reply     text         (Bernil's response)
reviewed_at     timestamptz
created_at      timestamptz
UNIQUE(client_id, week_start_date)
```

### `progress_photos` — client progress photo uploads
```
id              uuid PK
client_id       uuid → profiles(id)
plan_id         uuid → plans(id)
photo_date      date NOT NULL
angle           text         ('front' | 'side' | 'back' | 'other')
storage_path    text         (Supabase Storage, private bucket 'progress-photos')
notes           text
created_at      timestamptz
```
**Photos stored in Cloudflare R2 — not Supabase Storage.** Supabase only holds the metadata row. The actual file lives in R2.

**Why R2:**
- Free tier: **10GB + zero egress fees**
- Private bucket — all access via short-lived presigned URLs
- Native Cloudflare Pages Function integration — no extra API keys
- Keeps Supabase Storage free for plan documents only

**Upload flow:** client compresses photo in-browser → calls `upload-photo.js` Function → Function verifies JWT → writes to R2 at `{user_id}/{date}/{angle}.jpg` → inserts metadata row into Supabase

**View flow:** fetch metadata from Supabase → call `photo-url.js` Function per photo → Function verifies JWT + issues 10-min R2 presigned URL → used as `<img src>`

**Security:** R2 bucket fully private; presigned URLs expire in 10 min; Function verifies Supabase JWT before issuing any URL; R2 paths prefixed with `user_id` — path traversal structurally impossible

**Compression (client-side, Canvas API):**
- Max 1080px longest side, JPEG 82% quality
- 5MB phone photo → ~200–350KB
- 5MB raw file cap before compression; JPEG output regardless of input format

**Upload quota (enforced server-side in `upload-photo.js`):**
- Max **3 photos per upload date** (one per angle: front, side, back)
- Max **2 upload dates per calendar month** per client
- Quota checked by counting existing `progress_photos` rows before accepting the upload — if exceeded, Function returns 429; file never reaches R2
- Client-side UI hides the upload button when quota is met, but server is the authoritative gate

**Storage estimate:** 2×/month × 3 angles × ~300KB × 20 clients = ~36MB/month — **10GB free tier lasts 23+ years**

### `nutrition_targets` — Bernil sets daily macro targets per plan
```
id              uuid PK
plan_id         uuid → plans(id) UNIQUE
calories_kcal   int
protein_g       numeric
carbs_g         numeric
fat_g           numeric
water_ml        int          DEFAULT 2000
set_by          uuid → profiles(id)
updated_at      timestamptz
```
RLS: clients can read targets for their own plans; admin can insert/update.

### `messages` — in-portal messaging between client and Bernil
```
id              uuid PK
plan_id         uuid → plans(id)
sender_id       uuid → profiles(id)
body            text NOT NULL
is_read         boolean DEFAULT false
created_at      timestamptz
```
RLS: clients can read/insert messages on their own plans; admin can read/insert all.

### `push_subscriptions` — Web Push API subscriptions per device
```
id              uuid PK
user_id         uuid → profiles(id)
endpoint        text NOT NULL
p256dh_key      text NOT NULL
auth_key        text NOT NULL
user_agent      text
created_at      timestamptz
UNIQUE(endpoint)
```
RLS: users can insert/delete their own subscriptions; admin can read all.

### `payments` — manual payment ledger entries
```
id              uuid PK
client_id       uuid → profiles(id)
plan_id         uuid → plans(id)
paid_date       date NOT NULL
amount_lkr      int NOT NULL
method          text         ('bank_transfer' | 'cash' | 'card' | 'other')
currency        text         DEFAULT 'LKR'   ← 'LKR' | 'USD' | 'EUR' | 'GBP'; auto-set from profiles.country at payment creation
period_label    text         (e.g. 'April 2026', 'One-time plan')
notes           text
recorded_by     uuid → profiles(id)
created_at      timestamptz
```
RLS: clients can read their own payment rows; admin can insert/update/read all.

> **Payment gateway (future, not current phases):** Bernil envisions separating Sri Lankan clients (LKR + local bank transfer) from foreign clients (USD/EUR/GBP). For foreign clients he wants eventual Stripe/PayPal integration — but this is **deferred**: he needs to set up his own Stripe and PayPal business accounts first, and is concerned about transaction fees. **No payment gateway integration in Phases 0–8.** Manual ledger only. Revisit as a Phase 9 once Bernil has set up accounts and reviewed fee structures.

### `plan_templates` — reusable program templates (Bernil's library)
```
id              uuid PK
name            text NOT NULL
plan_type       text           ('coaching' | 'workout' | 'meal' | 'athletes' | 'rehab')
description     text
created_by      uuid → profiles(id)
created_at      timestamptz
```

### `template_sessions` — sessions within a template
```
id              uuid PK
template_id     uuid → plan_templates(id) ON DELETE CASCADE
session_name    text NOT NULL
day_label       text           (e.g. 'Day 1', 'Monday')
sort_order      int
notes           text
```

### `template_exercises` — exercises within a template session
```
id              uuid PK
session_id      uuid → template_sessions(id) ON DELETE CASCADE
exercise_name   text NOT NULL
sets            int
reps            text           (e.g. '8–10', '3×12')
weight_note     text           (e.g. '70% 1RM', 'bodyweight')
rest_seconds    int
notes           text
sort_order      int
```

### `program_sessions` — assigned interactive program per plan
```
id              uuid PK
plan_id         uuid → plans(id) ON DELETE CASCADE
session_name    text NOT NULL
day_label       text
sort_order      int
notes           text
```

### `program_exercises` — exercises in an assigned program session
```
id              uuid PK
session_id      uuid → program_sessions(id) ON DELETE CASCADE
exercise_name   text NOT NULL
sets            int
reps            text
weight_note     text
rest_seconds    int
notes           text
sort_order      int
```
When a client taps "Start this workout", exercises pre-populate into a new `workout_log` + `workout_exercises`. Client fills in actual weights/reps only.

---

## 4. Feature Access Matrix

| Feature | 1-on-1 Coaching | Workout Plan | Meal Plan | Youth Athletes | Rehab |
|---|---|---|---|---|---|
| Book sessions | YES | — | — | — | — |
| Log workouts | YES | YES | — | YES | YES |
| Log meals | YES | — | YES | — | — |
| Progress check-ins | YES | YES | — | YES | YES |
| View workout documents | YES | YES | — | YES | YES |
| View meal plan documents | YES | — | YES | — | — |
| Interactive program viewer | YES | YES | — | YES | YES |
| Weekly check-in form | YES | YES | — | YES | YES |
| In-portal messaging | YES | YES | YES | YES | YES |
| Progress photos | YES | YES | — | YES | YES |
| Macro targets bar | YES | — | YES | — | — |
| Visual trend charts | YES | YES | YES | YES | YES |
| Push notifications | YES | YES | YES | YES | YES |

Feature gating enforced in two places: (1) client-side JS hides/shows nav items based on `plan_type`; (2) Supabase RLS policies block writes to tables not permitted for a given plan — bypassing the UI still hits a wall.

---

## 4b. Additional Features

### Streak & Consistency Tracker
- Computed on the dashboard from existing `workout_logs` and `meal_logs` — no new table needed
- Shows current consecutive days logged and longest streak ever
- Resets at midnight in the **client's local timezone** (see Timezone Handling below)

### Pinned Client Note (Bernil's at-a-glance reminder)
- `pinned_note` text field on `profiles` (persists across plan renewals)
- Always shown at the top of `/admin/clients/:id` in a highlighted card (e.g. "⚠️ Knee injury — avoid deep squats")
- Bernil edits it inline with one click

### Timezone Handling
- `timezone` field on `profiles` (IANA string, e.g. `'Asia/Colombo'`, `'America/New_York'`)
- Auto-detected from `Intl.DateTimeFormat().resolvedOptions().timeZone` on first login; client can override in `/profile`
- All dates/times stored as UTC in the database; displayed in the client's local timezone in the UI
- Booking slots show both timezones: "9:00 AM your time / 2:30 PM Bernil's time"
- Streak calculation uses the client's local midnight, not UTC midnight
- Admin always sees times in Sri Lanka time (UTC+5:30)

---

## 5. UX Principles (Applied Throughout)

- **Mobile-first:** all pages designed for 375px viewport first; desktop is an enhancement
- **Minimal taps:** dashboard surfaces the most common action for each plan type front and centre
- **Auto-save where possible:** meal logging, message drafts — no lost data on accidental navigation
- **Inline feedback:** loading states, success toasts, and inline errors on every form — no blank screens
- **Empty states:** every list/history page has a helpful empty state with a clear call-to-action
- **Progressive disclosure:** optional fields (macros, measurements) are collapsed by default; advanced options don't clutter the primary flow
- **Consistent components:** pill buttons, card containers, and colour tokens copied directly from `forms.css` so the portal feels like an extension of the main site

---

## 6. Portal Pages

### Client Portal (`portal.faithnmuscle.com`)

> **Bernil's booking vision (from WhatsApp, 17 Apr 2026):** The client's local/foreign status is **derived automatically from their country and timezone — collected at signup — rather than asked explicitly**. No "are you Sri Lankan or foreign?" question needed; the system infers it from `profiles.country`. Sri Lanka → LKR + local bank transfer. Any other country → display prices in USD (with EUR/GBP support later). Payment gateway (Stripe/PayPal) for foreign clients is a future addition; for now all payments are manual and Bernil records them in the ledger regardless of currency.

| Page | Purpose |
|---|---|
| `/login` | Email + password sign-in; "Forgot password?" link |
| `/reset-password` | Set new password via signed reset link |
| `/dashboard` | Home: plan summary, quick stats, upcoming bookings, notification badges, primary CTA per plan type |
| `/my-plan` | View active plans, download documents (signed URLs), view assigned program |
| `/bookings` | Week calendar of available slots, request booking, booking history (coaching only) |
| `/log-workout` | Log a session — exercises pre-filled from program if tapped from program viewer |
| `/workout-history` | Past sessions with progressive overload reference panel |
| `/log-meal` | Daily meal log with auto-save, water tracker, macro targets bar (if set) |
| `/meal-history` | Week-grid of past meal days |
| `/progress` | Body stat check-ins + weight/measurement trend charts |
| `/profile` | Edit contact info, change password |
| `/notifications` | Full notification feed |
| `/messages` | In-portal messaging thread with Bernil (per active plan) |
| `/weekly-checkin` | Submit weekly structured check-in; view Bernil's replies |
| `/progress-photos` | Upload front/side/back photos by date; view own timeline |

### Admin Portal (`portal.faithnmuscle.com/admin`)
| Page | Purpose |
|---|---|
| `/admin/dashboard` | Pending bookings, expiring plans, unread check-ins, unread messages |
| `/admin/clients` | Searchable/filterable client list |
| `/admin/clients/:id` | Full client view: plan management, document upload, program assignment from template, all logs, photos, messages, payments |
| `/admin/bookings` | Availability management + booking request queue |
| `/admin/checkins` | Feed of all weekly check-ins; reply inline |
| `/admin/templates` | Create/edit reusable workout and meal plan templates |
| `/admin/renewals` | Clients expiring within 7 days; one-click WhatsApp reminder |
| `/admin/payments` | Log and view payment records per client |

---

## 7. Authentication Flow

1. **Account creation:** Bernil creates the account in `/admin/clients` → clicks "Create & Invite" → Cloudflare Pages Function calls `supabase.auth.admin.createUser()` server-side → Supabase sends branded invite email with a one-time magic link
2. **Client sets password:** Client clicks link → `/set-password` → sets strong password (12+ chars enforced) → redirected to dashboard
3. **Login:** Email + password → `supabase.auth.signInWithPassword()` → JWT session → role-based redirect
4. **Password reset:** "Forgot password?" → `supabase.auth.resetPasswordForEmail()` → signed link (1h expiry) → `/reset-password` → `supabase.auth.updateUser({ password })`
5. **Session:** `onAuthStateChange()` on every page; 30-min idle auto-logout; sign-out revokes refresh token server-side

---

## 8. File Structure (New Repo)

```
faithnmuscle-portal/
  login.html
  dashboard.html
  my-plan.html
  bookings.html
  log-workout.html
  workout-history.html
  log-meal.html
  meal-history.html
  progress.html
  profile.html
  notifications.html
  messages.html
  weekly-checkin.html
  progress-photos.html
  admin/
    dashboard.html
    clients.html
    client-detail.html
    bookings.html
    checkins.html
    templates.html
    renewals.html
    payments.html
  assets/
    portal.css          ← dark theme using faithnmuscle.com design tokens
    portal.js           ← shared: auth guard, nav, notification badge, idle logout
    supabase-client.js  ← SDK init (CDN), SUPABASE_URL + ANON_KEY only
    charts.js           ← Chart.js wrapper (CDN) for trend charts
  manifest.json         ← PWA manifest (name, icons, theme colour, standalone)
  sw.js                 ← Service worker: offline cache + push notification handler
  functions/
    create-user.js      ← service role: creates auth user + profile
    upload-document.js  ← admin only: verifies admin JWT, writes PDF to R2 plan-documents bucket
    document-url.js     ← verifies JWT + plan ownership, issues R2 presigned URL for a document
    upload-photo.js     ← verifies JWT + upload quota, writes compressed photo to R2
    photo-url.js        ← verifies JWT, issues R2 presigned URL (10-min expiry) per photo
    push-notify.js      ← VAPID private key: sends Web Push notifications
```

---

## 9. Deployment

- **DNS:** Add `CNAME portal → faithnmuscle-portal.pages.dev`
- **GitHub repo `faithnmuscle-portal` must be Private** — Cloudflare Pages works with private repos on the free tier; no reason to expose table names, RLS structure, or API patterns publicly
- **Cloudflare Pages:** connect the private `faithnmuscle-portal` repo; auto-deploy on push to `main`; zero build step
- **Cloudflare env variables (server-side only):** `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `VAPID_PRIVATE_KEY`
- **Client-side JS:** only `SUPABASE_URL` + `SUPABASE_ANON_KEY` embedded (RLS enforces all access)
- **Supabase region:** Singapore (`ap-southeast-1`) — lowest latency from Sri Lanka

---

## 10. Phased Build Plan

| Phase | Scope | Output |
|---|---|---|
| **0 — Infrastructure** | Supabase project + full schema + RLS + Cloudflare Pages + DNS + base CSS/JS | Portal live at `portal.faithnmuscle.com`; auth works |
| **1 — Auth + Dashboard** | Login, invite flow, dashboard, my-plan, profile, admin client list + detail, account creation Edge Function | Bernil can invite clients; clients log in and download their plan |
| **2 — Bookings** | Client booking pages, admin availability + request management, notifications | Full booking loop end-to-end |
| **3 — Workout Logging** | Log workout, workout history, feature gating | Clients log sessions; Bernil sees summaries |
| **4 — Meal Logging** | Log meal with auto-save, meal history | Clients log daily meals |
| **5 — Progress + Polish** | Progress check-ins, trend charts, admin dashboard, mobile polish, empty states | Feature-complete core portal |
| **6 — Engagement Features** | Weekly check-in + coach reply, progress photos, in-portal messaging, visual charts | Full coaching loop in-portal |
| **7 — Smart Features** | Interactive program viewer, progressive overload hints, macro targets bar, PWA + push notifications | Native app feel; intelligent logging |
| **8 — Admin Tools** | Template library, payment ledger, renewal alerts | Bernil's operations fully supported |

---

## 11. Long-Term Vision (Beyond Phase 8)

These are ideas Bernil raised directly — not in scope for the current build but worth capturing so no decision closes the door on them.

| Idea | Notes |
|---|---|
| **Foreign client payment gateway** | Stripe + PayPal for USD/EUR/GBP payments. Blocked on Bernil setting up business accounts and reviewing transaction fees. Design the payments table and booking flow to support this from day one (already done — `currency` + `client_type` fields). |
| **Multiple trainers** | Bernil may eventually employ online trainers. The `role` field on `profiles` currently supports `'client'` and `'admin'`; a `'trainer'` role can be added. Each trainer would have their own client list and availability slots. |
| **Fitness marketplace** | Bernil envisions selling equipment and apparel (lifting straps, t-shirts, shorts, hats) through the site. Completely separate product — would need an e-commerce layer or a third-party store (e.g. Shopify buy button). No DB changes needed yet. |
| **Online community** | A community/forum space for members. Could be as simple as a Discord link or as complex as a built-in feed. Out of scope for the coaching portal but compatible with the existing auth system. |

---

## Critical Files (Reference During Implementation)

- `faithnmuscle.github.io/apply/forms.css` — design tokens and component patterns to replicate in `portal.css`
- `faithnmuscle.github.io/apply/forms.js` — validation patterns to reuse
- `faithnmuscle.github.io/index.html` — CSS custom properties (colours, fonts) to copy
- `CLAUDE.md` — coach details, plan pricing, service names

---

## Verification Plan — Testing Strategy

**Automated** (no npm — pgTAP SQL tests run in Supabase SQL editor; Node.js scripts use built-in fetch, no packages):
- RLS policies → pgTAP SQL per table
- DB constraints → pgTAP SQL
- Cloudflare Function endpoints → plain Node.js scripts

**Manual** (~15 items total, only what can't be scripted): PWA install on real device, mobile visual layout, push notifications on device, timezone display, loading/empty states.

Admin accounts (created in Phase 0):
- **Bernil** — coach / business owner (primary admin)
- **Vidura** (developer) — admin for building, debugging, and support; separate credentials from Bernil

Test accounts (created in Phase 0, kept permanently):
- `test-coaching@` — coaching plan
- `test-workout@` — workout-only
- `test-meal@` — meal-only
- `test-admin@` — dedicated test admin (separate from both real admin accounts)

---

### Phase 0
**Automated:** All pgTAP RLS + constraint files pass with 0 failures
**Manual:** Portal loads over HTTPS; HSTS + CSP headers in DevTools; DB trigger creates profile row; keep-alive cron fires in Cloudflare logs

### Phase 1
**Automated:** `auth.test.js` — correct login works, wrong password fails, lockout fires at 5 attempts, client JWT rejected by admin Function; `documents.test.js` — presigned URL works, expires after 10 min (403), client A JWT rejected for client B's document; `profiles.sql` pgTAP passes
**Manual:** Invite email + link on real device; role redirect in real browser; 30-min idle auto-logout

### Phase 2
**Automated:** `bookings.test.js` — simultaneous same-slot requests → one 200 one 409; `bookings.sql` + `unique_constraints.sql` pgTAP pass
**Manual:** Timezone display correct in real browser; non-coaching client has no `/bookings` nav link

### Phase 3
**Automated:** `workout_logs.sql` pgTAP; Node script — meal-only JWT INSERT workout_log → rejected
**Manual:** Meal-only client sees "not included" message; exercise add/remove UI works; "last time" panel correct

### Phase 4
**Automated:** `meal_logs.sql` pgTAP; `unique_constraints.sql` — duplicate meal_log date rejected; Node script — workout-only JWT INSERT meal_log → rejected
**Manual:** Auto-save indicator visible; macro targets bar updates correctly

### Phase 5
**Automated:** Node script — progress check-in INSERT fails for wrong user's plan_id
**Manual:** Weight trend chart renders; empty states on all history pages; 375px layout; network disconnect shows graceful error

### Phase 6
**Automated:** `photos.test.js` — quota limits enforced (429), client A JWT rejected for client B's photo, R2 file size under 500KB; `unique_constraints.sql` — duplicate weekly check-in rejected; `messages.sql` pgTAP
**Manual:** Photo displays correctly in UI; messages poll within 30s; Bernil reply visible to client

### Phase 7
**Automated:** `push.test.js` — notification dispatched to registered endpoint; unregistered endpoint returns 404
**Manual:** "Start workout" pre-fills exercises; streak resets at local midnight (UTC-5 + UTC+8); timezone display correct; PWA installs on real iOS + Android; push notification received on device within 10s

### Phase 8
**Automated:** `payments.sql` pgTAP; Node script — template edit does not affect already-assigned program rows
**Manual:** Renewals list correct; WhatsApp link pre-filled correctly; pinned note persists after renewal; keep-alive logs every 3 days in Cloudflare
