# Deploying Sampada to cPanel

This app is **file-based — there is no database to run**. The backend (NestJS)
stores everything as files under an uploads directory, and the same Node process
also serves the built React front-end. So a cPanel deploy is just:

1. Build the two artifacts **on your machine** (server bundle + web SPA).
2. Upload those artifacts + the `uploads/` data folder to cPanel.
3. Point cPanel's **Setup Node.js App** at the server bundle and set a few env vars.

> The legacy MariaDB dump you exported from cPanel (via **phpMyAdmin**) was only
> the *source* for a one-time migration. It has already been converted into the
> JSON files in `uploads/sample-deeds/records/`. You do **not** restore that dump,
> and you do **not** need MySQL or PostgreSQL on cPanel.

---

## 1. Build locally

Build on your laptop (cPanel shared hosting is a poor place to run pnpm/Node 22).
The server bundle is fully self-contained, so **no `node_modules` is uploaded**.

```bash
pnpm install
pnpm --filter @sampada/shared build
pnpm --filter @sampada/web build      # -> apps/web/dist        (the SPA)
pnpm --filter @sampada/api bundle     # -> apps/api/deploy/server.cjs  (the server)
```

After this you have three things to ship:

| Artifact | Local path | Size |
|----------|-----------|------|
| Server bundle | `apps/api/deploy/server.cjs` | ~4 MB |
| Built SPA | `apps/web/dist/` | small |
| Data ("the database") | `apps/api/uploads/` | ~254 MB |

---

## 2. Lay out files on the server

Pick a home directory on cPanel, e.g. `/home/<cpuser>/sampada`. Create this layout:

```
/home/<cpuser>/sampada/
├── server.cjs           <- from apps/api/deploy/server.cjs
├── web/                 <- contents of apps/web/dist/  (index.html, assets/, …)
└── data/                <- contents of apps/api/uploads/
    ├── guideline/
    ├── sample-deeds/
    ├── contact/
    ├── sites/
    ├── company-docs/
    ├── deeds/
    ├── profile-photos/
    └── users/
```

**How to upload the 254 MB `data/`:** zip `apps/api/uploads/` locally, upload the
zip via cPanel **File Manager** (or FTP), then Extract into `sampada/data/` so the
folders above sit directly inside `data/`.

> ⚠️ Path detail that matters: the app derives every data folder from the
> `guideline` folder's **parent**. So `UPLOAD_DIR` must point at
> `.../data/guideline`, and all the other folders (`sample-deeds`, `contact`, …)
> must be its siblings inside `data/`. The layout above already satisfies this.

---

## 3. Create the Node.js app in cPanel

cPanel → **Setup Node.js App** → **Create Application**:

| Field | Value |
|-------|-------|
| Node.js version | 18, 20, or 22 (any ≥ 18) |
| Application mode | Production |
| Application root | `sampada` (the folder from step 2) |
| Application URL | your domain / subdomain |
| Application startup file | `server.cjs` |

Passenger sets `PORT` automatically and runs `node server.cjs`; the app listens
on that port — nothing to configure there.

---

## 4. Environment variables

In the same Node.js App screen, add these under **Environment variables**
(use **absolute** paths):

| Variable | Value | Notes |
|----------|-------|-------|
| `WEB_DIST` | `/home/<cpuser>/sampada/web` | Folder with the SPA's `index.html`. |
| `UPLOAD_DIR` | `/home/<cpuser>/sampada/data/guideline` | Must be the `guideline` dir (see note above). |
| `CORS_ORIGIN` | `https://yourdomain.com` | Same origin serves API + SPA, so this is mostly a formality. |
| `ADMIN_EMAIL` | your admin login email | Interim admin auth. |
| `ADMIN_PASSWORD` | a strong password | |
| `JWT_SECRET` | a long random string | Also encrypts stored employee/partner passwords — set it and don't change it later. |
| `SMTP_USER` | a Gmail address | For OTP emails. Omit if you don't use email OTP. |
| `SMTP_PASS` | a Gmail **app password** | Not your normal Gmail password. |

Do **not** set `DATABASE_URL` / `LEGACY_DATABASE_URL` — they're unused.

Then click **Save** and **Restart** the app.

---

## 5. Verify

- Health check: `https://yourdomain.com/api/v1/health` should return OK.
- Open the site — the React app should load and list deeds.
- Log in as admin and open **All Deeds** to confirm the migrated records show up.

---

## Updating later

- **Code change** → rebuild locally (step 1), re-upload `server.cjs` and/or
  `web/`, then **Restart** the app in cPanel. You do **not** touch `data/`.
- **Data change made through the live site** stays in `data/` on the server —
  don't overwrite it with your local `uploads/` or you'll lose it. To pull a
  backup, download the server's `data/` folder.

## Re-running the legacy migration (only if needed)

If you ever need to re-import from a fresh phpMyAdmin dump, do it **locally**:

```bash
node apps/api/scripts/migrate-legacy-deeds.mjs infra/legacy-db/<dump>.sql
```

This rewrites `apps/api/uploads/sample-deeds/records/`. Then re-upload that folder
to the server's `data/sample-deeds/records/`.
