# Putting Family Fit online with Cloudflare

There are two ways. Both give you `https://yourdomain.com` with Cloudflare in front, and both make phone reminders work.

| | **A. Cloudflare Tunnel** | **B. Cloudflare Workers + D1** |
|---|---|---|
| Where the app runs | A computer you own (Mac, PC, Raspberry Pi, VPS) | Cloudflare's servers: nothing to keep switched on |
| Database | SQLite file `data/family.db` | Cloudflare D1 (managed SQLite) |
| Reminders & events | Built-in every-minute scheduler | Cloudflare Cron Trigger (every minute) |
| Cost for a family | Free (plus electricity) | Workers Paid, about $5/month (see note below) |
| Backups | `npm run backup` | D1 Time Travel: automatic point-in-time restore (7 days on the free plan) |

The same code runs in both, and you can start with A and move to B later ("Moving from A to B" below).

---

# Option A: Cloudflare Tunnel (the app on your own computer)


## A1. Prepare the computer (once)

Needs **Node.js 22.13+** (`node -v`).

```bash
cd family-fit
npm ci
npm run build
npm install -g pm2
```

Start it, and keep it running across crashes and restarts. Change the timezone and email to yours:

```bash
VAPID_SUBJECT=mailto:you@example.com pm2 start npm --name family-fit -- run start:public
pm2 save
pm2 startup      # prints one command; run it so the app starts after a reboot
```

`start:public` listens only on `127.0.0.1:3000` (only the tunnel can reach it) and turns on secure cookies.

**On a Mac:** stop it from sleeping: System Settings → Energy (or Battery → Options) → *Prevent automatic sleeping when the display is off*, and turn on *Start up automatically after a power failure*.

## A2. Test on phones before you buy the domain (optional)

```bash
brew install cloudflared
cloudflared tunnel --url http://localhost:3000
```

It prints a temporary `https://something.trycloudflare.com` address. Open it on your phones: login, check-ins and **reminders** all work. The address changes every time you run the command, so it's only for testing.

## A3. Buy the domain and add it to Cloudflare

Easiest: Cloudflare dashboard → **Domain Registration → Register Domains**. It is then already on Cloudflare.
If you buy it elsewhere, add the site in Cloudflare and change the domain's nameservers to the two Cloudflare gives you.

## A4. Create the permanent tunnel

In the Cloudflare dashboard: **Zero Trust → Networks → Tunnels → Create a tunnel → Cloudflared**, name it `family-fit`.

1. Pick your OS. Cloudflare shows an install command containing a token, like `sudo cloudflared service install eyJ…`. Run it on the computer. The tunnel now starts automatically at boot.
2. **Public hostname:** subdomain `fit` (or leave empty for the bare domain), domain `yourdomain.com`, service type **HTTP**, URL `localhost:3000`. Save.

Open `https://fit.yourdomain.com`. On a fresh database it asks you to create the family.

