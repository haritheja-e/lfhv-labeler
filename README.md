# A/B Video Labeling

Side-by-side video comparison tool. Each pair gets labeled by 3 distinct people; no labeler ever sees the same pair twice.

## Stack
- Next.js 15 (App Router) + React 19
- Supabase: Postgres + Auth (email magic link) + optional Storage
- Tailwind for styling
- Deploys to Vercel in ~2 minutes

## What's in the box
- `/login` — magic-link sign-in
- `/` — labeling UI: side-by-side video, choose Option 1 / Option 2 / Tie / Both bad, with keyboard shortcuts and undo
- `/admin` — progress dashboard (videos, pairs, total labels, completion %)
- `supabase/schema.sql` — tables, RLS policies, and the `get_next_pair` SQL function that handles "no labeler sees the same pair twice" and "prefer almost-done pairs"

## Setup

### 1. Create a Supabase project
1. Sign in at https://supabase.com and create a project.
2. SQL Editor → paste `supabase/schema.sql` → run.
3. Authentication → Providers → enable **Email** (magic link is on by default).
4. Authentication → URL Configuration:
   - **Site URL:** your production URL (e.g. `https://ab-labeling.vercel.app`).
   - **Redirect URLs:** add both `http://localhost:3000/**` and `https://your-prod-url/**`.

### 2. Run locally
```bash
cp .env.example .env.local
# Fill in NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY
# from Supabase: Project Settings → API.

npm install
npm run dev
```
Open http://localhost:3000 — you'll be redirected to `/login`.

### 3. Add videos and pairs
In the Supabase SQL editor:

```sql
-- Option A: link any publicly hosted MP4
insert into videos (url, label) values
  ('https://example.com/clip1.mp4', 'baseline'),
  ('https://example.com/clip2.mp4', 'method-a'),
  ('https://example.com/clip3.mp4', 'method-b');

-- Generate every unordered pair (n*(n-1)/2 pairs from n videos)
insert into pairs (video_a_id, video_b_id)
select v1.id, v2.id
from videos v1
join videos v2 on v2.id > v1.id
on conflict do nothing;
```

If you want a more targeted comparison (e.g. only baseline vs each method), just write a more specific INSERT.

**Hosting the videos themselves:** any public URL works (S3, R2, GCS, Backblaze, even YouTube downloads served from a bucket). Or use Supabase Storage — upload via the Storage tab in Supabase Studio, then use the public URL. For private videos use a signed URL that expires long enough for labeling.

### 4. Deploy to Vercel
1. Push to GitHub (a sub-repo or its own repo — either works; for a sub-repo, set the Vercel project's Root Directory to `ab-labeling`).
2. Import on Vercel, add the two env vars, deploy.
3. Add the production URL to Supabase's Site URL + Redirect URLs.

Share the URL with your labelers — first visit prompts for email, then they're in.

## How a labeling session works
- The server calls `get_next_pair(labeler_id)` which:
  - excludes pairs the labeler has already labeled,
  - excludes pairs that already have 3 labels,
  - sorts by `count(labels) DESC, random()` — so partially-labeled pairs converge to 3 before starting fresh pairs.
- The UI randomizes left/right placement each pair to reduce side bias.
- View duration is recorded for later filtering of suspiciously fast labels.
- When the function returns nothing, the labeler sees "All done".

Keyboard: `1` Option 1 · `2` Option 2 · `3` Tie · `4` Both bad · `space` play/pause both · `r` restart · `u` undo last.

## Querying results
```sql
-- Per-pair majority winner
select pair_id,
       mode() within group (order by choice) as winner,
       count(*) as votes
from labels group by pair_id;

-- Per-person label counts
select u.email, count(l.*)
from auth.users u
left join labels l on l.labeler_id = u.id
group by u.email order by 2 desc;

-- Average view time per choice (sanity check)
select choice, avg(view_duration_ms) as ms
from labels group by choice;
```

## Notes
- `UNIQUE(pair_id, labeler_id)` physically prevents a labeler from labeling the same pair twice, even if they race two tabs.
- `get_next_pair` is `STABLE` (not `SECURITY DEFINER`) and runs as the calling user. The `labels` RLS policy currently lets any authenticated user read all labels (needed to compute counts inside the function). If you want stricter privacy, make `get_next_pair` `SECURITY DEFINER` and tighten the SELECT policy on `labels` to `using (labeler_id = auth.uid())`.
- No service-role key is needed in this app — everything runs through the anon key + user JWT.
