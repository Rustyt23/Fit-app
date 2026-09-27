# Family Fit 💪

A small web app for the family to follow their **exercise, supplement and medicine routines**, with a **daily leaderboard with photos** and a monthly ranking for the gift winners.

## What's in Phase 1

- **Family login:** tap your photo, then enter your 4–6 digit PIN (5 wrong tries locks that person for 2 minutes).
- **Admin panel:** add members (name, photo, PIN, admin or not), assign each person's routine (type, what, details, time, days of the week), edit or remove items, see recent changes.
- **Today screen:** each person's own checklist grouped by morning/afternoon/evening/night, one-tap tick and untick, "due now" and "missed the time" hints, a progress ring and the family strip.
- **Leaderboard:** Today, This week and This month, with a photo podium, "Star of the day" and 🎁 badges for the monthly top 2.
- **Installable on phones** (PWA): "Add to Home Screen" gives it an app icon.

## What's in Phase 2

- **🔔 Reminders:** a phone notification at the time of each routine item. If a **medicine** still isn't ticked an hour later, the person gets a nudge and the **admins get a caregiver alert** ("Grandma hasn't ticked her BP tablet"). Each person turns it on from their **Me** page. This needs HTTPS (see below).
- **🔥 Streaks:** days in a row with at least 75% of your routine done. Today only breaks a streak once the day is over.
- **🏅 11 badges:** First Step, Perfect Day, On Fire (3-day streak), Unstoppable (7), Legend (30), Early Bird, Perfect Pill, Century, Star of the Day, Perfect Week and Champion.
- **🏆 Weekly and monthly awards:** Champion, Most Improved, Streak Star, Early Bird and Perfect Pill. These give different people a chance to win, not only the fittest.
- **🤒 Sick / travel breaks:** break days don't count for scores, streaks or reminders.
  - Members can start their own break from today (up to 30 days) and end it early.
  - Admins can also add or remove breaks for others, including past ones such as a hospital stay.
  - Every break is logged and shown to the family.
