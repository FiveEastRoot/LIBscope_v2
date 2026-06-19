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

`npm run check` and `npm run build` pass. `ntn doctor` currently authenticates the Public API but reports no Workers access.

## Current blocker

Deploy is blocked by the workspace-level Notion Workers gate:

```text
403 Forbidden WorkersCapabilityMissing
This token does not have the ability to manage Workers.
```

The workspace owner must enable Notion Workers and accept the Workers terms for the `LIBbox-v2` workspace before deployment can proceed.

## Retry after Workers access is enabled

Run from `notion-worker/`:

```powershell
$env:NOTION_HOME = Join-Path $env:USERPROFILE '.notion'
ntn doctor
ntn workers deploy --name LIBscope-v2-worker
ntn workers exec sayHello -d '{"name":"World"}'
```

If `ntn doctor` still shows `Workers access ! no Workers access`, the workspace gate has not been cleared yet.

## Chrome note

Chrome is installed and running, and the native host manifest is valid. The Codex Chrome Extension is installed but disabled in the selected Chrome profile. Enable the Codex Chrome Extension in Chrome before using `@chrome` browser automation for the Notion Workers setup flow.
