const FEEDBACK_FRAMEWORK_VERSION = 'libscope-feedback-framework-v0.1';
const DEFAULT_TIMEOUT_MS = 45_000;

const ARTIFACT_TYPES = {
  districtInsight: {
    label: '자치구 종합 인사이트',
    sectionKey: 'districtInsight',
    expectedContent: 'insight cards, cautions, and high-level district judgment'
  },
  population: {
    label: '인구구조 분석 해석',
    sectionKey: 'population',
    expectedContent: 'population interpretation packet'
  },
  culture: {
    label: '문화역량 및 문화향유 지표 해석',
    sectionKey: 'culture',
    expectedContent: 'culture interpretation packet'
  },
  education: {
    label: '교육인프라 해석',
    sectionKey: 'education',
    expectedContent: 'education interpretation packet'
  },
  socialSafety: {
    label: '사회안전망 대상자 구성 인사이트',
    sectionKey: 'socialSafety',
    expectedContent: 'social safety interpretation packet'
  },
  reportSummary: {
    label: '보고서 요약',
    sectionKey: 'reportSummary',
    expectedContent: 'executive summary'
  },
  reportBody: {
    label: '보고서 본문',
    sectionKey: 'reportBody',
    expectedContent: 'narrative report body'
  },
  pdfReport: {
    label: 'PDF 보고서 표현 품질',
    sectionKey: 'pdfReport',
    expectedContent: 'PDF-facing report text'
  },
  notionReport: {
    label: 'Notion 보고서 표현 품질',
    sectionKey: 'notionReport',
    expectedContent: 'Notion-facing report text'
  }
};

const RUBRIC_KEYS = [
  'districtSpecificity',
  'evidenceConnection',
  'libraryPolicyFit',
  'operationalActionability',
  'equityAccessibility',
  'reportLanguageQuality',
  'promptImprovementValue'
];

const ISSUE_TAGS = [
  'generic_language',
  'generic_actionability',
  'weak_district_specificity',
  'single_metric_conclusion',
  'number_restatement',
  'unsupported_causality',
  'library_role_overreach',
  'missing_library_operation_link',
  'accessibility_collapsed',
  'deficit_framing',
  'report_style_weak',
  'prompt_hint_not_actionable',
  'schema_or_structure_issue'
];

function buildFeedbackResponseSchema() {
  return {
    type: 'object',
    additionalProperties: false,
    required: [
      'frameworkVersion',
      'artifactType',
      'sectionKey',
      'districtName',
      'qualityScore',
      'operatorUsefulnessScore',
      'rubricScores',
      'issueTags',
      'artifactLevelFeedback',
      'promptImprovementHints',
      'avoidPatterns',
      'mustIncludeNextTime',
      'evidenceGaps',
      'rewriteRisk'
    ],
    properties: {
      frameworkVersion: { type: 'string' },
      artifactType: { type: 'string', enum: Object.keys(ARTIFACT_TYPES) },
      sectionKey: { type: 'string' },
      districtName: { type: 'string' },
      qualityScore: { type: 'integer', minimum: 0, maximum: 100 },
      operatorUsefulnessScore: { type: 'integer', minimum: 1, maximum: 5 },
      rubricScores: {
        type: 'object',
        additionalProperties: false,
        required: RUBRIC_KEYS,
        properties: Object.fromEntries(RUBRIC_KEYS.map(key => [key, {
          type: 'integer',
          minimum: 1,
          maximum: 5
        }]))
      },
      issueTags: {
        type: 'array',
        items: { type: 'string', enum: ISSUE_TAGS }
      },
      artifactLevelFeedback: {
        type: 'array',
        minItems: 1,
        maxItems: 6,
        items: { type: 'string' }
      },
      promptImprovementHints: {
        type: 'array',
        minItems: 1,
        maxItems: 6,
        items: { type: 'string' }
      },
      avoidPatterns: {
        type: 'array',
        maxItems: 8,
        items: { type: 'string' }
      },
      mustIncludeNextTime: {
        type: 'array',
        maxItems: 8,
        items: { type: 'string' }
      },
      evidenceGaps: {
        type: 'array',
        maxItems: 8,
        items: { type: 'string' }
      },
      rewriteRisk: {
        type: 'string',
        enum: ['low', 'medium', 'high']
      }
    }
  };
}

