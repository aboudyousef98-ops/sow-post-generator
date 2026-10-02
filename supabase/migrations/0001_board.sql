-- 0001_board.sql — Project Board schema (10-project-board.md §5.2).
-- Run once in the Supabase SQL editor (see SETUP.md step 2).
--
-- One deliberate amendment to the spec SQL: posts.deleted_at (tombstone).
-- The existing app deletes drafts with tombstones + Undo (PostRecord.deletedAt);
-- without a real column, "deleted" rows would look alive to RLS and filters.
-- // SPEC-GAP: posts.deleted_at added — §5.2 had no delete column for posts.

-- ───────────────────────── Team / allowlist ─────────────────────────
create table public.team_members (
  id            uuid primary key default gen_random_uuid(),
  email         text not null unique,
  display_name  text not null,
  initials      text,
  role          text not null default 'member' check (role in ('member','admin')),
  active        boolean not null default true,
  created_at    timestamptz not null default now()
);

create or replace function public.current_member_id()
returns uuid language sql stable security definer set search_path = public as $$
  select id from public.team_members
  where active and lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  limit 1
$$;

create or replace function public.is_team_member()
returns boolean language sql stable security definer set search_path = public as $$
  select public.current_member_id() is not null
$$;

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.team_members
                 where id = public.current_member_id() and role = 'admin')
$$;

-- ───────────────────────── Labels (status + phase) ─────────────────────────
create table public.labels (
  id          uuid primary key default gen_random_uuid(),
  column_key  text not null check (column_key in ('status','phase')),
  name        text not null check (length(trim(name)) between 1 and 40),
  color       text not null check (color ~ '^#[0-9A-Fa-f]{6}$'),
  sort_order  int  not null default 100,
  is_default  boolean not null default false,   -- applied to new rows
  is_done     boolean not null default false,   -- "finished" meaning for automation/filters
  is_system   boolean not null default false,   -- seeded: rename/recolor OK, archive not allowed
  archived    boolean not null default false,
  created_at  timestamptz not null default now(),
  unique (column_key, name)
);
create unique index labels_one_default_per_column
  on public.labels (column_key) where is_default and not archived;

-- ───────────────────────── Projects (board rows) ─────────────────────────
create table public.projects (
  id                  uuid primary key default gen_random_uuid(),
  name                text not null check (length(trim(name)) between 1 and 200),
  name_key            text generated always as
                        (lower(regexp_replace(trim(name), '\s+', ' ', 'g'))) stored,
  sow_coordinator_id  uuid references public.team_members(id),
  status_id           uuid references public.labels(id),
  phase_id            uuid references public.labels(id),
  designed_date       date,
  rating              smallint check (rating between 1 and 3),   -- null = not rated
  position            double precision not null default extract(epoch from clock_timestamp()),
  archived_at         timestamptz,
  created_by          uuid references public.team_members(id) default public.current_member_id(),
  created_at          timestamptz not null default now(),
  updated_by          uuid references public.team_members(id),
  updated_at          timestamptz not null default now()
);
create index projects_active_idx   on public.projects (archived_at, position desc);
create index projects_name_key_idx on public.projects (name_key);

-- ───────────────────────── Posts (drafts + history) ─────────────────────────
create table public.posts (
  id            text primary key,                                  -- keep existing client ids
  project_id    uuid references public.projects(id) on delete set null,
  author_id     uuid references public.team_members(id),           -- "Posting as"
  state         text not null default 'draft' check (state in ('draft','posted')),
  customer      text,                                              -- denormalized for search
  install_date  date,
  payload       jsonb not null,                                    -- existing PostRecord object, unchanged
  posted_at     timestamptz,
  deleted_at    timestamptz,                                       -- tombstone (see header note)
  created_by    uuid references public.team_members(id) default public.current_member_id(),
  created_at    timestamptz not null default now(),
  updated_by    uuid references public.team_members(id),
  updated_at    timestamptz not null default now()
);
create index posts_project_idx on public.posts (project_id, updated_at desc);
create index posts_state_idx   on public.posts (state, updated_at desc);

