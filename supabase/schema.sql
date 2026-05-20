-- A/B video labeling schema
-- Run this in the Supabase SQL editor.

create extension if not exists "pgcrypto";

-- Each video that may appear in a comparison.
create table if not exists videos (
  id uuid primary key default gen_random_uuid(),
  url text not null,
  label text,
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz default now()
);

-- Pre-generated pairs to label. Generate once, then labelers consume them.
create table if not exists pairs (
  id uuid primary key default gen_random_uuid(),
  video_a_id uuid not null references videos(id) on delete cascade,
  video_b_id uuid not null references videos(id) on delete cascade,
  created_at timestamptz default now(),
  unique (video_a_id, video_b_id),
  check (video_a_id <> video_b_id)
);

-- One row per (pair, labeler). UNIQUE prevents the same person labeling twice.
create table if not exists labels (
  id uuid primary key default gen_random_uuid(),
  pair_id uuid not null references pairs(id) on delete cascade,
  labeler_id uuid not null references auth.users(id) on delete cascade,
  choice text not null check (choice in ('a', 'b', 'tie', 'bad')),
  view_duration_ms int,
  created_at timestamptz default now(),
  unique (pair_id, labeler_id)
);

create index if not exists labels_pair_idx on labels(pair_id);
create index if not exists labels_labeler_idx on labels(labeler_id);

-- Pick the next pair for a labeler:
--   - exclude pairs they've already labeled
--   - exclude pairs that already have 3 labels
--   - prefer pairs with the most existing labels (so partial pairs finish first)
create or replace function get_next_pair(p_labeler_id uuid)
returns table (
  pair_id uuid,
  video_a_url text,
  video_b_url text,
  current_count bigint
) language sql stable as $$
  select
    p.id as pair_id,
    va.url as video_a_url,
    vb.url as video_b_url,
    count(l.id) as current_count
  from pairs p
  join videos va on va.id = p.video_a_id
  join videos vb on vb.id = p.video_b_id
  left join labels l on l.pair_id = p.id
  where not exists (
    select 1 from labels lx
    where lx.pair_id = p.id and lx.labeler_id = p_labeler_id
  )
  group by p.id, va.url, vb.url
  having count(l.id) < 3
  order by count(l.id) desc, random()
  limit 1;
$$;

-- Progress view for the admin page.
create or replace view pair_progress as
select
  p.id as pair_id,
  count(l.id) as label_count,
  count(l.id) filter (where l.choice = 'a') as votes_a,
  count(l.id) filter (where l.choice = 'b') as votes_b,
  count(l.id) filter (where l.choice = 'tie') as votes_tie,
  count(l.id) filter (where l.choice = 'bad') as votes_bad
from pairs p
left join labels l on l.pair_id = p.id
group by p.id;

-- Row Level Security
alter table videos enable row level security;
alter table pairs enable row level security;
alter table labels enable row level security;

drop policy if exists "videos readable by authenticated" on videos;
create policy "videos readable by authenticated"
  on videos for select to authenticated using (true);

drop policy if exists "pairs readable by authenticated" on pairs;
create policy "pairs readable by authenticated"
  on pairs for select to authenticated using (true);

drop policy if exists "labels readable by authenticated" on labels;
create policy "labels readable by authenticated"
  on labels for select to authenticated using (true);

drop policy if exists "labels insertable by self" on labels;
create policy "labels insertable by self"
  on labels for insert to authenticated
  with check (labeler_id = auth.uid());

drop policy if exists "labels deletable by self" on labels;
create policy "labels deletable by self"
  on labels for delete to authenticated
  using (labeler_id = auth.uid());
