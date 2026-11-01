-- Kitchen App — Claude usage tracking & daily limit. Safe to re-run.

create table if not exists ai_usage (
  household_id uuid not null references households(id) on delete cascade,
  day date not null default current_date,
  requests int not null default 0,
  input_tokens bigint not null default 0,
  output_tokens bigint not null default 0,
  primary key (household_id, day)
);

alter table ai_usage enable row level security;
drop policy if exists ai_usage_read on ai_usage;
create policy ai_usage_read on ai_usage for select using (is_member(household_id));

-- Count one request; returns today's total so the server can enforce the daily limit.
create or replace function ai_count_request(hh uuid) returns int
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if not is_member(hh) then raise exception 'Not a member'; end if;
  insert into ai_usage (household_id, day, requests) values (hh, current_date, 1)
  on conflict (household_id, day) do update set requests = ai_usage.requests + 1
  returning requests into n;
  return n;
end $$;

-- Record tokens after a reply (for the usage meter).
create or replace function ai_record_tokens(hh uuid, in_tok int, out_tok int) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_member(hh) then raise exception 'Not a member'; end if;
  update ai_usage set input_tokens = input_tokens + greatest(in_tok, 0), output_tokens = output_tokens + greatest(out_tok, 0)
  where household_id = hh and day = current_date;
end $$;
