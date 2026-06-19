# Weekly auto-improvement runbook

This runbook replaces the postponed Notion Workers flow while the Notion workspace remains on the Free plan.

## Workflow

GitHub Actions workflow:

- `.github/workflows/weekly-auto-improvement.yml`
- Schedule: Sunday 05:30 KST
- Manual run: GitHub > Actions > Weekly Auto Improvement > Run workflow

The scheduled run assumes these workflows have already refreshed cache:

1. `Refresh Insight Cache Weekly`
2. `Refresh LLM Insight Cache Weekly`
3. `Weekly Auto Improvement`

## Required repository secrets

Configure these in GitHub:

`Settings` > `Secrets and variables` > `Actions` > `Repository secrets`

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- at least one of:
  - `DIRECT_OPENAI_API_KEY`
  - `DIRECT_ANTHROPIC_API_KEY`
  - `DIRECT_GEMINI_API_KEY`

Optional URL overrides:

- `INSIGHT_API_BASE_URL`
- `LLM_HARNESS_BASE_URL`

If the optional URL secrets are not set, the workflow uses:

- `https://libscope2.netlify.app/api/insight-api`
- `https://libscope2.netlify.app/api/llm-harness`

## Optional repository variables

Configure these in:

`Settings` > `Secrets and variables` > `Actions` > `Variables`

- `AUTO_IMPROVE_DISTRICTS`
- `AUTO_IMPROVE_ARTIFACT_TYPES`
- `AUTO_IMPROVE_FEEDBACK_PROVIDER`
- `AUTO_IMPROVE_FEEDBACK_MODEL`

Default bounded targets:

```text
AUTO_IMPROVE_DISTRICTS=강남구,노원구,은평구,영등포구,종로구
AUTO_IMPROVE_ARTIFACT_TYPES=districtInsight,population,culture,education,socialSafety,reportBody
```

## Manual dry-run

Use this first to confirm the workflow can prepare prompts without saving to Supabase or spending feedback-generation tokens.

1. Open the workflow page:
   `https://github.com/FiveEastRoot/LIBscope_v2/actions/workflows/weekly-auto-improvement.yml`
2. Select `Run workflow`.
3. Set:
   - `dry_run`: `true`
   - `include_cache_refresh`: `false`
   - `districts`: `강남구`
   - `artifact_types`: `districtInsight,population,culture,education,socialSafety,reportBody`
4. Run.

Expected behavior:

- Installs dependencies.
- Reads production API/cache.
- Writes preview JSON under `.tmp` on the runner.
- Does not save feedback or draft prompts.

## Manual save-run

Run this after repository secrets are configured.

1. Open the workflow page:
   `https://github.com/FiveEastRoot/LIBscope_v2/actions/workflows/weekly-auto-improvement.yml`
2. Select `Run workflow`.
3. Set:
   - `dry_run`: `false`
   - `include_cache_refresh`: `false`
   - `districts`: start with `강남구`
   - `artifact_types`: start with `districtInsight,population,culture,education,socialSafety`
4. Run.

Expected behavior:

- Creates a `weekly_auto_improvement` feedback run in Supabase.
- Saves artifact feedback rows.
- Drafts prompt versions per artifact type when feedback exists.
- Does not activate draft prompts automatically.

## Local smoke test

From the repository root:

```powershell
$env:INSIGHT_API_BASE_URL='https://libscope2.netlify.app/api/insight-api'
$env:LLM_HARNESS_BASE_URL='https://libscope2.netlify.app/api/llm-harness'
$env:AUTO_IMPROVE_DISTRICTS='강남구'
$env:AUTO_IMPROVE_ARTIFACT_TYPES='districtInsight,population,culture,education,socialSafety,reportBody'
node scripts/run-weekly-auto-improvement.cjs --dry-run --skip-refresh --skip-drafts
```

This should prepare feedback prompts without saving.
