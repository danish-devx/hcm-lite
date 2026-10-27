# Bloom — HCM Lite

**AI-assisted Human Capital Management for Admin, HR and Employees.**
Built for the Saylani Hackathon challenge (24 October 2026) — 25 functionalities across 9 modules, plus bonus features.

> **Submission links**
> - **Live app:** `_HOSTED_LINK_YAHAN_DALEIN_` (opens first-run setup — judges create the company themselves)
> - **Repository:** `_GIT_REPO_LINK_YAHAN_DALEIN_` (public)
>
> Commit `.env.example` only — real keys live in the hosting provider's environment settings.

---

## What it is

A web-based HR system where **every number comes from what people do in the app** — no preloaded or dummy data. A fresh install starts empty:

1. **Admin** runs the first-run setup (company name, office hours, weekend, office location + radius).
2. **HR** registers employees — each registration creates that employee's login (temporary password, changed on first sign-in).
3. People check in, apply for leave, HR approves, payroll runs — and **dashboards + the AI assistant answer from exactly those records**.

The AI assistant works with the same access as the person using it: an employee can never see a colleague's salary or anyone else's data — through the UI, the API, *or* the AI.

## Feature checklist (brief Section 8 — all 25 done)

| # | Functionality | Admin | HR | Employee |
|---|---|---|---|---|
| 01 | First-run setup: company profile + Admin account | ✅ Manage | — | — |
| 02 | Login, logout, change password; role menus/dashboards | ✅ | ✅ | ✅ |
| 03 | Company settings (hours, grace, weekend, location, radius) | ✅ Manage | 👁 View | — |
| 04 | Departments, designations, leave types + quotas, holidays | ✅ Manage | 👁 View | — |
| 05 | Create HR logins; deactivate/reset any login | ✅ | — | — |
| 06 | Register employee (creates login) + edit details | 👁 | ✅ Manage | ✅ own phone/address |
| 07 | Employee directory + search/filters; Employee 360 | ✅ | ✅ | ✅ own |
| 08 | CSV import with dry-run error report; CSV export | — | ✅ | — |
| 09 | Check in / check out on the web (+ camera, bonus) | — | ✅ | ✅ |
| 10 | Attendance calendar + daily attendance board | ✅ | ✅ | ✅ own |
| 11 | Attendance correction: request → approve | 👁 | ✅ Approve | ✅ Request |
| 12 | Apply/cancel leave; balance + history | — | ✅ | ✅ |
| 13 | Approve/reject leave with comment | 👁 | ✅ Approve | — |
| 14 | Salary structure per employee | 👁 | ✅ Manage | — |
| 15 | Monthly payroll: create + review draft | 👁 | ✅ Manage | — |
| 16 | Finalize payroll (locks the month) | ✅ | — | — |
| 17 | Payslips with PDF download | ✅ All | ✅ All | ✅ Own |
| 18 | Dashboards, KPIs, trends, insights + filters | ✅ Company | ✅ HR | ✅ Personal |
| 19 | AI assistant chat answering from real data | ✅ All | ✅ HR data | ✅ Own data |
| 20 | AI dashboard summary | ✅ | ✅ | — |
| 21 | Smart leave: sentence → pre-filled form | — | ✅ | ✅ |
| 22 | Policy Q&A (attendance, leave, payroll rules) | ✅ | ✅ | ✅ |
| 23 | Announcements (post / read) | ✅ Post | ✅ Post | 👁 Read |
| 24 | In-app notifications (leave decisions, payslips…) | ✅ | ✅ | ✅ |
| 25 | Audit log (actor, action, entity, before/after JSON) | ✅ View | — | — |

## Bonus items (brief Section 8, +10 points)

| Bonus | Status | Where |
|---|---|---|
| Camera attendance — face detection + location | ✅ | Employee dashboard → **Camera** button (MediaPipe BlazeFace, self-hosted model, one-face rule, GPS accuracy ≤ 100 m enforced on client **and** server, no photo stored) |
| Attrition risk score | ✅ | Admin dashboard → **Attrition risk** panel (0–100 transparent score with reasons: tenure, salary vs dept average, absence vs company average, lates, unpaid leave, missing checkouts) |
| Absence anomaly flags | ✅ | HR dashboard → **Absence anomaly flags** (3+ consecutive absent days, absence 2× company average, Monday/Friday clusters) |
| Late penalty rule (3 lates = 0.5 day) | ✅ | Payroll compute (server), run-detail deduction chips, payslip PDF line, policy footnote |
| AI understands Roman Urdu | ✅ | Chat + smart leave ("kal aur parso sick fever" → correct sick draft) |
| Dark mode / PWA | ✅ | Ivory Bloom ↔ Plum Noir theme switch (charts recolor live) + installable PWA (manifest, icons, theme-color) |

## Tech stack

- **Next.js 16** (App Router, JavaScript only — no TypeScript) + **React 19**
- **Tailwind CSS 4** + shadcn-style UI components + React Bits animations
- **Redux Toolkit + RTK Query** for all client→API data flow
- **Supabase** (Postgres + Auth + RLS) — `@supabase/ssr` cookie sessions
- **Chart.js** (react-chartjs-2) for dashboards
- **MediaPipe tasks-vision** (BlazeFace) for camera check-in — model + WASM self-hosted in `public/`
- **Gemini API** (tool calling) for the AI assistant — key **server-only**; automatic z-ai fallback
- **pdf-lib** for payslip PDFs, **papaparse** for CSV

## Architecture