- **🪙 Coin shop:** everyone earns gold coins, and admins stock the shop (7 starter rewards with one tap) and can edit any reward's name, emoji and price. Members request a reward, and an admin marks it given or declines it, which refunds the coins. With more than one admin, your own requests must be approved by another admin.
- **❓ Mystery rewards:** an admin can mark a reward as hidden. Members see "Mystery reward" and its price, and the real reward is revealed only once they buy it (it's never sent to their phone before that).
- **⏱️ Automatic weekly and monthly events:** a weekly challenge (Monday to Sunday) and a monthly championship, each with a **live countdown**.
  - Admins choose the prizes for 1st, 2nd and 3rd: coins and/or a real prize, which can be kept a **surprise** until the event ends.
  - When the countdown ends, the winners are locked in automatically, prize coins are added, and winners get a notification.
  - Real prizes appear in Admin → "Needs your attention" until they're marked delivered. Past winners are in the **Hall of Fame**.

### Everyday features

- **🕙 Forgot to tick?** Yesterday's items can still be ticked until **10 AM**. They count as done, just not "on time". Weekly and monthly winners are picked at 10 AM the day after an event ends, so these late ticks still count.
- **📴 Works offline:** once opened over https, the app keeps working without internet. Ticks are saved on the phone (shown with ⏳) and sent automatically when it's back online, with the time they were really tapped.
- **🔠 Hindi and large text:** each person picks English or हिन्दी, and normal or large text, under **Me → Settings & more → Display & language**. Admins can also set it for them, e.g. for grandparents. Member screens are translated; the admin area stays in English.
- **🎯 Event themes:** each week or month can be judged on the full routine, exercise only, punctuality (share on time), medicine on time, or most improved. By default the weekly challenge **rotates** through themes automatically.
- **🌤️ Flexible time:** an item can be "at a set time" or "any time of day". Any-time items are never late, sit under "Any time today", and get one reminder at 6 PM if not done.
- **🔁 Flexible days:** "set days", "N times a week" (once to 6×) or "N times a month" (once to 4×, e.g. a monthly check-up), on any days. A weekly or monthly item shows every day until it has been done enough times that week or month. Whatever is still missing counts on the last day (Sunday, or the month's last day). Weeks and months the item only partly covers (added part-way through, or break days) get a smaller target, e.g. 3× a week from Thursday → 2, or twice a month from the 16th → once.
- **✨ Your own types:** besides exercise, supplement and medicine, an item can be your own type with its own name and emoji (🧘 Mind, 💧 Water, 📖 Reading…). Types already in use are offered as quick picks. They count in the score and earn coins like the others, with their own row in **Rules & coins**.
- **🪙 Coins and ➖ penalties per item:** an admin can give an item its own coin reward (overriding the coin rules; late ticks get half) and a penalty taken when it's missed. Penalties are only taken once a day is final (after the next morning's 10 AM window), never on break days, and for weekly and monthly items only for the sessions still missing at the end of the week or month. Members see "+10 🪙" and "−5 if missed" on the item, and the Shop shows how many coins were lost.
- **🔑 PIN 0000 to start:** new members get PIN **0000** unless the admin types one. The admin page shows who is still on 0000, and an admin can set a proper PIN or reset someone back to 0000 any time.

### Simple by design

- **Today shows what matters now:** an **Up next** card with the most urgent item, the rest below, and finished items folded into "N done today". The weekly challenge and the family's progress share one compact card.
- **Swipe right to tick** (or tap), with a small buzz on phones. **Confetti** when the whole day is done, once a day.
- **Weekly recap** on Sundays (week so far) and Mondays (last week): score vs the week before, tasks done, perfect days, best day, coins, weekly-challenge place, new badges. Also under **Me → My week**.
- **Large text** also simplifies Today: just the name, the time and a big tick circle.
- **Folding sections** everywhere (Admin, member pages, Me), each with a one-line summary while closed.
  - **Me** shows just My week, Badges and **Settings & more** (break, reminders, language, photo, PIN, home screen).
  - A member's admin page keeps breaks and profile together under **Breaks & profile**.
  - **Admin** shows what needs you (folded, with a count), the family, the add buttons and one **⚙️ Setup** group holding Rules & coins, Events & prizes, Coin shop, Family name and Recent changes.
- Orange is used only for things that **need you** (due now, missed, requests, prizes to hand over). Everything else stays calm.
- **Admin shortcuts:** one-tap **quick-add templates** (walk, yoga, gym 3×/week, vitamin D3, BP tablet…). The task form shows only the everyday choices: who, type, what, when, how often, and coins and penalty. Details and importance sit under **More options**. New items start as **any time of day**, **+2 coins** when done and **−1** if missed. Quick-add templates keep their suggested times. **Coin presets:** Normal / Generous / Strict, or Custom for every number.
- **One item for several people:** when adding an item, tap the photos of everyone who should get it (or **Everyone**), e.g. a protein shake every day for the whole family. This works from **Admin → Add one item for several people** or from any member's page. Each person gets their own copy, so it can still be changed for one person later. Anyone who already has an item with that name is skipped. An existing item can also be copied as it is with **Give this to others too**.
- **Remove several items at once:** on a member's page, open **Remove several items**, tick the ones to go (or **Select all**) and remove them with one tap. As with removing one item, days already done keep their scores and coins.

### What admins decide (Admin page)

| Section | What you control |
|---|---|
| 👨‍👩‍👧 Members | Names, photos (add, change or remove), PINs (0000 by default), language and text size, admin rights, routine, breaks |
| ⚖️ Rules & coins | How much each activity type (including your own types) counts towards the score %, and coins for every activity and bonus |
| Routine item | Who gets it (one person, several or everyone); type (or your own, with a name and emoji); set time or any time; set days, N times a week or N times a month; **importance** (×1, ×2, ×3); its own coins; a penalty if missed |
| 🏆 Events & prizes | What each event is judged on (or rotate automatically), prizes per place, and whether each one is a surprise |
| 🛍️ Shop | Rewards, their prices, and which ones are mystery rewards |

### How coins are earned (admins choose the amounts)

In **Admin → Setup → Rules & coins**, admins set coins per activity type, on time and late (exercise, supplement, medicine, your own types), plus the bonuses for a Perfect Day, Star of the Day, Perfect Week and every other badge. Defaults: 2 on time / 1 late for every type, and bonuses of 5 / 5 / 10 / 20.

A change counts **from that day on**. Coins already earned never change, so nobody's balance jumps or goes negative. Coins, streaks and badges are all calculated from the check-in history, so unticking a task takes its coins back and nothing can be counted twice.

### How the score works

Each day, score = the share of **your own** routine you ticked, weighted by what matters more. Each item counts as (its type's weight) × (its importance). With all weights at 1 it's a plain percentage. The period score is the average of the daily scores. Weight changes, like coin changes, count from that day on. This way someone with 3 items competes fairly with someone who has 12. Equal (rounded) scores share a rank. The list order is then decided by how many were done on time (up to 60 minutes after the set time).

- Members can only tick **their own** items and only **for today**. Nobody, not even an admin, can edit past days.
- Medicines are only visible to the person and admins. The leaderboard only shows percentages.
- Removing or re-scheduling an item never changes past scores: old versions are kept with an end date.

## Running it for the family

Needs **Node.js 22.13 or newer** (it uses Node's built-in SQLite, so nothing else to install).

```bash
npm install
npm run build
npm start
```

Then open `http://localhost:3000` on this computer. The first visit asks you to create the family and your admin account.

**On phones:** the phones must be on the same Wi-Fi. Find this computer's IP address (macOS: `ipconfig getifaddr en0`) and open `http://<that-ip>:3000` on each phone. The computer has to stay on for the app to work.

## Putting it online (Cloudflare)

See **[DEPLOY.md](DEPLOY.md)**. There are two ready-made options, and both make reminders work on phones:
- **A. Cloudflare Tunnel:** the app keeps running on your computer, and Cloudflare gives it `https://yourdomain.com`.
- **B. Cloudflare Workers + D1:** fully serverless. `npm run cf:deploy` uploads it, D1 holds the data and a Cron Trigger runs the reminders.

### Turning on reminders (needs HTTPS)

Phones only allow notifications from `https://` sites, so plain `http://192.168.x.x:3000` isn't enough for reminders. Everything else works fine over plain http. Two easy options:

- **Cloudflare Tunnel (recommended, uses your domain):** see [DEPLOY.md](DEPLOY.md).
- **Tailscale (free, private):** install Tailscale on this computer and on each family phone. Then run `tailscale serve --bg 3000` and open the `https://<computer-name>.<tailnet>.ts.net` address it prints.
- **Your own server:** run the app on a small VPS or home server behind HTTPS (for example Caddy, which gets certificates automatically).

When serving over HTTPS, start with `COOKIE_SECURE=true npm start`. On **iPhone**, each person must first *Add to Home Screen* and open the app from there (iOS 16.4+). Then they tap **Me → Settings & more → Reminders**.

### Settings (environment variables, all optional)

| Variable | Default | What it does |
|---|---|---|
| `DB_PATH` | `data/family.db` | Where the database file lives |
| `APP_TIMEZONE` | `Asia/Kolkata` (IST) | The family's timezone for "today", the 10 AM window and event end times |
| `COOKIE_SECURE` | off | Set to `true` when serving over HTTPS |
| `SESSION_SECRET` | auto-generated | Only needed if you run several servers |
| `VAPID_SUBJECT` | `mailto:family-fit@example.com` | Contact address sent to push services, e.g. `mailto:you@yourmail.com` |
| `REMINDERS` | on | Set to `off` to stop the reminder scheduler |
| `CRON_SECRET` | none | Cloudflare only: protects `/api/cron`, which the Cron Trigger calls |

### Backups

All data (members, photos, routines, check-ins) is in **one file: `data/family.db`**. `npm run backup` saves a safe copy to `data/backups/` (newest 30 kept). DEPLOY.md shows how to run it automatically every night.

## Try it with a demo family

```bash
npm run seed:demo
npm run dev:demo
```

This creates `data/demo.db` with 4 members on PIN 0000 (Grandma uses Hindi with large text), 6 weeks of history (so past weeks and last month have winners), a sick break and a stocked coin shop. Your real data isn't touched.

## Development

```bash
npm run dev        # http://localhost:3000 with hot reload
npm run typecheck
npm run lint
npm test           # 71 automated tests: scoring, weekly/monthly items, own types, adding for several people, removing several, weights, breaks, streaks, themes, events, coins, PINs, push, dates, migrations, translations
npm run backup     # copy of data/family.db into data/backups/
npm run cf:preview # the Cloudflare Workers build, locally (see DEPLOY.md)
npm run cf:export  # data/family.db as SQL for importing into D1
```

- `migrations/*.sql`: the database schema, applied automatically on your computer and by `wrangler d1 migrations apply` on Cloudflare
- `src/lib/db.ts`: database access, which picks `db-node.ts` (SQLite file) or `db-d1.ts` (Cloudflare D1)
- `src/lib/data.ts`: queries
- `src/lib/rules.ts`: admin-editable score weights, coin amounts and event prizes
- `src/lib/stats.ts`: scores, streaks, badges, coins, awards and weekly/monthly events, all derived from history
- `src/lib/scheduler.ts`: runs every minute (started from `src/instrumentation.ts`, or by the Cloudflare Cron Trigger via `/api/cron`)
- `src/lib/webpush.ts`: web push with Web Crypto only (works in Node and Workers)
- `src/lib/photos.ts`: profile photos in Cloudflare R2 (or in the database on your own computer)
- `src/lib/i18n.ts`: English and Hindi text; `src/lib/themes.ts`: event themes; `src/lib/tick-window.ts`: the 10 AM rule
- `public/sw.js` + `src/components/OfflineSync.tsx` + `src/lib/offline-queue.ts`: offline use and syncing ticks
- `tests/`: the automated tests (`npm test`)
- `cloudflare/worker.ts`, `wrangler.jsonc`, `open-next.config.ts`: the Cloudflare Workers setup
- `src/app/actions.ts`: every write (each one checks who's logged in and what they're allowed to do)
- `src/app/(app)/`: Today, Ranking, Admin and Me screens

## Next (Phase 3 ideas)

Health logs (weight, BP, sugar, sleep, water) with charts and a PDF report for the doctor, medicine stock and refill alerts, step-count sync, monthly family challenges, WhatsApp weekly recap, and elderly/kids modes.
