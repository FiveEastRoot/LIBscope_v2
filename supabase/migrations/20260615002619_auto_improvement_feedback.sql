-- LIBscope v2 auto-improvement feedback and prompt-version schema.

create extension if not exists pgcrypto;

create table if not exists public.llm_feedback_runs (
  id uuid primary key default gen_random_uuid(),
  run_type text not null check (run_type in ('weekly_auto_improvement', 'manual_sample', 'notion_editorial_sync')),
  status text not null default 'started' check (status in ('started', 'succeeded', 'failed', 'needs_review')),
  source_snapshot_key text,
  feedback_framework_version text not null,
  feedback_model_registry_version text not null,
  generation_run_id uuid,
  request_payload jsonb not null default '{}'::jsonb,
  response_summary jsonb not null default '{}'::jsonb,
  error_message text,
  started_at timestamptz not null default now(),
  finished_at timestamptz
);

create table if not exists public.llm_artifact_feedback (
  id uuid primary key default gen_random_uuid(),
  run_id uuid references public.llm_feedback_runs(id),
  artifact_type text not null,
  section_key text,
  district_name text not null,
  source_output_table text not null,
  source_output_id uuid,
  source_snapshot_key text,
  feedback_framework_version text not null,
  feedback_provider text not null,
  feedback_model text not null,
  feedback_payload jsonb not null,
  quality_score integer check (quality_score between 0 and 100),
  operator_usefulness_score integer check (operator_usefulness_score between 1 and 5),
  rubric_scores jsonb not null default '{}'::jsonb,
  issue_tags text[] not null default '{}'::text[],
  prompt_improvement_hints text[] not null default '{}'::text[],
  avoid_patterns text[] not null default '{}'::text[],
  must_include_next_time text[] not null default '{}'::text[],
  evidence_gaps text[] not null default '{}'::text[],
  rewrite_risk text check (rewrite_risk in ('low', 'medium', 'high')),
  created_at timestamptz not null default now()
);

create table if not exists public.llm_prompt_versions (
  id uuid primary key default gen_random_uuid(),
  prompt_key text not null,
  artifact_type text not null,
  section_key text,
  prompt_version text not null,
  prompt_text text not null,
  prompt_json jsonb not null default '{}'::jsonb,
  status text not null default 'draft' check (status in ('draft', 'active', 'archived', 'rejected')),
  created_from_feedback_run_id uuid references public.llm_feedback_runs(id),
  source_prompt_version_id uuid references public.llm_prompt_versions(id),
  change_summary text,
  improvement_evidence jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  activated_at timestamptz,
  archived_at timestamptz,
  unique (prompt_key, prompt_version)
);

create table if not exists public.llm_prompt_improvement_runs (
  id uuid primary key default gen_random_uuid(),
  feedback_run_id uuid references public.llm_feedback_runs(id),
  artifact_type text not null,
  section_key text,
  source_prompt_version_id uuid references public.llm_prompt_versions(id),
  draft_prompt_version_id uuid references public.llm_prompt_versions(id),
  improvement_provider text not null,
  improvement_model text not null,
  input_summary jsonb not null default '{}'::jsonb,
  output_summary jsonb not null default '{}'::jsonb,
  status text not null default 'drafted' check (status in ('drafted', 'activated', 'rejected', 'failed')),
  error_message text,
  created_at timestamptz not null default now()
);

create index if not exists idx_llm_artifact_feedback_artifact
  on public.llm_artifact_feedback (artifact_type, section_key, created_at desc);

create index if not exists idx_llm_artifact_feedback_source
  on public.llm_artifact_feedback (source_output_table, source_output_id);

create index if not exists idx_llm_prompt_versions_active
  on public.llm_prompt_versions (prompt_key, artifact_type, section_key, status);

alter table public.llm_feedback_runs enable row level security;
alter table public.llm_artifact_feedback enable row level security;
alter table public.llm_prompt_versions enable row level security;
alter table public.llm_prompt_improvement_runs enable row level security;

grant usage on schema public to service_role;
grant select, insert, update on public.llm_feedback_runs to service_role;
grant select, insert, update on public.llm_artifact_feedback to service_role;
grant select, insert, update on public.llm_prompt_versions to service_role;
grant select, insert, update on public.llm_prompt_improvement_runs to service_role;