function buildPromptImprovementResponseSchema() {
  return {
    type: 'object',
    additionalProperties: false,
    required: [
      'promptKey',
      'artifactType',
      'sectionKey',
      'draftPromptVersion',
      'draftPromptText',
      'changeSummary',
      'appliedFeedbackThemes',
      'riskNotes'
    ],
    properties: {
      promptKey: { type: 'string' },
      artifactType: { type: 'string' },
      sectionKey: { type: 'string' },
      draftPromptVersion: { type: 'string' },
      draftPromptText: { type: 'string' },
      changeSummary: { type: 'string' },
      appliedFeedbackThemes: {
        type: 'array',
        items: { type: 'string' }
      },
      riskNotes: {
        type: 'array',
        items: { type: 'string' }
      }
    }
  };
}

function normalizeGeneratedContent(content) {
  if (typeof content === 'string') return content;
  return JSON.stringify(content || {}, null, 2);
}

function getEnv(name) {
  return globalThis.Netlify?.env?.get?.(name) || globalThis.process?.env?.[name] || '';
}

function normalizeBaseUrl(value, fallback = '') {
  return String(value || fallback).replace(/\/+$/, '');
}

function parseJsonFromText(text) {
  const raw = String(text || '').trim();
  if (!raw) throw new Error('피드백 모델 응답이 비어 있습니다.');

  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1].trim() : raw;
  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  if (start < 0 || end < start) {
    throw new Error('피드백 모델 응답에서 JSON 객체를 찾지 못했습니다.');
  }

  return JSON.parse(candidate.slice(start, end + 1));
}

async function fetchWithTimeout(url, options = {}, timeoutMs = DEFAULT_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

function buildArtifactFeedbackPrompt({
  districtName,
  artifactType,
  sectionKey,
  generatedContent,
  metricSummary,
  sourceOutputId
}) {
  const artifact = ARTIFACT_TYPES[artifactType];
  if (!artifact) {
    throw new Error(`Unsupported artifactType: ${artifactType}`);
  }

  const inputPacket = {
    districtName,
    artifactType,
    sectionKey: sectionKey || artifact.sectionKey,
    sourceOutputId: sourceOutputId || null,
    generatedContent: normalizeGeneratedContent(generatedContent),
    metricSummary: metricSummary || null
  };

  return [
    'You are the LIBscope v2 auto-improvement evaluator.',
    'Evaluate the generated artifact from the perspective of public-library policy managers and operators.',
    '',
    'Critical boundaries:',
    '- Do not infer or ask for the original generation prompt.',
    '- Do not evaluate prompt compliance, because the prompt is intentionally hidden.',
    '- Evaluate only the generated artifact, district name, artifact type, and optional metric summary.',
    '- Keep districtName only as case context. The feedback must improve the artifact type, not create a district-specific prompt.',
    '- Return one valid JSON object only. No Markdown.',
    '',
    'Rubric:',
    '1. District specificity: concrete local conditions, at least two metric axes, not reusable for every district.',
    '2. Evidence connection: numbers or categories are connected to interpretation without unsupported causality.',
    '3. Library policy fit: useful to policy managers; connects to collection, program, space, accessibility, partnerships, outreach, or communication channels.',
    '4. Operational actionability: gives practical planning directions, not only vague words like strengthen, expand, cooperate, or monitor.',
    '5. Equity and accessibility: avoids deficit framing; separates mobility, language, information, digital, sensory, and face-to-face support.',
    '6. Report-language quality: sober public-sector report style; no promotional or overconfident wording.',
    '7. Prompt-improvement value: feedback can be converted into future prompt rules.',
    '',
    'Prompt improvement hints must be concrete rules. Bad examples: "write more specifically", "improve the report".',
    'Avoid patterns should list phrases or structures that future prompts should ban or weaken.',
    '',
    'Allowed issueTags:',
    ISSUE_TAGS.join(', '),
    '',
    'Required response shape:',
    JSON.stringify(buildFeedbackResponseSchema(), null, 2),
    '',
    'Input artifact:',
    JSON.stringify(inputPacket, null, 2)
  ].join('\n');
}

function buildPromptImprovementPrompt({
  promptKey,
  artifactType,
  sectionKey,
  currentPromptVersion,
  currentPromptText,
  feedbackRows = [],
  additionalGuidance = ''
}) {
  return [
    'You are the LIBscope v2 prompt improvement editor.',
    'Your job is to create a draft prompt for the next generation cycle.',
    '',
    'Important role separation:',
    '- The feedback evaluator did not read the original generation prompt.',
    '- You may read the current prompt and the accumulated feedback.',
    '- Do not activate the new prompt. Return a draft only.',
    '- Preserve the output contract unless feedback clearly requires a stronger rule.',
    '- Return one valid JSON object only. No Markdown.',
    '',
    'Improvement goals:',
    '- Make generated artifacts more district-specific.',
    '- Reduce generic public-sector advice.',
    '- Strengthen evidence-to-interpretation links.',
    '- Convert feedback into concrete prompt rules.',
    '- Keep the artifact useful for public-library policy managers and operators.',
    '',
    'Required response shape:',
    JSON.stringify(buildPromptImprovementResponseSchema(), null, 2),
    '',
    'Input:',
    JSON.stringify({
      promptKey,
      artifactType,
      sectionKey,
      currentPromptVersion,
      currentPromptText,
      feedbackRows,
      additionalGuidance: additionalGuidance || null
    }, null, 2)
  ].join('\n');
}

function pickFeedbackProviderAndModel({ requestedProvider, requestedModel } = {}) {
  const normalizedProvider = String(requestedProvider || '').replace(/^direct-/, '');
  const available = {
    anthropic: Boolean(getEnv('DIRECT_ANTHROPIC_API_KEY') || getEnv('ANTHROPIC_API_KEY')),
    openai: Boolean(getEnv('DIRECT_OPENAI_API_KEY') || getEnv('OPENAI_API_KEY')),
    gemini: Boolean(getEnv('DIRECT_GEMINI_API_KEY') || getEnv('GEMINI_API_KEY'))
  };
  const provider = ['anthropic', 'openai', 'gemini'].includes(normalizedProvider)
    ? normalizedProvider
    : available.anthropic
      ? 'anthropic'
      : available.openai
        ? 'openai'
        : 'gemini';

  const defaults = {
    anthropic: getEnv('AUTO_IMPROVE_ANTHROPIC_MODEL') || 'claude-sonnet-4-6',
    openai: getEnv('AUTO_IMPROVE_OPENAI_MODEL') || 'gpt-5.4',
    gemini: getEnv('AUTO_IMPROVE_GEMINI_MODEL') || 'gemini-3.1-pro-preview'
  };

  return {
    provider,
    model: requestedModel || getEnv('AUTO_IMPROVE_FEEDBACK_MODEL') || defaults[provider]
  };
}

async function callOpenAiFeedbackJson({ model, prompt }) {
  const apiKey = getEnv('DIRECT_OPENAI_API_KEY') || getEnv('OPENAI_API_KEY');
  if (!apiKey) throw new Error('OpenAI 피드백 호출용 API key가 없습니다.');
  const baseUrl = normalizeBaseUrl(getEnv('DIRECT_OPENAI_BASE_URL') || getEnv('OPENAI_BASE_URL'), 'https://api.openai.com/v1');
  const response = await fetchWithTimeout(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: 'You return only valid JSON for a Korean public-library policy evaluation workflow.' },
        { role: 'user', content: prompt }
      ],
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: 'libscope_artifact_feedback',
          strict: true,
          schema: buildFeedbackResponseSchema()
        }
      }
    })
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error?.message || `OpenAI 피드백 호출 실패 ${response.status}`);
  return parseJsonFromText(payload.choices?.[0]?.message?.content);
}

