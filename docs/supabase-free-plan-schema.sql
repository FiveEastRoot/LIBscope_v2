-- LIBscope v2 Supabase Postgres schema draft
-- Goal: weekly refreshed public policy metrics within the free plan.
-- Apply later through a real Supabase migration after the project is linked.

create table if not exists public.source_catalog (
  source_key text primary key,
  provider text not null,
  dataset_id text,
  service_name text,
  source_url text,
  refresh_cycle text not null default 'weekly',
  status text not null default 'candidate',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.district_metrics (
  id bigint generated always as identity primary key,
  gu text not null,
  metric_key text not null,
  population_mode text,
  metric_value numeric,
  metric_json jsonb not null default '{}'::jsonb,
  denominator_key text,
  reference_date date,
  fetched_at timestamptz not null default now(),
  source_key text references public.source_catalog(source_key)
);

create table if not exists public.dong_metrics (
  id bigint generated always as identity primary key,
  gu text not null,
  dong text not null,
  metric_key text not null,
  population_mode text,
  metric_value numeric,
  metric_json jsonb not null default '{}'::jsonb,
  denominator_key text,
  reference_date date,
  fetched_at timestamptz not null default now(),
  source_key text references public.source_catalog(source_key)
);

create table if not exists public.library_profiles (
  library_id text primary key,
  name text not null,
  gu text not null,
  address text,
  lat numeric,
  lng numeric,
  source_key text references public.source_catalog(source_key),
  updated_at timestamptz not null default now()
);

create table if not exists public.refresh_runs (
  id bigint generated always as identity primary key,
  scope text not null,
  status text not null,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  item_count integer not null default 0,
  error_message text
);

create index if not exists idx_district_metrics_lookup
  on public.district_metrics (gu, metric_key, population_mode, reference_date desc);

create index if not exists idx_dong_metrics_lookup
  on public.dong_metrics (gu, dong, metric_key, population_mode, reference_date desc);

create unique index if not exists uq_district_metrics_version
  on public.district_metrics (
    gu,
    metric_key,
    coalesce(population_mode, ''),
    coalesce(reference_date, date '1900-01-01')
  );

create unique index if not exists uq_dong_metrics_version
  on public.dong_metrics (
    gu,
    dong,
    metric_key,
    coalesce(population_mode, ''),
    coalesce(reference_date, date '1900-01-01')
  );

create index if not exists idx_library_profiles_gu
  on public.library_profiles (gu);

alter table public.source_catalog enable row level security;
alter table public.district_metrics enable row level security;
alter table public.dong_metrics enable row level security;
alter table public.library_profiles enable row level security;
alter table public.refresh_runs enable row level security;

-- Read-only public dashboard access.
-- Writes should be performed only by server-side code using a service role key.
create policy "Public read source catalog"
  on public.source_catalog for select
  to anon, authenticated
  using (true);

create policy "Public read district metrics"
  on public.district_metrics for select
  to anon, authenticated
  using (true);

create policy "Public read dong metrics"
  on public.dong_metrics for select
  to anon, authenticated
  using (true);

create policy "Public read library profiles"
  on public.library_profiles for select
  to anon, authenticated
  using (true);

-- Data API exposure for public read tables. RLS policies above still control rows.
revoke all on table public.source_catalog from anon, authenticated;
revoke all on table public.district_metrics from anon, authenticated;
revoke all on table public.dong_metrics from anon, authenticated;
revoke all on table public.library_profiles from anon, authenticated;
revoke all on table public.refresh_runs from anon, authenticated;

grant usage on schema public to anon, authenticated;
grant select on table public.source_catalog to anon, authenticated;
grant select on table public.district_metrics to anon, authenticated;
grant select on table public.dong_metrics to anon, authenticated;
grant select on table public.library_profiles to anon, authenticated;

-- Keep refresh run details server-side by default.
-- Do not add anon/authenticated policies unless an admin view is designed.

insert into public.source_catalog (
  source_key,
  provider,
  dataset_id,
  service_name,
  source_url,
  refresh_cycle,
  status,
  notes
) values
  (
    'resident_population_kosis',
    'kosis',
    'DT_1B04005N',
    'statisticsParameterData.do',
    'https://kosis.kr/statisticsList/mass/mass_list.jsp?list_id=A_7&org_id=101&process=statHtml&tbl_id=DT_1B04005N&vw_cd=MT_ZTITLE',
    'monthly',
    'confirmed',
    'Resident registration population by eup/myeon/dong and five-year age groups. Replaces CSV seed for resident population metrics.'
  ),
  (
    'resident_population_dong',
    'seoul_open_data',
    'OA-877',
    null,
    'https://data.seoul.go.kr',
    'weekly',
    'candidate',
    'Default population denominator for population charts and welfare rate.'
  ),
  (
    'living_population_dong',
    'seoul_open_data',
    'OA-14991',
    'SPOP_LOCAL_RESD_DONG',
    'https://data.seoul.go.kr',
    'weekly',
    'confirmed',
    'Parallel population mode loaded in advance for UI switching.'
  ),
  (
    'foreign_residents_nationality',
    'seoul_open_data',
    'OA-13926',
    null,
    'https://data.seoul.go.kr',
    'monthly',
    'candidate',
    'Foreigner metric is defined as foreign residents, not registered foreigners.'
  ),
  (
    'welfare_recipients_dong',
    'seoul_open_data',
    'OA-22227',
    null,
    'https://data.seoul.go.kr',
    'weekly',
    'candidate',
    'Welfare recipient rate denominator is resident population.'
  )
on conflict (source_key) do update set
  provider = excluded.provider,
  dataset_id = excluded.dataset_id,
  service_name = excluded.service_name,
  source_url = excluded.source_url,
  refresh_cycle = excluded.refresh_cycle,
  status = excluded.status,
  notes = excluded.notes,
  updated_at = now();
