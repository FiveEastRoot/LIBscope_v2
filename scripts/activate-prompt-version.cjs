const fs = require('fs');
const path = require('path');

function loadLocalEnv() {
  const envPath = path.resolve(process.cwd(), '.env');
  if (!fs.existsSync(envPath)) return;
  fs.readFileSync(envPath, 'utf-8').split(/\r?\n/).forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return;
    const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) return;
    const [, key, rawValue] = match;
    if (process.env[key] !== undefined) return;
    process.env[key] = rawValue.replace(/^['"]|['"]$/g, '');
  });
}

loadLocalEnv();

const {
  activatePromptVersion,
  archiveActivePromptVersions,
  fetchPromptVersion
} = require('../functions/_shared/supabase-auto-improvement.cjs');

const args = new Set(process.argv.slice(2));
const APPROVE = args.has('--approve');
const PROMPT_KEY = process.env.ACTIVATE_PROMPT_KEY || 'district-screen-insight';
const ARTIFACT_TYPE = process.env.ACTIVATE_ARTIFACT_TYPE || 'districtInsight';
const SECTION_KEY = process.env.ACTIVATE_SECTION_KEY || ARTIFACT_TYPE;
const PROMPT_VERSION = process.env.ACTIVATE_PROMPT_VERSION;

async function main() {
  if (!PROMPT_VERSION) {
    throw new Error('ACTIVATE_PROMPT_VERSION is required.');
  }
  const target = await fetchPromptVersion({
    promptKey: PROMPT_KEY,
    promptVersion: PROMPT_VERSION,
    artifactType: ARTIFACT_TYPE,
    sectionKey: SECTION_KEY
  });
  if (!target.ok || !target.row?.id) {
    throw new Error(`target prompt not found: ${PROMPT_VERSION}`);
  }

  console.log(`Target prompt: ${PROMPT_KEY}/${ARTIFACT_TYPE}/${SECTION_KEY}/${PROMPT_VERSION}`);
  console.log(`Current status: ${target.row.status}`);
  if (!APPROVE) {
    console.log('Dry-run only. Re-run with --approve to archive active prompts and activate this version.');
    return;
  }

  const archived = await archiveActivePromptVersions({
    promptKey: PROMPT_KEY,
    artifactType: ARTIFACT_TYPE,
    sectionKey: SECTION_KEY
  });
  if (!archived.ok) {
    throw new Error(`active prompt archive failed: ${archived.error || 'unknown_error'}`);
  }
  const activated = await activatePromptVersion({ id: target.row.id });
  if (!activated.ok) {
    throw new Error(`prompt activation failed: ${activated.error || 'unknown_error'}`);
  }
  console.log(`✅ activated: ${PROMPT_VERSION}`);
}

main().catch((error) => {
  console.error('activate prompt version failed:', error?.response?.data || error.message);
  process.exit(1);
});
