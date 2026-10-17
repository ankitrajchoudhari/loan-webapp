# श्री श्याम सेवा समिति — Accounts Website

Member portal + admin panel for the samiti's monthly installments, loans, interest and old records.
Hindi by default, with a हिंदी / English switch on every screen.

| Folder | What it is |
|---|---|
| `backend/` | Node.js + Express API, Prisma ORM, PostgreSQL. All money maths and all permission checks live here. |
| `frontend/` | Next.js (React) website. Talks only to its own `/api/v1`, which is passed through to the backend. |
| `db/init/` | Creates the extra databases (practice + automated tests) on first start of the database container. |
| `docs/` | [Admin guide (Hindi)](docs/ADMIN_GUIDE.md) · [Backup & recovery](docs/BACKUP.md) · [Test checklist](docs/TEST_CHECKLIST.md) · [Deploy on Vercel](docs/DEPLOY_VERCEL.md) |

## How it is built (and why)

- **Money is stored as whole paise in integer columns** (₹1,000 = `100000`). Amounts typed on screen are parsed from text, never through floating point, so totals are always exact.
- **Installments, loans and loan repayments are separate tables.** An installment can never be counted as a loan repayment.
- **One live installment per member per month** is enforced by the database itself (a partial unique index), not just the screen.
- **Nothing is silently changed.** Corrections need a reason, show the before → after effect on balances first, and are written to the change log in the same transaction. Wrong entries are *cancelled* (kept, with the reason), never deleted.
- **Interest methods** (chosen per loan and shown on every statement):
  - *reducing* — rate % on the principal still owed at the start of each month
  - *flat* — rate % on the original principal every month until repaid
  - *fixed* — a fixed rupee amount every month until repaid
  A yearly rate is divided by 12. Interest starts the month after the loan (or a chosen month). Outstanding interest = old unpaid interest + interest charged so far − interest paid.
- **Practice data lives in a separate database** (`TEST_DATABASE_URL`). A practice session is bound to it by its login cookie and cannot read or change live records. Resetting practice data only ever touches that database.
- **Sessions** are signed tokens in an `httpOnly`, `SameSite=Strict` cookie. Members can only fetch their own account; this is checked on the server for every request. Admin PIN and member PIN/OTP attempts lock for 15 minutes after 5 failures.

## Fonts

The site uses **Mukta** for all text — one family drawn for both Devanagari and Latin, so Hindi, English and mixed Hinglish sit together evenly and stay readable at large sizes on small phones. **Tiro Devanagari Hindi** is used only for the samiti's name. Both are self-hosted by Next.js at build time (no font requests to Google from visitors).

---

## Setup on a computer (development or a small office server)

Needs: **Node.js 20+** and **Docker Desktop** (for PostgreSQL). On Windows use PowerShell or Git Bash.

```bash
# 1. Database (PostgreSQL 16 in Docker, port 5433)
docker compose up -d

# 2. Backend
cd backend
cp .env.example .env          # then edit .env — see "Settings" below
npm install
npm run db:deploy             # creates tables in the live and practice databases
npm run practice:reset        # (optional) fills the practice database with sample data
npm run dev                   # API on http://localhost:4000

# 3. Frontend (new terminal)
cd frontend
npm install
npm run dev                   # website on http://localhost:3000
```

Open http://localhost:3000 — member login. Admin login is at http://localhost:3000/admin/login.
Practice member login: http://localhost:3000/?practice=1 with sample number `9000000001`, date of birth 01/01/1960.

### Logins (one login page for everyone)

Type the mobile number; the site works out who it is:

| Who | Then asks | Can do |
|---|---|---|
| Member | date of birth | see own account only |
| Sub-admin | date of birth | only the work areas ticked for them (members / installments / loans / old records / reports) |
| Admin | date of birth **or** Gmail, then secret code | everything for the samiti; adds sub-admins and gives them work |
| Developer (`DEVELOPER_MOBILE`, `DEVELOPER_DOB`, optional `DEVELOPER_EMAIL` in `backend/.env`; created on server start) | date of birth **or** Gmail, then secret code | everything, adds admins and sub-admins, sees every action in the change log |


- **Members**: mobile number + date of birth, exactly as the admin entered them. Only members the admin added (and who are active) can log in. 5 wrong tries lock the number for 15 minutes.
- **Admin, first time (once)**: *पहली बार* tab → verify the phone by Firebase SMS code **or** sign in with Gmail → name, date of birth, secret code.
- **Admin, every time after**: mobile + date of birth + secret code, **or** Gmail + secret code.
- Recovery without Firebase: `npm run seed:admin -- --name="Name" --mobile=98XXXXXXXX --dob=YYYY-MM-DD`.

**Firebase console setup (one time)** — project *jaipur-comitte* → Authentication → Sign-in method: enable **Phone** and **Google**; under Settings → Authorised domains add your website's domain (localhost is there by default). Firebase may require the Blaze (pay-as-you-go) plan to send real SMS; for trying it out, add a test phone number + code under Phone sign-in.

