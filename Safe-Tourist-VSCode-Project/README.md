# Safe Tourist VS Code Project

Smart Tourist Safety Monitoring and Incident Response System.

## Structure
- `index.html` — main HTML
- `css/style.css` — project CSS
- `js/app.js` — project JavaScript
- `assets/` — local assets

## Run in VS Code
Use Live Server or another local HTTP server and open `index.html`.

Live Location requests browser GPS only when the user presses the map location button; it does not request permission automatically on page load.

## Supabase setup

1. Create a Supabase project and enable Email/Password authentication.
2. Run `supabase/schema.sql` in the Supabase SQL Editor.
3. Set `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY` in `js/app.js` to your project values. Never expose a service-role key in this browser app.
4. If email confirmation is enabled, add your Live Server address (for example `http://127.0.0.1:5500`) to Supabase Auth redirect URLs.

The database stores the signed-in tourist's profile, location, and incidents. RLS limits those records to their owner; safety zones are public read-only map data. The built-in authority account remains an offline demo. A real authority dashboard needs a verified authority role and a server-side or Edge Function API—do not make all tourist data publicly readable to implement it.
