-- Kitchen App — grocery spending + cook history. Safe to re-run.

alter table households add column if not exists monthly_budget numeric default 700;

create table if not exists purchases (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  store text,
  purchased_on date not null default current_date,
  total numeric not null default 0,
  tax numeric,
  source text not null default 'receipt' check (source in ('receipt', 'manual')),
  note text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);
create index if not exists purchases_household_idx on purchases (household_id, purchased_on);

create table if not exists purchase_items (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  purchase_id uuid not null references purchases(id) on delete cascade,
  item_id uuid references items(id) on delete set null,
  name text not null,
  quantity numeric,
  unit text,
  price numeric,
  category text
);
create index if not exists purchase_items_household_idx on purchase_items (household_id);
create index if not exists purchase_items_item_idx on purchase_items (item_id);

create table if not exists cook_log (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  recipe_id uuid references recipes(id) on delete set null,
  recipe_title text not null,
  servings numeric,
  made_by uuid references auth.users(id),
  made_at timestamptz not null default now()
);
create index if not exists cook_log_household_idx on cook_log (household_id);

alter table purchases enable row level security;
alter table purchase_items enable row level security;
alter table cook_log enable row level security;

do $$
declare t text;
begin
  foreach t in array array['purchases','purchase_items','cook_log'] loop
    execute format('drop policy if exists %1$s_all on %1$s', t);
    execute format('create policy %1$s_all on %1$s for all using (is_member(household_id)) with check (is_member(household_id))', t);
    begin
      execute format('alter publication supabase_realtime add table %I', t);
    exception when duplicate_object then null;
    end;
  end loop;
end $$;

do $$
begin
  alter publication supabase_realtime add table households;
exception when duplicate_object then null;
end $$;