-- ───────────────────────── Activity log ─────────────────────────
create table public.activity_log (
  id          bigint generated always as identity primary key,
  project_id  uuid references public.projects(id) on delete cascade,
  actor_id    uuid references public.team_members(id),
  action      text not null,              -- create | update
  changes     jsonb,                      -- {"status_id": {"old": "...", "new": "..."}}
  at          timestamptz not null default now()
);
create index activity_project_idx on public.activity_log (project_id, at desc);

-- ───────────────────────── Triggers ─────────────────────────
create or replace function public.touch_row()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.updated_at := now();
  new.updated_by := public.current_member_id();
  return new;
end $$;

create trigger projects_touch before update on public.projects
  for each row execute function public.touch_row();
create trigger posts_touch before update on public.posts
  for each row execute function public.touch_row();

create or replace function public.check_project_labels()
returns trigger language plpgsql as $$
begin
  if new.status_id is not null and not exists
     (select 1 from public.labels where id = new.status_id and column_key = 'status') then
    raise exception 'status_id must reference a status label';
  end if;
  if new.phase_id is not null and not exists
     (select 1 from public.labels where id = new.phase_id and column_key = 'phase') then
    raise exception 'phase_id must reference a phase label';
  end if;
  return new;
end $$;

create trigger projects_label_guard
  before insert or update of status_id, phase_id on public.projects
  for each row execute function public.check_project_labels();

create or replace function public.log_project_change()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  k    text;
  diff jsonb := '{}'::jsonb;
begin
  if tg_op = 'INSERT' then
    insert into public.activity_log (project_id, actor_id, action, changes)
    values (new.id, public.current_member_id(), 'create',
            jsonb_build_object('name', new.name));
    return new;
  end if;
  foreach k in array array['name','sow_coordinator_id','status_id','phase_id',
                           'designed_date','rating','archived_at'] loop
    if (to_jsonb(old) -> k) is distinct from (to_jsonb(new) -> k) then
      diff := diff || jsonb_build_object(k, jsonb_build_object(
                'old', to_jsonb(old) -> k, 'new', to_jsonb(new) -> k));
    end if;
  end loop;
  if diff <> '{}'::jsonb then
    insert into public.activity_log (project_id, actor_id, action, changes)
    values (new.id, public.current_member_id(), 'update', diff);
  end if;
  return new;
end $$;

create trigger projects_log after insert or update on public.projects
  for each row execute function public.log_project_change();

-- ───────────────────────── Row-level security ─────────────────────────
alter table public.team_members enable row level security;
alter table public.labels       enable row level security;
alter table public.projects     enable row level security;
alter table public.posts        enable row level security;
alter table public.activity_log enable row level security;

create policy tm_read  on public.team_members for select using (public.is_team_member());
create policy tm_admin on public.team_members for all
  using (public.is_admin()) with check (public.is_admin());

create policy lb_read   on public.labels for select using (public.is_team_member());
create policy lb_insert on public.labels for insert with check (public.is_team_member());
create policy lb_update on public.labels for update
  using (public.is_team_member()) with check (public.is_team_member());
-- no delete policy: labels are archived, never deleted

create policy pj_read   on public.projects for select using (public.is_team_member());
create policy pj_insert on public.projects for insert with check (public.is_team_member());
create policy pj_update on public.projects for update
  using (public.is_team_member()) with check (public.is_team_member());
create policy pj_delete on public.projects for delete using (public.is_admin());

create policy ps_read   on public.posts for select using (public.is_team_member());
create policy ps_insert on public.posts for insert with check (public.is_team_member());
create policy ps_update on public.posts for update
  using (public.is_team_member()) with check (public.is_team_member());
create policy ps_delete on public.posts for delete using (public.is_team_member());

create policy al_read on public.activity_log for select using (public.is_team_member());
-- activity_log inserts happen only inside the security-definer trigger

revoke all on public.team_members, public.labels, public.projects,
              public.posts, public.activity_log from anon;
grant select, insert, update, delete on public.team_members, public.labels,
              public.projects, public.posts to authenticated;
grant select on public.activity_log to authenticated;

-- ───────────────────────── Realtime ─────────────────────────
alter publication supabase_realtime add table public.projects, public.labels, public.posts;
