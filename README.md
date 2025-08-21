# CSCoaching Booking — Custom Hours & Colours

**Venues & Hours (PM):**
- **Monday — Scunthorpe**: 17:00–21:00 (4×1h)
- **Tuesday — Hull**: 17:00–22:00 (5×1h)
- **Wednesday — Shipley**: 18:00–22:00 (4×1h)
- **Thursday — Hull**: 17:00–22:00 (5×1h)
_All other days are blacked out._

**Theme:** Black, red, white.

## Features
- Members with session credits (1 credit per booking).
- Email confirmations (SMTP via `.env`).
- Admin dashboard (manage members, credits, slots with location).
- Spam protection (rate limit + honeypot).

## Run
```bash
npm install
cp .env.example .env  # set ADMIN_KEY, SMTP_* for real emails
npm start
```
Public: `http://localhost:3000`  
Admin:  `http://localhost:3000/admin` (enter your X-ADMIN-KEY)

## Notes
- Database seeds the **next 28 days** with only the specified evenings & venues.
- You can add more slots (with a chosen **location**) from the admin page.
- If you used a previous version, this adds a `location` column automatically.

— CSCoaching • Train. Strike. Repeat.
