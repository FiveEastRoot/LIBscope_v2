# Notion Worker setup

This project keeps the Notion Workers quickstart scaffold in `notion-worker/`.

## Current local state

- CLI: `ntn 0.17.0`
- Node.js: `v24.16.0`
- npm: `11.13.0`
- Notion CLI state root: `%USERPROFILE%\.notion`
- Authenticated workspace: `LIBbox-v2`
- Scaffold entrypoint: `notion-worker/src/index.ts`
- Sample capability: `sayHello`

## Verified commands

Run from `notion-worker/`:

```powershell
$env:NOTION_HOME = Join-Path $env:USERPROFILE '.notion'
npm run check
npm run build
ntn doctor
```

`npm run check` and `npm run build` pass. `ntn doctor` authenticates the Public API but reports no Workers access on the current Notion Free workspace.

## Current decision

Deploy is blocked because the current `LIBbox-v2` Notion workspace is on the Free plan. Notion Workers requires a workspace plan/access level that exposes Workers. The quickstart scaffold is kept in the repository so it can be reused if the workspace is upgraded later, but Workers is not the active automation path for LIBscope v2 right now.

Observed CLI error:

```text
403 Forbidden WorkersCapabilityMissing
This token does not have the ability to manage Workers.
```

This is a plan/access gate, not a local CLI or code issue.

## Active replacement path

Until the Notion workspace is upgraded, use the existing Netlify/Supabase/GitHub Actions path for automation:

```text
Scheduled API/data refresh
  -> GitHub Actions or Netlify scheduled/background function
  -> Supabase data/cache read
  -> first-pass insight/report generation
  -> evaluator feedback generation
  -> prompt improvement and previous prompt archival
  -> Supabase persistence
  -> Notion API documentation/log update
```

Recommended ownership:

- Supabase: source snapshots, generated artifacts, feedback records, prompt versions, prompt archives.
- Netlify Functions: app-facing read/write endpoints, LLM calls, cache-aware generation, manual regeneration triggers.
- GitHub Actions: low-frequency scheduled jobs such as weekly API refresh and prompt improvement loops.
- Notion API: planning docs, status summaries, human-readable operation logs.

## Retry only after upgrading Notion

Run from `notion-worker/`:

```powershell
$env:NOTION_HOME = Join-Path $env:USERPROFILE '.notion'
ntn doctor
ntn workers deploy --name LIBscope-v2-worker
ntn workers exec sayHello -d '{"name":"World"}'
```

If `ntn doctor` still shows `Workers access ! no Workers access`, the workspace still does not expose Workers.

## Chrome note

Chrome is installed and running, and the native host manifest is valid. The Codex Chrome Extension is installed but disabled in the selected Chrome profile. Enable the Codex Chrome Extension in Chrome before using `@chrome` browser automation for the Notion Workers setup flow.