async function callOpenAiJsonObject({ model, prompt }) {
  const apiKey = getEnv('DIRECT_OPENAI_API_KEY') || getEnv('OPENAI_API_KEY');
  if (!apiKey) throw new Error('OpenAI 호출용 API key가 없습니다.');
  const baseUrl = normalizeBaseUrl(getEnv('DIRECT_OPENAI_BASE_URL') || getEnv('OPENAI_BASE_URL'), 'https://api.openai.com/v1');
  const response = await fetchWithTimeout(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: 'You return only valid JSON for a Korean public-library prompt improvement workflow.' },
        { role: 'user', content: prompt }
      ],
      response_format: { type: 'json_object' }
    })
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error?.message || `OpenAI 호출 실패 ${response.status}`);
  return parseJsonFromText(payload.choices?.[0]?.message?.content);
}

async function callGeminiFeedbackJson({ model, prompt }) {
  const apiKey = getEnv('DIRECT_GEMINI_API_KEY') || getEnv('GEMINI_API_KEY');
  if (!apiKey) throw new Error('Gemini 피드백 호출용 API key가 없습니다.');
  const baseUrl = normalizeBaseUrl(
    getEnv('DIRECT_GOOGLE_GEMINI_BASE_URL') || getEnv('GOOGLE_GEMINI_BASE_URL'),
    'https://generativelanguage.googleapis.com'
  );
  const response = await fetchWithTimeout(`${baseUrl}/v1beta/models/${model}:generateContent`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': apiKey
    },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { responseMimeType: 'application/json' }
    })
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error?.message || `Gemini 피드백 호출 실패 ${response.status}`);
  const text = payload.candidates?.[0]?.content?.parts?.map(part => part.text || '').join('\n');
  return parseJsonFromText(text);
}

