-- Kitchen App — Phase 2: recipes
-- Run in Supabase → SQL Editor. Safe to re-run.

create table if not exists recipes (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  title text not null,
  servings numeric,
  prep_minutes int,
  cook_minutes int,
  ingredients jsonb not null default '[]'::jsonb,  -- [{raw, qty, unit, name}]
  steps jsonb not null default '[]'::jsonb,        -- ["Step one", "Step two"]
  tags text[] not null default '{}',
  notes text,
  source_url text,
  image_url text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists recipes_household_idx on recipes (household_id);

alter table recipes enable row level security;
drop policy if exists recipes_all on recipes;
create policy recipes_all on recipes for all
  using (is_member(household_id)) with check (is_member(household_id));

do $$
begin
  alter publication supabase_realtime add table recipes;
exception when duplicate_object then null;
end $$;
