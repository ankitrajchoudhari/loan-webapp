# Deploying on Vercel

The site runs as **two Vercel projects from this one repository**, plus a Postgres database:

| Part | Vercel project | Root Directory | What it is |
|---|---|---|---|
| Website | e.g. `samiti` | `frontend` | Next.js. Members and staff open this address. |
| API | e.g. `samiti-api` | `backend` | Express API, runs as one serverless function (`backend/api/index.js`). |
| Database | — | — | Neon Postgres (free plan is enough), added from Vercel → Storage. |

The browser only ever talks to the website. The website passes `/api/v1/*` on to the API project
(`API_ORIGIN`), so the login cookie stays on the website's own address.

---

## 1. Database (Neon)

1. Vercel dashboard → **Storage → Create Database → Neon (Serverless Postgres)** → region **Mumbai (ap-south-1)** if offered → create.
2. Open it in the **Neon console** → **Databases → New database**: make two databases,
   `samiti` (real records) and `samiti_practice` (practice mode). The practice database is optional.
3. For each database copy two addresses from **Connection Details**:
   - **Pooled** (the host name contains `-pooler`) → used by the app
   - **Direct** (tick off "Connection pooling") → used only for setting up tables

## 2. API project (`backend`)

1. Vercel → **Add New → Project** → import `loan-webapp`.
2. **Root Directory: `backend`**. Framework Preset: **Other**. Leave build and output settings as they are
   (`backend/vercel.json` sets them: it runs `npm run vercel-build`, which creates/updates the tables).
3. **Environment Variables** (Production):

| Name | Value |
|---|---|
| `DATABASE_URL` | pooled address of `samiti`, with `&pgbouncer=true&connection_limit=1` added at the end |
| `DIRECT_DATABASE_URL` | direct address of `samiti` |
| `TEST_DATABASE_URL` | pooled address of `samiti_practice` + `&pgbouncer=true&connection_limit=1` (leave out to turn practice mode off) |
| `DIRECT_TEST_DATABASE_URL` | direct address of `samiti_practice` |
| `JWT_SECRET` | a new random value: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |
| `ADMIN_SECRET_CODE` | a new secret code for admin login — **not** the one used while testing |
| `APP_ORIGIN` | the website address from step 3, e.g. `https://samiti.vercel.app` (fill in after step 3) |
| `FIREBASE_PROJECT_ID` | `jaipur-comitte` |
| `DEVELOPER_NAME`, `DEVELOPER_MOBILE`, `DEVELOPER_DOB`, `DEVELOPER_EMAIL` | your developer account (created on the first request) |
| `PLATFORM_FEE_PAISE` | `1245` |
| `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET` | from the Razorpay dashboard (test keys first) |

4. **Deploy**. Then open `https://<api-project>.vercel.app/health` — it should show `{"ok":true}`.

## 3. Website project (`frontend`)

1. Vercel → **Add New → Project** → import `loan-webapp` **again**.
2. **Root Directory: `frontend`**. Framework Preset: **Next.js**.
3. Environment Variable: `API_ORIGIN` = `https://<api-project>.vercel.app` (no slash at the end).
   The build stops with a clear message if this is missing.
4. **Deploy**.

## 4. Connect the two

1. API project → Settings → Environment Variables → set `APP_ORIGIN` to the website address
   (comma-separate several, e.g. `https://samiti.vercel.app,https://hisab.example.in`) → **Deployments → Redeploy**.
   Changes from any other address are refused, so preview links (`…-git-…vercel.app`) can't save anything — use the main address.
2. **Firebase** console → Authentication → Settings → **Authorised domains** → add the website domain.
3. **Razorpay** → Webhooks → URL `https://<website>/api/v1/webhooks/razorpay`, events `payment.captured`, `payment.failed`, `order.paid`,
   secret = `RAZORPAY_WEBHOOK_SECRET`.
4. Own domain (optional): website project → Settings → Domains. Add it to `APP_ORIGIN` and Firebase too.

## 5. First login

Open the website, type the developer mobile number → date of birth → secret code. Add the admin(s) from **Team**,
then members. The live database starts empty — records on your computer are not copied up.
(To move them: on your computer `cd backend && npm run backup`, then point `DATABASE_URL` at Neon's direct address and run `npm run restore -- <file>`.)

## Good to know

- **Updates**: every push to `main` redeploys both projects. Database changes in `backend/prisma/migrations` are applied automatically during the API build.
- **Backups**: Neon keeps a restore history (see Neon → Branches → Restore). Also download a backup now and then from
  **Settings → Backup** in the app. That file has all records but not the Aadhaar/PAN photos (those stay in the database).
- **Size limit**: Vercel accepts at most 4.5 MB per request. Loan document photos are shrunk in the browser (≈150–400 KB each), so this is not reached in normal use.
- **First request after a quiet period** can take 1–3 seconds while the API wakes up.
- `npm run backup` / scheduled backups to disk are for a computer or VPS; on Vercel rely on Neon + the in-app download.