> If the database container was created before `db/init/` existed, create the extra databases once:
> `docker exec samiti-db psql -U samiti -d postgres -c "CREATE DATABASE samiti_test OWNER samiti;" -c "CREATE DATABASE samiti_ci OWNER samiti;" -c "CREATE DATABASE samiti_ci_practice OWNER samiti;"`

### Settings (`backend/.env`)

| Key | Meaning |
|---|---|
| `DATABASE_URL` | Live (real) database. |
| `TEST_DATABASE_URL` | Practice database. **Must be a different database.** Leave empty to switch practice mode off. |
| `CI_DATABASE_URL`, `CI_TEST_DATABASE_URL` | Throwaway databases used only by `npm test` (wiped every run). |
| `JWT_SECRET` | 32+ random characters. Generate: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |
| `APP_ORIGIN` | The website address(es), e.g. `https://samiti.example.in`. Write requests from other sites are refused. |
| `ADMIN_SECRET_CODE` | Secret code asked at admin registration and on **every** admin login. Choose your own and keep it private. Change it here and restart to change it. |
| `FIREBASE_PROJECT_ID` | Firebase project (`jaipur-comitte`) whose phone-OTP / Google sign-ins the server accepts for admin registration and Gmail login. |
| `ADMIN_ALLOWED` | Optional comma list of mobile numbers / Gmail addresses allowed to register as admin. Empty = anyone who passes the phone/Gmail check and knows the secret code. |

Frontend: `API_ORIGIN` (default `http://localhost:4000`) — where the backend runs.

### Tests

```bash
cd backend
npm run test:unit   # money, interest methods, statuses, import parsing (no database)
npm test            # unit + full API tests against the CI databases (never live or practice)
cd ../frontend
npm run check:i18n  # every text on screen exists in Hindi and English
```

`npm test` covers the spec §8 / §10 checklist: adding members, installments (incl. duplicate refusal and correction with reason), loans with each interest method, principal/interest repayments, correcting an old repayment (with before/after balances), member-only access, reports, historical batches and spreadsheet import, deactivation, practice-data separation and backup.

---

## Payments (UPI with screenshot, or cash)

- The admin sets the samiti's **UPI id + QR** (Settings → UPI). Members see their dues, pay with any UPI app,
  and **upload the payment screenshot** (the UTR number is optional). The same screenshot or UTR can't be used twice.
- Staff open **Payments**, look at the screenshot, check the bank / UPI app, then **confirm** (dues are cleared
  oldest first, extra becomes advance) or mark **not received** (the member sees why).
- Every confirmed payment has a receipt: **print**, **download PDF**, or **send** (WhatsApp / any app on a phone).
- Cash: record it at the counter on the Payments page; the receipt opens for printing.
- There is no extra charge on members' payments.

## Platform fee (developer ↔ samiti)

- Only the **developer** can switch it on: **Platform bill → "Platform fee on"**, with the fee per day (default ₹12.45).
  Charging starts from that exact moment; switching off stops it (days up to then stay billed).
- Each calendar day (India time) on which it was on is charged once. When a month ends, a bill is made:
  **days × fee per day** (e.g. a full 31-day month = 31 × ₹12.45 = ₹385.95). The current month's running total is shown with date and time.
- The developer adds their own **UPI id + QR**. The admin gets a notification and a **pop-up with the QR**; they pay,
  **upload the screenshot**, and the developer marks it **paid** (or "not received" with a reason, then the admin pays again).

## Going live (production)

**On Vercel** (website + API as two projects, Neon Postgres): follow [docs/DEPLOY_VERCEL.md](docs/DEPLOY_VERCEL.md).

Any other host that runs Node.js and PostgreSQL works too (a small VPS, Render, Railway, etc.):

1. **PostgreSQL**: a managed database with daily automatic backups is best. Create two databases: live and practice.
2. **Backend**: `npm ci && npm run db:deploy && npm run seed:admin`, then run `npm start` with `NODE_ENV=production` and the `.env` values set as environment variables. Keep it running with the host's process manager (or `pm2`).
3. **Frontend**: `npm ci && npm run build`, then `npm start` with `API_ORIGIN` pointing to the backend.
4. **HTTPS is required** (cookies are marked `Secure` in production). Put both behind one domain, e.g. with Caddy or Nginx; only the frontend needs to be public.
5. Set `APP_ORIGIN` to the public address, `MEMBER_LOGIN` to `otp` (with an SMS key) or `pin`.
6. Schedule `npm run backup` daily and copy the files off the server — see [docs/BACKUP.md](docs/BACKUP.md).

Before handing over: run through [docs/TEST_CHECKLIST.md](docs/TEST_CHECKLIST.md) in practice mode on a phone and on a computer.
