# 🥫 Kitchen — family kitchen & house inventory

Shared inventory, one-tap updates, barcode scanning, and a live shopping list for the whole household.

**Phase 1 (this build):** sign-in + family invites · inventory by location · one-tap −/+/Low/Used · quick-add with autocomplete · barcode scanning (Open Food Facts) · shared shopping list with low-stock auto-add · checking off puts it back in the house.

---

## Setup (one time)

### 1. Create the database
1. Supabase → your project → **SQL Editor** → **New query**.
2. Paste the whole contents of `supabase/schema.sql` → **Run**. You should see "Success. No rows returned."

### 2. Turn off email confirmation
Family members sign in with email + password (works reliably in the home-screen app).
Supabase → **Authentication → Sign In / Providers** → turn off **Confirm email** → Save.
Then **Authentication → URL Configuration** → set **Site URL** to your Vercel address (step 3).

### 3. Deploy on Vercel
1. Vercel → **Add New → Project** → import your `kitchen-app` GitHub repo.
2. Framework preset: **Vite** (auto-detected).
3. **Environment Variables** — add both:
   - `VITE_SUPABASE_URL` = your Supabase Project URL
   - `VITE_SUPABASE_ANON_KEY` = your anon/publishable key
4. **Deploy**. Copy the URL it gives you into Supabase's Site URL (step 2.4).

Every time new code is pushed to GitHub, Vercel redeploys automatically.

### 4. Put it on everyone's phone
- **iPhone:** open the link in **Safari** → Share button → **Add to Home Screen**.
- **Android:** open in **Chrome** → ⋮ menu → **Install app** / **Add to Home screen**.

---

## Phase 1 test checklist

Do these with two phones (yours + one other person's).

1. **Create household:** create an account on your phone → "Start a new household". You land on Home with Add/Scan buttons.
2. **Invite:** Family tab → Create invite link → send it. On phone #2, open the link, create an account, tap Join. Family tab on both phones shows 2 people.
3. **Quick add:** Add → "Milk", 2, Fridge, +7d → Add to house. It appears on **phone #2 within a couple seconds** without refreshing.
4. **Autocomplete:** Add → type "mi" → "Milk" chip appears → tap it, location auto-fills.
5. **Scan:** Scan → point at any grocery barcode → name fills in → Add. Scan the same item again → it's recognized instantly.
6. **One-tap actions:** on Milk tap **−**, **+**, **Low** (🛒 appears, Low greys out), **Used** (toast offers "Add to list").
7. **Auto low-stock:** tap Milk → set "Add to shopping list when total is at or below" = 1 → Save → tap − until it's 1. Milk shows up on the List as "Auto: running low".
8. **Shopping:** on phone #2, open List and check Milk off → it moves to Bought and Milk's count goes back up in Inventory on **both** phones. Check off an item that's never been in the house → it asks where it goes.
9. **Search:** Home → type something you don't have → "Add to shopping list" button works.
10. **Privacy check:** a third email that wasn't invited sees an empty "Welcome" screen, never your stuff.

Anything weird → screenshot it and tell Claude which step.

---

## Local development (optional)
```bash
cp .env.example .env   # fill in your values
npm install
npm run dev
```

## Roadmap
- **Phase 2:** recipes (manual + paste-a-link import with AI), tags
- **Phase 3:** "What can I make?" with almost-there matches and use-it-up priority
- **Phase 4:** expiration & low-stock push notifications
- **Phase 5:** receipt scanning, meal planner, grocery spend vs. budget
