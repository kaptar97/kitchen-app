-- Kitchen App — Phase 1 database schema
-- Paste this whole file into Supabase → SQL Editor → New query → Run.
-- Safe to re-run: it drops and recreates the helper functions and policies.

create extension if not exists "pgcrypto";

-- ============ TABLES ============

create table if not exists households (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);

create table if not exists household_members (
  household_id uuid not null references households(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  display_name text not null,
  role text not null default 'member' check (role in ('owner','member')),
  joined_at timestamptz not null default now(),
  primary key (household_id, user_id)
);

create table if not exists invites (
  code text primary key,
  household_id uuid not null references households(id) on delete cascade,
  created_by uuid not null references auth.users(id),
  expires_at timestamptz not null default now() + interval '7 days'
);

create table if not exists locations (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  name text not null,
  icon text not null default '📦',
  sort int not null default 0
);

-- The item "catalog": everything the household has ever had. Re-adding is one tap.
create table if not exists items (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  name text not null,
  barcode text,
  category text,
  default_unit text not null default 'ct',
  default_location_id uuid references locations(id) on delete set null,
  low_threshold numeric,            -- null = never auto-add to shopping list
  is_staple boolean not null default false,
  created_at timestamptz not null default now()
);
create unique index if not exists items_household_name_idx on items (household_id, lower(name));
create index if not exists items_barcode_idx on items (household_id, barcode);

-- What's actually in the house right now.
create table if not exists inventory (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  item_id uuid not null references items(id) on delete cascade,
  location_id uuid references locations(id) on delete set null,
  quantity numeric not null default 1 check (quantity >= 0),
  unit text not null default 'ct',
  expires_on date,
  added_by uuid references auth.users(id),
  updated_by uuid references auth.users(id),
  updated_at timestamptz not null default now()
);
create index if not exists inventory_household_idx on inventory (household_id);

create table if not exists shopping_list (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  item_id uuid references items(id) on delete set null,
  name text not null,
  quantity numeric not null default 1,
  unit text not null default 'ct',
  auto boolean not null default false,   -- true = added by low-stock rule
  added_by uuid references auth.users(id),
  checked boolean not null default false,
  checked_by uuid references auth.users(id),
  checked_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists shopping_household_idx on shopping_list (household_id);

-- ============ SECURITY (each household only sees its own data) ============

create or replace function is_member(hh uuid) returns boolean
language sql security definer stable set search_path = public as $$
  select exists (select 1 from household_members where household_id = hh and user_id = auth.uid());
$$;

alter table households enable row level security;
alter table household_members enable row level security;
alter table invites enable row level security;
alter table locations enable row level security;
alter table items enable row level security;
alter table inventory enable row level security;
alter table shopping_list enable row level security;

drop policy if exists hh_read on households;
create policy hh_read on households for select using (is_member(id));
drop policy if exists hh_update on households;
create policy hh_update on households for update using (is_member(id));

drop policy if exists members_read on household_members;
create policy members_read on household_members for select using (is_member(household_id));
drop policy if exists members_update_self on household_members;
create policy members_update_self on household_members for update using (user_id = auth.uid());

drop policy if exists invites_read on invites;
create policy invites_read on invites for select using (is_member(household_id));

do $$
declare t text;
begin
  foreach t in array array['locations','items','inventory','shopping_list'] loop
    execute format('drop policy if exists %1$s_all on %1$s', t);
    execute format('create policy %1$s_all on %1$s for all using (is_member(household_id)) with check (is_member(household_id))', t);
  end loop;
end $$;

-- ============ FUNCTIONS THE APP CALLS ============

-- Create a household, make the caller the owner, add default locations.
create or replace function create_household(hh_name text, my_name text) returns uuid
language plpgsql security definer set search_path = public as $$
declare new_id uuid;
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  insert into households (name, created_by) values (hh_name, auth.uid()) returning id into new_id;
  insert into household_members (household_id, user_id, display_name, role) values (new_id, auth.uid(), my_name, 'owner');
  insert into locations (household_id, name, icon, sort) values
    (new_id, 'Fridge', '🧊', 1), (new_id, 'Freezer', '❄️', 2), (new_id, 'Pantry', '🥫', 3),
    (new_id, 'Garage', '🏠', 4), (new_id, 'Bathroom', '🧻', 5), (new_id, 'Cleaning', '🧽', 6);
  return new_id;
end $$;

-- Make a 6-character invite code (valid 7 days).
create or replace function create_invite(hh uuid) returns text
language plpgsql security definer set search_path = public as $$
declare c text;
begin
  if not is_member(hh) then raise exception 'Not a member'; end if;
  c := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6));
  insert into invites (code, household_id, created_by) values (c, hh, auth.uid());
  return c;
end $$;

-- Join a household with an invite code.
create or replace function join_household(invite_code text, my_name text) returns uuid
language plpgsql security definer set search_path = public as $$
declare hh uuid;
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  select household_id into hh from invites where code = upper(trim(invite_code)) and expires_at > now();
  if hh is null then raise exception 'That code is invalid or expired'; end if;
  insert into household_members (household_id, user_id, display_name) values (hh, auth.uid(), my_name)
    on conflict (household_id, user_id) do nothing;
  return hh;
end $$;

-- Low-stock rule: when an item's total drops to/below its threshold,
-- put it on the shopping list (unless it's already there).
create or replace function check_low_stock() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  it items%rowtype;
  total numeric;
  target uuid := coalesce(new.item_id, old.item_id);
begin
  select * into it from items where id = target;
  if it.id is null or it.low_threshold is null then return null; end if;
  select coalesce(sum(quantity), 0) into total from inventory where item_id = target;
  if total <= it.low_threshold and not exists (
    select 1 from shopping_list where item_id = target and checked = false
  ) then
    insert into shopping_list (household_id, item_id, name, unit, auto, added_by)
    values (it.household_id, it.id, it.name, it.default_unit, true, auth.uid());
  end if;
  return null;
end $$;

drop trigger if exists inventory_low_stock on inventory;
create trigger inventory_low_stock after insert or update or delete on inventory
  for each row execute function check_low_stock();

-- ============ LIVE SYNC ============
do $$
declare t text;
begin
  foreach t in array array['items','inventory','shopping_list','locations','household_members'] loop
    begin
      execute format('alter publication supabase_realtime add table %I', t);
    exception when duplicate_object then null;
    end;
  end loop;
end $$;
