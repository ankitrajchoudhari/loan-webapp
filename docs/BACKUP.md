# Backup and recovery

Financial records must survive a broken server, a bad update or a mistake. Use **three layers**:

| Layer | What | How often | Who |
|---|---|---|---|
| 1. Database host backups | Managed PostgreSQL daily snapshots (point-in-time if offered) | Automatic, daily | Hosting provider |
| 2. Server JSON backup | `npm run backup` → `backend/backups/samiti-backup-YYYY-MM-DD-*.json` (newest 60 kept) | Daily (scheduled) | Server |
| 3. Off-site copy | Admin downloads **खाते की सेटिंग → बैकअप फ़ाइल डाउनलोड करें** and keeps it on a pen drive + email | At least monthly | Admin |

The JSON backup contains every table: members, installments, loans, repayments (including cancelled entries), old-record batches, settings and the full change log. It does not contain admin PINs.

## Scheduling the daily backup

**Linux (cron)** — every night at 23:30:
```
30 23 * * * cd /srv/samiti/backend && /usr/bin/node --env-file=.env scripts/backup.js >> backups/backup.log 2>&1
```
Then copy `backups/` off the server (e.g. `rclone copy backups remote:samiti-backups`).

**Windows (Task Scheduler)** — action: `node`, arguments: `--env-file=.env scripts/backup.js`, start in: `C:\...\shree-shyam-seva-samiti\backend`, trigger: daily.

**Database-level dump** (also restorable with standard tools), with the Docker setup:
```
docker exec samiti-db pg_dump -U samiti -Fc samiti > samiti-$(date +%F).dump
```

## Recovery

Always restore into a **new, empty** database first, check it, then switch over. Never restore on top of live data.

### From a JSON backup
```bash
# 1. create an empty database, e.g. samiti_restore, and point DATABASE_URL at it in .env
# 2. create the tables
cd backend
npx prisma migrate deploy
# 3. load the backup (refuses if the database already has members)
npm run restore -- backups/samiti-backup-2026-10-16-....json
# 4. recreate the admin login (PINs are not in backups)
npm run seed:admin
```
Start the backend against it, log in, compare the home-page totals and a few member statements with the last printed reports, then point the live `DATABASE_URL` at the restored database.

### From a pg_dump file
```
createdb -U samiti samiti_restore
pg_restore -U samiti -d samiti_restore samiti-2026-10-16.dump
```

### Practice database
Practice data needs no backup: **खाते की सेटिंग → अभ्यास का हिसाब मिटाकर नया शुरू करें**, or `npm run practice:reset`.

## Test the recovery

Twice a year, restore the latest backup into a scratch database using the steps above and confirm the totals match. A backup that has never been restored is not proven.
