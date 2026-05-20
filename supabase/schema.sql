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

-- Per-labeler assignment list. If a labeler has any rows here, they only see
-- the pairs they're assigned. If they have zero rows here, they see all pairs.
create table if not exists assignments (
  id uuid primary key default gen_random_uuid(),
  pair_id uuid not null references pairs(id) on delete cascade,
  labeler_email text not null,
  created_at timestamptz default now(),
  unique (pair_id, labeler_email)
);
create index if not exists assignments_email_idx on assignments(labeler_email);

-- Pick the next pair for a labeler:
--   - if labeler has assignments, only consider pairs assigned to them
--   - exclude pairs they've already labeled
--   - exclude pairs already in the caller's session history (p_exclude_ids)
--   - exclude pairs that already have 3 labels
--   - prefer pairs with the most existing labels (so partial pairs finish first)
create or replace function get_next_pair(
  p_labeler_id uuid,
  p_exclude_ids uuid[] default array[]::uuid[]
)
returns table (
  pair_id uuid,
  video_a_url text,
  video_b_url text,
  current_count bigint
) language sql stable as $$
  with my_email as (
    select email::text as email from auth.users where id = p_labeler_id
  ),
  has_assignments as (
    select exists(
      select 1 from assignments
      where labeler_email = (select email from my_email)
    ) as flag
  )
  select
    p.id as pair_id,
    va.url as video_a_url,
    vb.url as video_b_url,
    count(l.id) as current_count
  from pairs p
  join videos va on va.id = p.video_a_id
  join videos vb on vb.id = p.video_b_id
  left join labels l on l.pair_id = p.id
  where (
    not (select flag from has_assignments)
    or exists (
      select 1 from assignments a
      where a.pair_id = p.id
        and a.labeler_email = (select email from my_email)
    )
  )
  and not exists (
    select 1 from labels lx
    where lx.pair_id = p.id and lx.labeler_id = p_labeler_id
  )
  and not (p.id = any(p_exclude_ids))
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

-- Admin RPC: per-pair vote rows joined with labeler emails.
-- SECURITY DEFINER so it can read auth.users; any authenticated caller
-- can see all results. Tighten this if you ever open the labeler pool.
create or replace function get_pair_results()
returns table (
  pair_id uuid,
  option_a_label text,
  option_b_label text,
  choice text,
  labeler_id uuid,
  labeler_email text,
  view_duration_ms int,
  created_at timestamptz
) security definer language sql stable as $$
  select
    p.id as pair_id,
    va.label as option_a_label,
    vb.label as option_b_label,
    l.choice,
    l.labeler_id,
    u.email::text as labeler_email,
    l.view_duration_ms,
    l.created_at
  from pairs p
  join videos va on va.id = p.video_a_id
  join videos vb on vb.id = p.video_b_id
  left join labels l on l.pair_id = p.id
  left join auth.users u on u.id = l.labeler_id
  order by va.label nulls last, l.created_at nulls last;
$$;

grant execute on function get_pair_results() to authenticated;

-- Row Level Security
alter table videos enable row level security;
alter table pairs enable row level security;
alter table labels enable row level security;
alter table assignments enable row level security;

drop policy if exists "assignments readable by authenticated" on assignments;
create policy "assignments readable by authenticated"
  on assignments for select to authenticated using (true);

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