async function callAnthropicFeedbackJson({ model, prompt }) {
  const apiKey = getEnv('DIRECT_ANTHROPIC_API_KEY') || getEnv('ANTHROPIC_API_KEY');
  if (!apiKey) throw new Error('Anthropic 피드백 호출용 API key가 없습니다.');
  const baseUrl = normalizeBaseUrl(
    getEnv('DIRECT_ANTHROPIC_BASE_URL') || getEnv('ANTHROPIC_BASE_URL'),
    'https://api.anthropic.com'
  );
  const response = await fetchWithTimeout(`${baseUrl}/v1/messages`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model,
      max_tokens: 1800,
      messages: [{ role: 'user', content: prompt }]
    })
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error?.message || `Anthropic 피드백 호출 실패 ${response.status}`);
  const text = payload.content?.map(part => part.text || '').join('\n');
  return parseJsonFromText(text);
}

async function generateArtifactFeedback({ prompt, provider, model }) {
  if (provider === 'openai') return callOpenAiFeedbackJson({ model, prompt });
  if (provider === 'gemini') return callGeminiFeedbackJson({ model, prompt });
  return callAnthropicFeedbackJson({ model, prompt });
}

async function generatePromptImprovement({ prompt, provider, model }) {
  if (provider === 'openai') return callOpenAiJsonObject({ model, prompt });
  if (provider === 'gemini') return callGeminiFeedbackJson({ model, prompt });
  return callAnthropicFeedbackJson({ model, prompt });
}

function validateArtifactFeedback(feedback = {}) {
  const errors = [];
  if (feedback.frameworkVersion !== FEEDBACK_FRAMEWORK_VERSION) {
    errors.push('frameworkVersion mismatch');
  }
  if (!ARTIFACT_TYPES[feedback.artifactType]) {
    errors.push('unsupported artifactType');
  }
  if (!Number.isInteger(feedback.qualityScore) || feedback.qualityScore < 0 || feedback.qualityScore > 100) {
    errors.push('qualityScore must be an integer from 0 to 100');
  }
  if (!Number.isInteger(feedback.operatorUsefulnessScore) || feedback.operatorUsefulnessScore < 1 || feedback.operatorUsefulnessScore > 5) {
    errors.push('operatorUsefulnessScore must be an integer from 1 to 5');
  }
  RUBRIC_KEYS.forEach((key) => {
    const score = feedback.rubricScores?.[key];
    if (!Number.isInteger(score) || score < 1 || score > 5) {
      errors.push(`rubricScores.${key} must be an integer from 1 to 5`);
    }
  });
  ['artifactLevelFeedback', 'promptImprovementHints'].forEach((key) => {
    if (!Array.isArray(feedback[key]) || feedback[key].length === 0) {
      errors.push(`${key} must be a non-empty array`);
    }
  });
  if (!['low', 'medium', 'high'].includes(feedback.rewriteRisk)) {
    errors.push('rewriteRisk must be low, medium, or high');
  }
  return {
    ok: errors.length === 0,
    errors
  };
}

function validatePromptImprovement(improvement = {}) {
  const errors = [];
  ['promptKey', 'artifactType', 'sectionKey', 'draftPromptVersion', 'draftPromptText', 'changeSummary'].forEach((key) => {
    if (!String(improvement[key] || '').trim()) errors.push(`${key} is required`);
  });
  if (!Array.isArray(improvement.appliedFeedbackThemes)) {
    errors.push('appliedFeedbackThemes must be an array');
  }
  if (!Array.isArray(improvement.riskNotes)) {
    errors.push('riskNotes must be an array');
  }
  return {
    ok: errors.length === 0,
    errors
  };
}

module.exports = {
  ARTIFACT_TYPES,
  FEEDBACK_FRAMEWORK_VERSION,
  ISSUE_TAGS,
  RUBRIC_KEYS,
  buildArtifactFeedbackPrompt,
  buildFeedbackResponseSchema,
  buildPromptImprovementPrompt,
  buildPromptImprovementResponseSchema,
  generateArtifactFeedback,
  generatePromptImprovement,
  pickFeedbackProviderAndModel,
  validateArtifactFeedback,
  validatePromptImprovement
};
