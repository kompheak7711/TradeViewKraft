# Supabase (Free plan)

1. Create a project at https://supabase.com (Free tier).
2. Authentication → Providers → Email: enable **Email** and keep "Confirm email" on; magic links are used (no passwords).
   Add your site URL and the Vercel preview/production URLs under Authentication → URL Configuration → Redirect URLs.
   For the Mac app add `tauri://localhost` and `http://tauri.localhost`.
3. SQL editor → run `migrations/0001_init.sql`.
4. Project Settings → API: copy the URL and the anon key into `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`.

Notes:
- Free projects **pause after 7 days of inactivity**; open the dashboard and click "Restore" to resume. The app keeps
  working locally while paused and re-syncs when the project is back.
- Realtime on the Free plan allows 200 concurrent connections and 2 million messages/month, far above personal use.
