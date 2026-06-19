const { spawn } = require('child_process');

const args = new Set(process.argv.slice(2));
const DRY_RUN = args.has('--dry-run') || process.env.WEEKLY_AUTO_DRY_RUN === '1';
const SKIP_REFRESH = args.has('--skip-refresh') || process.env.WEEKLY_AUTO_SKIP_REFRESH === '1';
const SKIP_FEEDBACK = args.has('--skip-feedback') || process.env.WEEKLY_AUTO_SKIP_FEEDBACK === '1';
const SKIP_DRAFTS = args.has('--skip-drafts') || process.env.WEEKLY_AUTO_SKIP_DRAFTS === '1';
const CONTINUE_ON_DRAFT_FAILURE = process.env.WEEKLY_AUTO_CONTINUE_ON_DRAFT_FAILURE !== '0';

const DEFAULT_DISTRICTS = '강남구,노원구,은평구,영등포구,종로구';
const DEFAULT_ARTIFACT_TYPES = 'districtInsight,population,culture,education,socialSafety,reportBody';

const DISTRICTS = process.env.AUTO_IMPROVE_DISTRICTS || DEFAULT_DISTRICTS;
const ARTIFACT_TYPES = (process.env.AUTO_IMPROVE_ARTIFACT_TYPES || DEFAULT_ARTIFACT_TYPES)
  .split(',')
  .map(item => item.trim())
  .filter(Boolean);

const SECTION_BY_ARTIFACT = {
  districtInsight: 'districtInsight',
  population: 'population',
  culture: 'culture',
  education: 'education',
  socialSafety: 'socialSafety',
  reportBody: 'reportBody'
};

function runStep(label, command, commandArgs, extraEnv = {}, { allowFailure = false } = {}) {
  return new Promise((resolve, reject) => {
    const executable = process.platform === 'win32' && command === 'npm' ? 'cmd.exe' : command;
    const args = process.platform === 'win32' && command === 'npm'
      ? ['/d', '/s', '/c', [command, ...commandArgs].join(' ')]
      : commandArgs;
    console.log(`\n== ${label} ==`);
    console.log([command, ...commandArgs].join(' '));
    const child = spawn(executable, args, {
      cwd: process.cwd(),
      env: {
        ...process.env,
        ...extraEnv
      },
      stdio: 'inherit'
    });

    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0 || allowFailure) {
        resolve(code || 0);
        return;
      }
      reject(new Error(`${label} failed with exit code ${code}`));
    });
  });
}

async function refreshCaches() {
  if (SKIP_REFRESH) {
    console.log('Skipping cache refresh. Existing scheduled cache workflows are expected to run before this job.');
    return;
  }

  await runStep('Refresh API/source insight cache', 'npm', ['run', 'refresh:insight-cache'], {
    INSIGHT_REFRESH_SCOPE: process.env.INSIGHT_REFRESH_SCOPE || 'all'
  });
  await runStep('Refresh cached LLM outputs', 'npm', ['run', 'refresh:llm-cache']);
}

async function generateFeedback() {
  if (SKIP_FEEDBACK) {
    console.log('Skipping feedback generation.');
    return;
  }

  const scriptArgs = DRY_RUN
    ? ['run', 'auto-improve:feedback:dry-run']
    : ['run', 'auto-improve:feedback:sample'];
  await runStep('Generate and store artifact feedback', 'npm', scriptArgs, {
    AUTO_IMPROVE_RUN_TYPE: 'weekly_auto_improvement',
    AUTO_IMPROVE_DISTRICTS: DISTRICTS,
    AUTO_IMPROVE_ARTIFACT_TYPES: ARTIFACT_TYPES.join(','),
    AUTO_IMPROVE_ARTIFACT_LIMIT: process.env.AUTO_IMPROVE_ARTIFACT_LIMIT || String(ARTIFACT_TYPES.length),
    AUTO_IMPROVE_SAVE: DRY_RUN ? '0' : '1'
  });
}

async function draftPromptImprovements() {
  if (SKIP_DRAFTS) {
    console.log('Skipping prompt improvement drafts.');
    return;
  }
  if (DRY_RUN && (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY)) {
    console.log('Skipping prompt improvement drafts in dry-run because Supabase credentials are not available.');
    return;
  }

  for (const artifactType of ARTIFACT_TYPES) {
    const sectionKey = SECTION_BY_ARTIFACT[artifactType] || artifactType;
    const promptKey = process.env.AUTO_IMPROVE_PROMPT_KEY || `district-screen-${artifactType}`;
    const scriptArgs = DRY_RUN
      ? ['run', 'auto-improve:prompt-draft:dry-run']
      : ['run', 'auto-improve:prompt-draft:sample'];
    await runStep(
      `Draft prompt improvement for ${artifactType}/${sectionKey}`,
      'npm',
      scriptArgs,
      {
        AUTO_IMPROVE_ARTIFACT_TYPE: artifactType,
        AUTO_IMPROVE_SECTION_KEY: sectionKey,
        AUTO_IMPROVE_PROMPT_KEY: promptKey,
        AUTO_IMPROVE_CURRENT_PROMPT_VERSION: process.env.AUTO_IMPROVE_CURRENT_PROMPT_VERSION || `${promptKey}-v0.1`,
        AUTO_IMPROVE_FEEDBACK_LIMIT: process.env.AUTO_IMPROVE_FEEDBACK_LIMIT || '25',
        AUTO_IMPROVE_DRAFT_SAVE: DRY_RUN ? '0' : '1'
      },
      { allowFailure: CONTINUE_ON_DRAFT_FAILURE }
    );
  }
}

async function main() {
  console.log('LIBscope weekly auto-improvement');
  console.log(`Mode: ${DRY_RUN ? 'dry-run' : 'save-run'}`);
  console.log(`Districts: ${DISTRICTS}`);
  console.log(`Artifacts: ${ARTIFACT_TYPES.join(', ')}`);

  await refreshCaches();
  await generateFeedback();
  await draftPromptImprovements();

  console.log('\nWeekly auto-improvement flow completed.');
}

main().catch((error) => {
  console.error('weekly auto-improvement failed:', error.message);
  process.exit(1);
});