```
Browser (RTK Query)
   ↓  JSON + cookie session
Next.js route handlers (/api/*)
   ↓  guards.js — role check (admin/hr/employee) + data-scope + zod validation
services/*.service.js — business rules (attendance, leave, payroll, dashboards, AI tools)
   ↓  service-role admin client for privileged ops
Supabase (RLS = second defense layer; SECURITY DEFINER RPCs for attendance)
```

- **Time is stamped by the server** (RPC `hcm_check_in` / `hcm_check_out`) — the browser only sends optional GPS coords.
- **Geofence**: server computes Haversine distance to the office and enforces the radius; the phone only sends data.
- **AI never touches the DB directly** — it picks a tool, the backend runs it with the user's scope, the model writes the answer. Every call is logged in `hcm_ai_logs`; answers carry an "AI-generated" label; 15 s timeout + friendly fallback + ~20 req/user/hour rate limit.
- **Finalized payroll is immutable** — enforced in the API *and* by a DB trigger.

## Run it locally (under 10 minutes)

### 1. Supabase (5 min)

1. Create a project at [supabase.com](https://supabase.com) (free tier is enough).
2. SQL Editor → run **`supabase/schema.sql`** (16 `hcm_` tables).
3. SQL Editor → run **`download/hcm_supabase_phase0.sql`** (RLS policies, helper functions, attendance RPCs, leave-type seeds, indexes).
4. Settings → API → copy the **URL**, **anon key** and **service_role key**.

### 2. App (2 min)

```bash
cp .env.example .env.local   # fill the 3 Supabase values + your AI key
npm install
npm run dev                  # http://localhost:3000
```

### 3. First run (1 min)

Open the app — you are redirected to the **first-run setup wizard**: company name, office hours, grace time, weekend days, optional office location + radius, and the first **Admin** account. (Or set `ADMIN_EMAIL` / `ADMIN_PASSWORD` in `.env.local` and they are used as a fallback.)

After setup: log in as Admin → create an **HR login** → HR registers employees (their logins are created with a temporary password) → the system is live.

### 4. AI key (1 min)

Any hosted LLM with tool calling works. For Gemini: get a key from [Google AI Studio](https://aistudio.google.com/), then in `.env.local`:

```
GEMINI_API_KEY=your_key      # SERVER-ONLY — never shipped to the browser
GEMINI_MODEL=gemini-3.8-flash
AI_PROVIDER=auto             # auto → gemini → z-ai fallback
```

The browser never calls the AI provider directly — all calls go through `/api/ai/*` server routes with rate limiting and logging.

## Demo accounts (hosted demo install)

| Role | Email | Password |
|---|---|---|
| Admin | `admin.demo@example.com` | `Test@1234` |
| HR | `hr.demo@example.com` | `Test@1234` |
| Employee | `employee.demo@example.com` | `Test@1234` |

Judges start from the **hosted first-run setup** and can create their own company, employees and activity — these accounts exist in the demo data only. The 5-minute walkthrough lives in **[DEMO_SCRIPT.md](./DEMO_SCRIPT.md)**.

## Demo data note

The hosted demo contains a few months of activity so dashboards, trends and payroll look alive (employees, attendance, approved leaves, finalized payroll runs, announcements). **Judging is done from a fresh install** — the hosted link's first-run setup creates a brand-new empty company, exactly as the brief requires.

## Security & RBAC (what judges look for)

- Every API request is checked **on the server** — role **and** data scope (`guards.js`). Hiding a button in the UI is never the security boundary.
- Employees read only rows with their own `employee_id` — enforced in services **and** by Supabase RLS policies (defense in depth).
- Passwords hashed (Supabase Auth, bcrypt); temporary passwords force a change on first sign-in.
- AI key lives only in a backend env variable; tools reuse the same services and permission checks as the REST API.
- Audit log records every important action (actor, action, entity, before/after JSON) and **cannot be edited or deleted through the app**.
- Finalized payroll runs are locked by the API *and* a DB trigger — even a service-role delete is rejected.
- Secrets: `.env.example` is committed; real keys stay in the hosting provider's environment settings. **Rotate any key that was ever pasted into a chat** (Gemini key + service_role key were rotated during development).

## What is done / not done

**Done:** all 25 functionalities (table above), all 6 bonus items, responsive 375 px+, dark mode, PWA manifest, CSV dry-run import/export, payslip PDFs, audit log browser, AI chat with 7 role-scoped tools.

**Not done (honest list):**
- **Native mobile app** — the web app covers the required flows; camera check-in runs in the mobile/phone browser (brief: "The same camera check can also run in the web app on a laptop or phone browser"). No APK/Expo build.
- **Extra bonus:** face descriptor *enrollment + matching* and blink-liveness are not implemented — the camera check enforces the brief's core rule (exactly one face + inside geofence + GPS accuracy).
- No automated test suite ships in the repo (QA was done with idempotent end-to-end API + UI scripts during development).

## Project structure

```
src/
  app/(public)/            login, first-run wizard
  app/(protected)/         dashboard, employees, attendance, leave, payroll,
                           assistant, announcements, audit-log, organization…
  app/api/                 route handlers (thin) → guards → services
  components/modules/      per-module client UI (editorial design system)
  lib/guards.js            role + data-scope + zod plumbing
  lib/services/            business rules (the heart of the app)
  lib/supabase/            ssr clients (browser / server / admin)
  lib/ai/                  provider, tools, policy prompt, rate limit, logging
  store/                   RTK Query slices
supabase/schema.sql        fresh-install table DDL (generated from live DB)
download/hcm_supabase_phase0.sql   RLS + RPCs + seeds
DEMO_SCRIPT.md             5-minute judge walkthrough
```
