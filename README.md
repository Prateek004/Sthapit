# Sth1r POS

**Billing that works even offline** — by [Sthappit](https://sthappit.com)

Sth1r is an offline-first Point of Sale PWA for Indian F&B businesses (cafes, restaurants, food trucks, kiosks, bakeries, franchises).

## Stack
- Next.js 14 (App Router)
- TypeScript
- Tailwind CSS
- Dexie (IndexedDB) — all data local-first
- Supabase — cloud backup when online
- Lucide React icons

## Fonts
- **Syne 800** — logo, screen titles
- **Instrument Serif italic** — brand accent moments
- **DM Sans 400–800** — all UI text

## Setup
```bash
npm install
cp .env.local.example .env.local
# Fill in your Supabase URL + anon key
npm run dev
```

## Environment variables
```
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
```

The app works fully without Supabase — all data stays in IndexedDB. Supabase is used only for cloud backup and cross-device sync.

## Data migration
On first load the app auto-migrates:
- `vynn_db` (IndexedDB) → `sth1r_db`
- `servezy_db` (IndexedDB) → `sth1r_db`
- `vynn_session` / `vynn_cart` / `vynn_ui` (localStorage) → `sth1r_*` keys

Old data is only deleted after a successful copy.
