# Sandhani GSVMC Unit — Blood Donation Digital System (Phase 1 Website)

**Status:** Live-wired to Supabase (real data, real auth). Bangla-first, mobile-responsive, red/blue/white theme matching the Sandhani logo. See `SUPABASE_WIRING.md` for the endpoint map.

## How to open
Serve the folder statically, e.g. `cd ~/workspace/sandhani-blood-system/site && python3 -m http.server 8000` → open http://localhost:8000 (login/member pages need the Supabase backend, which is configured in `js/config.js`).

## Pages
| Page | Who |
|---|---|
| `index.html` | Public — hero, live stock board (counts only, with last-updated time), কার্যক্রম (blood highlighted + vaccines with responsibility), নিয়মাবলী, footer |
| `request.html` | Public — emergency request form → tracking number + private tracking link |
| `track.html` | Public — enter tracking number → request thread + reply to team (no login) |
| `shikkha.html` | Public — donor education: eligibility, 120-day rule, compatibility chart, myths vs facts |
| `login.html` | Member login (Supabase Auth — real accounts, created by admin in Supabase Dashboard) |
| `member/dashboard.html` | Team — pending counts, stock summary, upcoming promised donations |
| `member/donors.html` | Team — ⭐ donor search (blood group + area + name, eligible-only filter), 📞 call buttons (tel:), call-outcome entry, call history timeline, add donor |
| `member/inbox.html` | Team — request list, thread view, reply, status change, assign handler, add exchange-due |
| `member/stock.html` | Team — update bag counts per group (logged with who/when) |
| `member/exchange.html` | Team — exchange-due list, mark received → auto-adds to stock |
| `member/users.html` | **Admin only** — add/deactivate team members |

## Architecture (important)
All pages talk to `js/app.js`'s **SB client + Auth** (vanilla `fetch` against Supabase REST/Auth — no CDN/SDK). `js/config.js` holds only the public project URL + anon key; RLS in the database enforces every access rule server-side. The only `localStorage` use left is the login session (`sandhani-session`). Backend details per page: `SUPABASE_WIRING.md`.

Key logic: 120-day donor eligibility blackout (client-computed from `last_donation_date`), client-generated tracking numbers (SB- + 5 random digits, retry on unique conflict), donor promised dates, exchange-received → stock increment.

## What's still needed for production
1. **Hosting** — free: GitHub Pages (static). The member area + backend stay on Supabase.
2. **Team accounts** — created in Supabase Dashboard → Authentication → Users; each needs a matching `profiles` row (role team/admin, active) before login works.
3. **PWA (Phase 2)** — manifest + service worker for installable app, free push via web push.
4. **SMS/WhatsApp alerts (optional)** — costs money; start with in-app + manual WhatsApp broadcast by the team.

## Privacy rules enforced in code
- Public pages never fetch or render donor names/phones — anonymous visitors can read stock counts only (RLS: anon sees 0 donor rows).
- Member pages require a valid Supabase session + active profile; `users.html` requires `role: admin`.
- No donor names/phones are hardcoded anywhere in the site code.

## Logo
`../assets/sandhani-logo.jpg` (relative reference from `site/`).
