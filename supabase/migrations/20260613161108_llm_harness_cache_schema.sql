-- LIBscope LLM harness cache/archive schema
-- Mirrors docs/supabase-llm-harness-schema.sql.

create extension if not exists pgcrypto;

create table if not exists public.llm_harness_contracts (
  id uuid primary key default gen_random_uuid(),
  contract_key text not null,
  contract_version text not null,
  contract_type text not null check (contract_type in ('prompt', 'output_schema', 'style_guide', 'quality_gate', 'report_template', 'model_registry')),
  title text not null,
  body_markdown text not null,
  body_json jsonb not null default '{}'::jsonb,
  is_active boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (contract_key, contract_version)
);

create table if not exists public.llm_section_outputs (
  id uuid primary key default gen_random_uuid(),
  gu_code text,
  gu_name text not null,
  library_id text,
  library_name text,
  section_key text not null,
  generation_unit text not null,
  source_snapshot_key text not null,
  harness_version text not null,
  prompt_version text not null,
  output_schema_version text not null,
  model_registry_version text not null,
  provider text not null,
  model_name text not null,
  input_payload jsonb not null,
  output_payload jsonb not null,
  evidence_refs jsonb not null default '[]'::jsonb,
  quality_status text not null default 'pending' check (quality_status in ('pending', 'passed', 'failed', 'needs_review')),
  quality_errors jsonb not null default '[]'::jsonb,
  token_usage jsonb not null default '{}'::jsonb,
  cost_estimate_usd numeric(12, 6),
  generated_at timestamptz not null default now(),
  valid_until timestamptz,
  archived_at timestamptz
);

create table if not exists public.llm_district_reports (
  id uuid primary key default gen_random_uuid(),
  gu_code text,
  gu_name text not null,
  source_snapshot_key text not null,
  harness_version text not null,
  prompt_version text not null,
  report_template_version text not null,
  output_schema_version text not null,
  model_registry_version text not null,
  provider text not null,
  model_name text not null,
  report_title text not null,
  report_subtitle text,
  report_html text not null,
  report_markdown text not null,
  report_json jsonb not null default '{}'::jsonb,
  input_payload jsonb not null,
  section_output_ids uuid[] not null default '{}'::uuid[],
  evidence_refs jsonb not null default '[]'::jsonb,
  quality_status text not null default 'pending' check (quality_status in ('pending', 'passed', 'failed', 'needs_review')),
  quality_errors jsonb not null default '[]'::jsonb,
  token_usage jsonb not null default '{}'::jsonb,
  cost_estimate_usd numeric(12, 6),
  generated_at timestamptz not null default now(),
  valid_until timestamptz,
  archived_at timestamptz,
  unique (gu_name, source_snapshot_key, harness_version, prompt_version, report_template_version, model_registry_version)
);

create table if not exists public.llm_generation_runs (
  id uuid primary key default gen_random_uuid(),
  run_type text not null check (run_type in ('section', 'district_insight', 'district_report', 'batch_precompute', 'golden_test')),
  status text not null default 'started' check (status in ('started', 'succeeded', 'failed', 'needs_review')),
  gu_name text,
  section_key text,
  source_snapshot_key text,
  harness_version text not null,
  prompt_version text,
  model_registry_version text not null,
  provider text,
  model_name text,
  request_payload jsonb not null default '{}'::jsonb,
  response_payload jsonb not null default '{}'::jsonb,
  quality_errors jsonb not null default '[]'::jsonb,
  token_usage jsonb not null default '{}'::jsonb,
  cost_estimate_usd numeric(12, 6),
  error_message text,
  started_at timestamptz not null default now(),
  finished_at timestamptz
);

create table if not exists public.llm_golden_test_cases (
  id uuid primary key default gen_random_uuid(),
  gu_name text not null,
  alternate_gu_name text,
  reason text not null,
  source_snapshot_key text,
  expected_checks jsonb not null default '{}'::jsonb,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (gu_name)
);

create index if not exists idx_llm_contracts_active
  on public.llm_harness_contracts (contract_type, contract_key, is_active);

create index if not exists idx_llm_section_outputs_lookup
  on public.llm_section_outputs (gu_name, section_key, source_snapshot_key, generated_at desc);

create unique index if not exists uq_llm_section_outputs_snapshot
  on public.llm_section_outputs (
    gu_name,
    coalesce(library_id, ''),
    section_key,
    source_snapshot_key,
    harness_version,
    prompt_version,
    model_registry_version
  );

create index if not exists idx_llm_section_outputs_library
  on public.llm_section_outputs (library_id, section_key, generated_at desc)
  where library_id is not null;

create index if not exists idx_llm_reports_lookup
  on public.llm_district_reports (gu_name, source_snapshot_key, generated_at desc);

create index if not exists idx_llm_generation_runs_status
  on public.llm_generation_runs (run_type, status, started_at desc);

alter table public.llm_harness_contracts enable row level security;
alter table public.llm_section_outputs enable row level security;
alter table public.llm_district_reports enable row level security;
alter table public.llm_generation_runs enable row level security;
alter table public.llm_golden_test_cases enable row level security;

grant usage on schema public to service_role;
grant select, insert, update on public.llm_harness_contracts to service_role;
grant select, insert, update on public.llm_section_outputs to service_role;
grant select, insert, update on public.llm_district_reports to service_role;
grant select, insert, update on public.llm_generation_runs to service_role;
grant select, insert, update on public.llm_golden_test_cases to service_role;

insert into public.llm_golden_test_cases (gu_name, alternate_gu_name, reason, expected_checks)
values
  ('강남구', null, '인구 규모와 교육·문화 인프라가 큰 자치구', '{"must_cover":["population","education","culture"]}'::jsonb),
  ('종로구', '중구', '생활인구와 문화자원이 강한 도심 자치구', '{"must_cover":["living_population","culture","public_places"]}'::jsonb),
  ('노원구', '은평구', '생활권 기반 도서관 정책 해석이 중요한 자치구', '{"must_cover":["population","library_service","education"]}'::jsonb),
  ('금천구', '도봉구', '인프라와 복지 수요 균형 점검이 필요한 자치구', '{"must_cover":["social_safety","accessibility","culture"]}'::jsonb),
  ('영등포구', null, '외국인 주민·산업·생활권 맥락을 함께 보기 좋은 자치구', '{"must_cover":["foreign_residents","public_places","population"]}'::jsonb)
on conflict (gu_name) do update
set
  alternate_gu_name = excluded.alternate_gu_name,
  reason = excluded.reason,
  expected_checks = excluded.expected_checks,
  is_active = true;