Recommended Cloudflare settings for the domain:
- **Speed → Optimization → Rocket Loader: Off** (it rewrites the app's scripts).
- Leave caching at the defaults. Cloudflare doesn't cache the app's pages, which is what you want.

## A5. After it's live

- Everyone opens the new address, logs in, **adds it to the Home Screen** again, and turns reminders on (**Me → Turn on reminders**). Reminders are tied to the web address, so the test address from step A2 doesn't carry over.
- **Backups:** the whole family's data is the single file `data/family.db`. `npm run backup` makes a safe copy (even while the app is running) in `data/backups/`, and keeps the newest 30. Make it automatic every night at 3 AM:
  ```bash
  pm2 start npm --name family-fit-backup --cron "0 3 * * *" --no-autorestart -- run backup
  pm2 save
  ```
  Now and then, also copy `data/backups/` off the computer, for example to iCloud Drive or Google Drive. To put the app on another machine later, copy `data/family.db` along with it.
- **Updating the app later:** `git pull` or copy the new files, then `npm ci && npm run build && pm2 restart family-fit`.
- **Extra lock (optional):** Cloudflare **Zero Trust → Access** can ask for a one-time email code before anyone reaches the site, and you list only the family's emails. This adds to the PINs, it doesn't replace them.

---

# Option B: Cloudflare Workers + D1 (serverless)

Everything runs on Cloudflare, so there's no computer to keep on. The setup is already in the project: `wrangler.jsonc`, `open-next.config.ts`, `cloudflare/worker.ts` and `migrations/`.

## B1. One-time setup

```bash
cd family-fit
npm ci
npx wrangler login                     # opens the browser to sign in to Cloudflare
npx wrangler d1 create family-fit      # prints a database_id
```

1. Put that `database_id` into **`wrangler.jsonc`** (replace the zeros).
2. Create the bucket for profile photos: `npx wrangler r2 bucket create family-fit-photos`
3. In `wrangler.jsonc` → `vars`, set **`VAPID_SUBJECT`** (`mailto:` + your email). The timezone is already India (IST).
4. Set a secret that protects the every-minute scheduler. Paste a long random string when asked, e.g. from `openssl rand -hex 32`:
   ```bash
   npx wrangler secret put CRON_SECRET
   ```
5. Create the tables and deploy:
   ```bash
   npm run cf:migrate     # applies migrations/*.sql to D1
   npm run cf:deploy      # builds and uploads; prints https://family-fit.<you>.workers.dev
   ```

Open the printed address. It asks you to create the family.

> **Plan:** the app fits the Free plan's size limit (about 2 MB of the 3 MB allowed), but the Free plan allows only
> **10 ms of CPU per request**. Rendering pages and checking PINs will sometimes need more, and those requests would fail
> with "Error 1102". Use **Workers Paid** (about $5/month, which also covers D1 and R2 at family scale). Option A stays free.

## B2. Your domain

Cloudflare dashboard → **Workers & Pages → family-fit → Settings → Domains & Routes → Add → Custom domain** → `fit.yourdomain.com`. Cloudflare sets up DNS and HTTPS automatically.

## B3. Updating later

```bash
npm run cf:migrate     # only needed when a new file appears in migrations/
npm run cf:deploy
```

## Try it locally first (no Cloudflare account needed)

```bash
cp .dev.vars.example .dev.vars
npm run cf:migrate:local
npm run cf:preview     # runs in Cloudflare's real runtime at http://localhost:8787
```

## Moving from A to B (keeping all your data)

1. On the computer: `npm run cf:export` creates `data/d1-export.sql`, with every member, photo, check-in, reward and result.
2. Do B1 steps 1–4, but **skip `npm run cf:migrate`**. The export already contains the tables and the list of applied migrations.
3. `npx wrangler d1 execute family-fit --remote --file=data/d1-export.sql`
4. `npm run cf:deploy`, then add your domain (B2).

Everyone logs in again at the new address and turns reminders back on (**Me → Turn on reminders**).

## Troubleshooting

| Problem | Fix |
|---|---|
| Pages load but buttons don't save ("Invalid Server Actions request") | In the tunnel's public hostname, don't set a custom *HTTP Host Header*. The app must see the same host the browser uses. |
| Reminder card says "secure (https://) sites only" | You're on `http://…:3000`. Use the `https://` Cloudflare address. |
| iPhone: no reminder button | Add to Home Screen first, open it from there (iOS 16.4+). |
| Logged out after the switch | Expected: cookies belong to each address. Log in again. |
| Wrong "today" around midnight | The app always uses India time (IST). To change it, set `APP_TIMEZONE` (Option A: in the pm2 command, then `pm2 restart family-fit --update-env`; Option B: in `wrangler.jsonc`, then deploy). |
| Option B: "Error 1102" / "exceeded CPU" | You're on the Workers Free plan. Switch to Workers Paid (see the note under B1). |
| Option B: reminders never arrive | Check `CRON_SECRET` is set (`npx wrangler secret list`) and see the Worker's logs in the dashboard (Observability). |
