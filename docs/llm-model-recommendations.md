# LIBscope LLM 모델 추천 및 비용 라우팅 계획

기준일: 2026-06-09

## 원칙

- 모델 자체의 목록, provider 특성, 교체 절차는 `docs/llm-model-registry.md`를 기준으로 관리.
- 런타임 모델 카탈로그는 `functions/_shared/llm-model-registry.cjs`를 단일 코드 registry로 사용.
- 섹션별 입력·출력 schema, 품질 게이트, 보고서 목차는 `docs/llm-harness-contracts.md`를 기준으로 관리.
- 실제 API 키가 없는 현재 단계에서는 mock 생성만 수행.
- 기본 운영값은 `balanced`. 단문 반복 생성은 저비용, 장문 보고서와 최종 검토만 고품질 모델 사용.
- 모델명은 환경변수로 분리해 교체 가능하게 유지.
- 모델이나 버전이 바뀌어도 출력 목적이 변하지 않도록 prompt/guide 문서를 하네스 버전으로 관리.
- 모든 보고서형 텍스트는 존대 표현보다 명사형 종결 어미 우선.
- 고정 데이터셋은 최초 생성 후 Supabase에 저장하고, 지표 갱신 전까지 재사용.

## 확인한 공식 기준

- Netlify AI Gateway는 OpenAI, Anthropic, Gemini 모델을 공식 지원하며, Mistral은 현재 별도 직접 API 후보로 관리.
- OpenAI `gpt-5.4-mini`는 `gpt-5.4`, `gpt-5.5`보다 저렴하므로 반복 생성과 화면 초안에 우선 배치.
- Gemini `gemini-2.5-flash-lite`와 `gemini-3.1-flash-lite`는 대량 처리와 단순 지표 해석에 유리한 비용대.
- Anthropic `claude-haiku-4-5`는 저비용 Claude 후보, `claude-sonnet-4-6`은 장문 보고서 보조/대안 후보.
- Mistral `mistral-small-latest`는 매우 저렴한 직접 API 후보이나 Netlify AI Gateway 기본 경로와 분리 필요.

참고: Netlify AI Gateway 모델 목록, OpenAI API pricing, Gemini API pricing, Anthropic pricing, Mistral pricing.

## 추천 라우팅

| 판단 단위 | 기본 비용 단계 | 기본 모델 | 대안 모델 | 승격 조건 |
| --- | --- | --- | --- | --- |
| 개별 지표묶음 짧은 해석 | 저비용 | `gemini-2.5-flash-lite` | `gpt-5.4-mini`, `claude-haiku-4-5`, `mistral-small-latest` | JSON/schema 실패, 수치 누락, 문체 위반 시 `gpt-5.4-mini` |
| 자치구 종합 인사이트 | 균형 | `gpt-5.4-mini` | `gemini-3.1-flash-lite`, `claude-haiku-4-5` | 지표 간 충돌, 공개 문구 품질 부족 시 `gpt-5.4` 또는 `claude-sonnet-4-6` |
| 자치구 보고서 다운로드 | 요청형 고품질 | `gpt-5.4` | 초안 `gemini-3.1-pro-preview`, 대안 `claude-sonnet-4-6` | 기관 제출본, 민감한 결론, 장문 구조 오류 시 `gpt-5.5` |
| 문화역량 고정 데이터 사전 생성 | 대량 저비용 | `gemini-2.5-flash-lite` | `mistral-small-latest`, `gpt-5.4-mini` | 자치구별 출력 품질 편차가 큰 경우 일부만 `gpt-5.4-mini` 재생성 |
| 교육/사회안전망/인구 섹션 해석 | 저비용-균형 | `gpt-5.4-mini` | `gemini-3.1-flash-lite`, `claude-haiku-4-5` | 정책적 함의가 커지거나 보고서 본문에 포함될 때 상위 보고서 모델로 통합 |

## 비용 절감 규칙

1. 단문 지표 해석은 저비용 모델로 1차 생성.
2. 출력 schema 검증, 수치 포함 여부, 명사형 문체, 금지 표현 검사를 통과하면 저장.
3. 실패한 항목만 동일 prompt로 상위 모델에 재요청.
4. 자치구 보고서는 snapshot key와 harness version 기준으로 Supabase에 캐시.
5. 지표 갱신 전에는 저장된 보고서를 재사용하고, 갱신 이후 최초 요청 시 재생성.
6. 문화역량처럼 고정 데이터셋 기반 해석은 운영 중 실시간 호출 금지.
7. 대량 생성은 provider별 batch/flex 할인 경로를 별도 검토.

## 환경변수

```env
# Provider selection
LLM_PROVIDER=mock
LLM_COST_PROFILE=balanced
LLM_ESCALATION_ENABLED=true

# OpenAI
OPENAI_API_KEY=
OPENAI_MODEL_SHORT=gpt-5.4-mini
OPENAI_MODEL_INSIGHT=gpt-5.4-mini
OPENAI_MODEL_REPORT=gpt-5.4
OPENAI_MODEL_PREMIUM=gpt-5.5

# Gemini
GEMINI_API_KEY=
GEMINI_MODEL_SHORT=gemini-2.5-flash-lite
GEMINI_MODEL_INSIGHT=gemini-3.1-flash-lite
GEMINI_MODEL_REPORT=gemini-3.1-pro-preview

# Anthropic
ANTHROPIC_API_KEY=
ANTHROPIC_MODEL_SHORT=claude-haiku-4-5
ANTHROPIC_MODEL_REPORT=claude-sonnet-4-6

# Optional direct API candidate
MISTRAL_API_KEY=
MISTRAL_MODEL_SHORT=mistral-small-latest
```

## provider 전환 규칙

1. `LLM_PROVIDER=mock`
   - 현재 상태.
   - 외부 호출 없음.
   - 화면 및 저장 구조 검증용.

2. `LLM_PROVIDER=netlify-ai-gateway`
   - Netlify Functions에서 OpenAI, Gemini, Anthropic 공식 SDK 사용.
   - Netlify가 주입하는 provider key/base URL을 우선 사용.
   - 사이트 production deploy 이후 로컬에서도 gateway 환경변수 주입 가능.

3. `LLM_PROVIDER=openai`, `gemini`, `anthropic`
   - 개별 provider 직접 API 사용.
   - 동일한 prompt contract와 출력 schema 적용.
   - provider별 표현 차이는 post-processor에서 정규화.

4. `LLM_PROVIDER=mistral`
   - 저비용 대량 사전 생성 후보.
   - Netlify AI Gateway 기본 지원 모델이 아니므로 별도 adapter와 과금 모니터링 필요.

## 품질 게이트

- 존대 표현 제거.
- 명사형 또는 보고서형 단정 어미 우선.
- 수치 없는 평가 문장 최소화.
- 입력 지표명, 값, 기준연도 유지.
- 고정 데이터셋과 API 변동 데이터의 기준 차이 명시.
- 원인 단정은 피하되 판단 근거와 실행 방향을 함께 제시.
- 같은 데이터에서 생성한 단문 해석과 장문 보고서의 결론 흐름 불일치 여부 점검.
