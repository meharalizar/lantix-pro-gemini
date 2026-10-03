# LANTIX Pro

**A live-events labor marketplace for Massachusetts.** LANTIX Pro connects production companies, venues, and promoters with vetted live-event crew (audio, lighting, video, rigging, stage, backline, and more). Companies pay a monthly subscription to browse crew and post work; crew join for free and get matched to jobs.

- **Production:** https://event-labor.emergent.host (also mapped to lantixpro.com)
- **Stack:** Next.js 15 (App Router) · React · Tailwind CSS · shadcn/ui · MongoDB

---

## Table of Contents
1. [What it does](#what-it-does)
2. [Feature overview](#feature-overview)
3. [Tech stack](#tech-stack)
4. [Project structure](#project-structure)
5. [Getting started (local)](#getting-started-local)
6. [Environment variables](#environment-variables)
7. [Data model](#data-model)
8. [API reference](#api-reference)
9. [Admin console](#admin-console)
10. [Third-party integrations](#third-party-integrations)
11. [Deployment](#deployment)
12. [Roadmap / backlog](#roadmap--backlog)

---

## What it does

- **Companies** (production houses, venues, promoters) subscribe ($300/month) to browse the crew directory, unlock crew contact details, post jobs and RFPs, and manage bookings.
- **Crew** (engineers, stagehands, techs, etc.) join **free**, build a profile with skills, rates, availability and certifications, and get SMS/email alerts when matching jobs are posted.
- **Matching** connects a posted job's role/skills + city to available crew, notifies them, and lets them apply. Companies confirm crew, which unlocks two-way contact details.

---

## Feature overview

### Marketplace & directories
- **Crew Directory** — search/filter by role, skill category, city, day rate, union status, availability, and certifications. Contact details are gated until a company subscribes.
- **Company Directory** — browse production houses, venues, and promoters.
- **Services & ADA Directory** — catering, transportation, travel, entertainment law, talent agencies, makeup artists, plus ADA ASL signers and translators.
- **Jobs Board & RFPs** — post jobs and Requests for Proposal; crew apply; companies review applicants and confirm.
- **24-hour cancellation rule** — companies and crew can cancel only when call time is ≥ 24 hours away.
- **Maps & directions** — job-site address, in-app map dialog, and "Get Directions" links.

### Roles & skills taxonomy
Production, Crew, Audio (FOH, A1, A2, Monitor, RF, System Tech), Lighting (LD, Board Op, Electrician, Follow Spot, Lighting Assist L2), Video (Video Engineer, Camera Op, CCU, TD, Media Server, LED, Projectionist, E2, Spider Operator, Playback, Graphics, Teleprompter), Photo (Photographer), Rigging (Head Rigger, Rigger, Ground Rigger), Stage (Stagehand, Carpenter, Deck Hand, Loader, Fork Operator), Backline (Backline/Guitar/Drum Tech).

### Accounts & auth
- **Email/password** registration & login (bcrypt-hashed), with a **role choice (Crew vs Company) built into the signup form**.
- **Google SSO** via Emergent-managed authentication.
- **Password reset** via email (Resend) with expiring tokens.
- **Switch account type** — users can flip between Crew and Company from their profile; the previous profile is preserved.
- **Self-service account deletion** — permanently removes a user's account, profile, and related jobs/applications.
- **Company welcome** — a short 3-step guided onboarding for new companies ending in "Post your first job."

### Certifications
- Crew certifications (OSHA, ETCP, Rigger Cert, CDL, CPR/First Aid, Forklift, etc.) with expiry dates and badges.
- Filter crew by certification; endpoint for certs expiring within 30 days.

### Admin console (owner-only, code-gated)
- **Master List** — full crew list with stats, key-role highlighting, booked-off status, edit/delete, and daily digest recipients.
- **All Users & Details** — unified directory of all crew + companies with full contact info, search, type filters, CSV export, per-user detail view, and **edit/delete for both crew and companies**.
- **Messaging** — direct messages and broadcast (SMS + email) to all members.
- **Calendar** — jobs and bookings with status.
- **Daily digest email** of the crew master list (Resend) + cert-expiry section.

---

## Tech stack

| Layer | Technology |
|------|------------|
| Framework | Next.js 15 (App Router) |
| UI | React, Tailwind CSS, shadcn/ui, lucide-react icons |
| Database | MongoDB (UUID-based document IDs) |
| Auth | Email/password (bcryptjs) + Emergent-managed Google SSO, cookie sessions |
| Email | Resend |
| SMS | Twilio |
| Payments | Stripe (subscriptions) |

All backend logic lives in a single catch-all API route and is called from the client under the `/api` prefix.

---

## Project structure

```
/app
├── app/
│   ├── api/[[...path]]/route.js   # All backend API endpoints (catch-all)
│   ├── page.js                    # Entire SPA frontend (landing, auth, dashboards, admin)
│   ├── layout.js                  # Root layout
│   └── globals.css                # Tailwind + design tokens
├── components/ui/                 # shadcn/ui components
├── lib/                           # helpers
├── public/                        # static assets
├── .env                           # environment variables (not committed)
├── package.json
└── README.md
```

---

## Getting started (local)

> Requires Node.js 18+, Yarn, and a MongoDB instance.

```bash
# 1. Install dependencies
yarn install

# 2. Create .env (see Environment variables below)

# 3. Run the dev server
yarn dev
# App runs on http://localhost:3000
```

Seed demo data (crew, companies, jobs, services) by calling once:

```bash
curl -X POST http://localhost:3000/api/seed
```

---

## Environment variables

Create `/app/.env`. **Never commit real secrets.**

```dotenv
# Database
MONGO_URL=mongodb://localhost:27017
DB_NAME=lantix

# Public base URL (used by the frontend)
NEXT_PUBLIC_BASE_URL=http://localhost:3000

# Admin console access code
ADMIN_CODE=[REDACTED_ADMIN_CREDENTIAL]            # case-insensitive at runtime

# Email (Resend)
RESEND_API_KEY=re_xxx
EMAIL_FROM=LANTIX Pro <onboarding@resend.dev>
ADMIN_EMAIL=you@example.com
CRON_SECRET=some-long-random-string

# SMS (Twilio) — API Key auth preferred
TWILIO_ACCOUNT_SID=ACxxxxxxxx
TWILIO_API_KEY_SID=SKxxxxxxxx
TWILIO_API_KEY_SECRET=xxxxxxxx
TWILIO_FROM_PHONE=+1XXXXXXXXXX          # or use a Messaging Service:
# TWILIO_MESSAGING_SERVICE_SID=MGxxxxxxxx
# (legacy) TWILIO_AUTH_TOKEN=xxxxxxxx

# Payments (Stripe)
STRIPE_API_KEY=sk_xxx
```

Notes:
- The app runs in **demo mode** for SMS/Stripe/Email when credentials are absent (actions are logged, not sent) so the marketplace remains fully usable.
- `ADMIN_CODE` is compared case-insensitively and trimmed of whitespace.

---

## Data model

MongoDB collections (all use string **UUID** `id` fields, never Mongo ObjectIds in the API):

- `users` — account (id, email, name, picture, role: `crew|company|null`, passwordHash)
- `crew_profiles` — crew profile (userId, fullName, skills, primaryCategory, dayRate, city, cell, email, available, unionMember, certs, bio)
- `companies` — company profile (userId, name, companyType, email, phone, website, city, subscriptionStatus, paidVerified)
- `jobs` — posted jobs (userId, role, skills, city, date, callTime, hours, holidayPay, overtimeHours, clientName, address, status)
- `applications` — crew applications to jobs (jobId, crewUserId, crewId, status)
- `rfps` / `proposals` — requests for proposal and crew proposals
- `messages` — direct messages (fromUserId, toUserId, body, read)
- `services` — services & ADA directory entries
- `sessions` — auth sessions (session_token, userId, expiresAt)
- `password_resets` — reset tokens
- `sms_log`, `email_job_log`, `broadcasts`, `ratings`, `settings`

---

## API reference

All endpoints are under `/api`. Auth is cookie-based (`lantix_session`); admin endpoints use an `x-admin-code` header.

### Auth
| Method | Path | Description |
|-------|------|-------------|
| POST | `/api/auth/register` | Create account with email/password + optional `role` |
| POST | `/api/auth/login` | Log in |
| POST | `/api/auth/logout` | Log out |
| POST | `/api/auth/session` | Complete Google SSO session |
| POST | `/api/auth/dev-login` | Demo login `{role}` (crew/company) |
| GET  | `/api/auth/me` | Current user + profile |
| POST | `/api/auth/role` | Set/switch role (crew/company) |
| POST | `/api/auth/forgot` | Request password reset |
| POST | `/api/auth/reset` | Reset password with token |
| DELETE | `/api/account` | Permanently delete own account (cascades) |

### Marketplace
| Method | Path | Description |
|-------|------|-------------|
| GET/POST | `/api/crew` · `/api/crew/profile` | Crew directory + profile save |
| GET/POST | `/api/companies` · `/api/companies/profile` | Company directory + profile save |
| GET/POST | `/api/jobs` | List / post jobs (matching + SMS on post) |
| POST | `/api/jobs/:id/apply` · `/confirm` · `/cancel` | Apply / confirm / cancel (24h rule) |
| GET/POST | `/api/rfps` · `/api/rfps/:id/proposals` | RFPs and proposals |
| GET/POST | `/api/services` | Services & ADA directory |
| GET | `/api/calendar` | Calendar events |
| GET/POST | `/api/messages` · `/api/messages/read` | Messaging |
| GET | `/api/certs/expiring` | Certs expiring within 30 days |
| GET | `/api/dashboard` | Company dashboard stats |
| POST | `/api/billing/checkout` · `/api/billing/verify` | Stripe subscription |
| POST | `/api/seed` | Seed demo data |

### Admin (require `x-admin-code`)
| Method | Path | Description |
|-------|------|-------------|
| POST | `/api/admin/verify` | Validate the access code |
| GET  | `/api/admin/master` | Crew master list + stats |
| GET  | `/api/admin/users` | All users (crew + companies) with full details; `?type=`, `?q=` |
| POST/DELETE | `/api/admin/member/:id` | Edit / delete a crew member |
| POST/DELETE | `/api/admin/company/:id` | Edit / delete a company (cascades) |
| POST | `/api/admin/recipients` | Set daily digest recipients |
| POST | `/api/admin/send-digest` | Send digest now |
| POST | `/api/admin/broadcast` | Broadcast SMS + email to all crew |
| POST | `/api/cron/email` | Daily digest cron (requires `CRON_SECRET` bearer) |

---

## Admin console

- Sign in, then open **Master List** in the navigation, or go directly to `/#admin`.
- Enter the access code (`ADMIN_CODE`, default `[REDACTED_ADMIN_CREDENTIAL]` — case-insensitive).
- Tabs: **Crew Master List** and **All Users & Details** (search, filter by Crew/Company, CSV export, view/edit/delete, message).

> ⚠️ The admin console exposes full user contact details. Set a strong, private `ADMIN_CODE` in production.

---

## Third-party integrations

| Service | Purpose | Status / notes |
|--------|---------|----------------|
| **MongoDB** | Primary datastore | Required |
| **Emergent Google SSO** | Google login | Platform-managed |
| **Resend** | Password reset + daily digest email | Requires a **verified sending domain** to email arbitrary recipients; otherwise only the account owner receives mail |
| **Twilio** | SMS job alerts / confirmations | Requires an **SMS-capable Twilio number** (account must own one) and, for reliable US delivery, **A2P 10DLC registration**. Runs in demo mode without credentials |
| **Stripe** | $300/mo company subscription | Runs in demo mode without a live key |

When integration credentials are not configured, the app degrades gracefully to **demo mode** (logs the intended action) so all flows remain testable.

---

## Deployment

- Deployed on the **Emergent** platform. Code changes are made in the preview environment and **redeployed** to production.
- Production environment variables (Mongo, Resend, Twilio, Stripe, `ADMIN_CODE`, `CRON_SECRET`) must be set on the production deployment separately.
- For the **daily crew master-list email**, configure a scheduled job to `POST /api/cron/email` daily at 12:00 AM with `Authorization: Bearer <CRON_SECRET>`.

---

## Roadmap / backlog

- Live Stripe billing (real subscription enforcement + webhooks)
- Live Twilio SMS after purchasing a number + A2P 10DLC registration
- Verified Resend sending domain for real digest/reset delivery to any address
- Durable cloud object storage for photos, logos, certification files, and job plots
- Automated 30-day certification expiry email alerts
- Address N+1 query patterns for production scale

---

_© LANTIX Pro. Built for the Massachusetts live-events community._
