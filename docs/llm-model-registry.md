# LIBscope LLM 모델 관리대장

기준일: 2026-06-13  
관리 코드: `functions/_shared/llm-model-registry.cjs`  
현재 registry 버전: `llm-model-registry-v0.1`

관련 계약 문서:

- 섹션별 입출력·문체·품질 게이트: `docs/llm-harness-contracts.md`
- 런타임 계약 코드: `functions/_shared/llm-output-contracts.cjs`
- Supabase 저장 초안: `docs/supabase-llm-harness-schema.sql`

## 목적

이 문서는 LIBscope에서 사용하는 LLM 모델을 별도 관리하기 위한 기준 문서다. 모델명, provider, 비용 등급, 적용 섹션, 승격 조건, 교체 절차를 한곳에서 관리해 모델이나 제품이 바뀌어도 화면 문구, 보고서 양식, 판단 흐름이 흔들리지 않도록 한다.

모델은 문서의 목적을 결정하지 않는다. 모델은 하네스가 정한 입력, 출력 schema, 문체 규칙, 검수 기준 안에서 특정 슬롯을 채우는 실행 수단으로만 사용한다.

## 관리 원칙

- 모델 목록과 라우팅 정책은 화면/보고서 프롬프트와 분리 관리.
- 실제 생성 결과에는 `model_registry_version`, `harness_version`, `prompt_version`, `model`, `provider`, `snapshot_key` 저장.
- 모델 교체 시 동일 입력으로 골든 테스트 수행.
- 가격이나 provider 지원 범위는 배포 전 공식 문서 기준으로 재확인.
- Netlify AI Gateway 경로는 OpenAI, Gemini, Anthropic 우선.
- Mistral 등 별도 provider는 직접 API adapter와 비용 모니터링을 붙인 뒤 실험 적용.

## Provider 관리

| Provider | 운영 경로 | 주 용도 | 주의사항 |
| --- | --- | --- | --- |
| OpenAI | Netlify AI Gateway 또는 직접 API | 화면 인사이트, 보고서 본문, JSON 구조화 출력 | 고품질 모델은 보고서 최초 생성 또는 검수에 한정 |
| Gemini | Netlify AI Gateway 또는 직접 API | 대량 사전 생성, 저비용 단문 요약, 고정 데이터셋 처리 | 민감한 사회 지표 문구는 품질 게이트 통과 필요 |
| Anthropic | Netlify AI Gateway 또는 직접 API | 보수적 문체, 장문 흐름 점검, 보고서 보조 검수 | 기본 생성보다 검수와 대안 작성에 우선 배치 |
| Mistral | 직접 API 후보 | 저비용 초안, 대량 사전 생성 실험 | Netlify AI Gateway 기본 경로와 분리 관리 |

## 모델 카탈로그

| 모델 | Provider | 비용 등급 | 기본 역할 | 우선 적용 | 피해야 할 사용 |
| --- | --- | --- | --- | --- | --- |
| `gemini-2.5-flash-lite` | Gemini | low | 고정 데이터셋 및 단문 지표 해석 1차 생성 | 문화역량 고정 해석, 주변 시설 단문 해석, 대량 precompute | 민감한 결론 단정, 최종 보고서 단독 생성 |
| `gemini-3.1-flash-lite` | Gemini | low-balanced | 화면용 보조 인사이트 및 대안 생성 | 종합 인사이트 대안, 섹션별 빠른 초안 | 장문 정책 보고서 최종본 |
| `gemini-3.1-pro-preview` | Gemini | balanced-report | 보고서 초안 및 장문 대안 | 보고서 초안, 장문 구조 실험 | 최종 제출본 단독 검수 |
| `gpt-5.4-mini` | OpenAI | balanced | 화면 노출용 기본 해석과 종합 인사이트 | 인구구조, 사회안전망, 교육인프라, 자치구 종합 인사이트 | 기관 제출용 장문 최종 검수 |
| `gpt-5.4` | OpenAI | report | 자치구 보고서 본문 생성 | 자치구 보고서 다운로드, 여러 지표묶음 통합 해석 | 단순 반복 생성 |
| `gpt-5.5` | OpenAI | premium | 최종 제출본 검수 및 민감 결론 재작성 | 기관 제출본, 정책 결론 품질 검수, 고위험 문구 조정 | 일반 화면 진입 시 실시간 호출 |
| `claude-haiku-4-5` | Anthropic | low-balanced | 저비용 보조 해석과 보수적 문구 초안 | 문체 대안, 민감 지표의 조심스러운 초안 | 복잡한 장문 보고서 단독 생성 |
| `claude-sonnet-4-6` | Anthropic | report-review | 장문 흐름 검수와 정책 문구 보조 | 보고서 보조 검수, 종합 인사이트 승격, 보수적 표현 재작성 | 대량 사전 생성 |
| `mistral-small-latest` | Mistral | low-direct | 직접 API 기반 저비용 대량 초안 후보 | 문화역량 고정 해석 실험, 대량 생성 비용 비교 | Netlify Gateway 전용 운영, 민감 지표 최종 문구 |

## 섹션별 라우팅

| 판단 단위 | 기본 모델 | 보조/대안 | 승격 모델 | 저장 전략 |
| --- | --- | --- | --- | --- |
| 개별 지표묶음 짧은 해석 | `gemini-2.5-flash-lite` | `claude-haiku-4-5`, `mistral-small-latest` | `gpt-5.4-mini` | 지표 snapshot 단위 캐시 |
| 자치구 종합 인사이트 | `gpt-5.4-mini` | `gemini-3.1-flash-lite`, `claude-haiku-4-5` | `gpt-5.4` 또는 `claude-sonnet-4-6` | 화면 카드 캐시 |
| 자치구 보고서 다운로드 | `gpt-5.4` | `gemini-3.1-pro-preview`, `claude-sonnet-4-6` | `gpt-5.5` | 보고서 버전 아카이브 |
| 문화역량 고정 해석 | `gemini-2.5-flash-lite` | `mistral-small-latest` | `gpt-5.4-mini` | 최초 생성 후 DB 저장 |
| 인구구조 분석 | `gpt-5.4-mini` | `gemini-3.1-flash-lite` | `gpt-5.4` | 지표 갱신 전까지 캐시 |
| 교육인프라 | `gpt-5.4-mini` | `claude-haiku-4-5` | `claude-sonnet-4-6` | 지표 갱신 전까지 캐시 |
| 사회안전망 대상자 구성 | `gpt-5.4-mini` | `claude-haiku-4-5` | `gpt-5.4` | 지표 갱신 전까지 캐시 |
| 주변 공공기관·문화시설 | `gemini-2.5-flash-lite` | `gpt-5.4-mini` | `gpt-5.4-mini` | 선택 도서관/좌표 기준 캐시 |

## 모델 교체 절차

1. 후보 모델을 이 문서의 모델 카탈로그에 추가.
2. `functions/_shared/llm-model-registry.cjs`에 동일 항목 추가.
3. 환경변수 예시와 provider adapter 지원 여부 확인.
4. 강남구, 종로구/중구, 노원구/은평구, 금천구/도봉구 기준 골든 테스트 실행.
5. schema, 수치, 문체, 금지 표현, 결론 과잉 여부 검수.
6. 기존 모델 대비 단가, 실패율, 재생성률, 결과 품질 비교.
7. registry version 또는 routing policy version 변경.
8. Notion/Obsidian 문서와 코드 registry 동기화.

## 품질 게이트

- JSON schema 위반 시 실패.
- 입력 지표명, 수치, 단위, 기준연도 누락 시 실패.
- 존대형 종결이 기본 문체로 반복될 경우 실패.
- "확실하다", "반드시", "열악하다"처럼 근거 이상으로 단정하는 표현은 실패.
- 고정 데이터와 API 변동 데이터의 기준 차이를 누락하면 실패.
- 민감 지표에서 대상 집단을 문제 원인처럼 표현하면 실패.
- 장문 보고서와 화면 요약의 결론 흐름이 충돌하면 실패.

## 관리 화면 아이디어

향후 관리자 화면 또는 내부 문서 영역에 다음 항목을 표시한다.

- provider별 키 연결 상태
- 모델별 비용 등급과 기본 역할
- 섹션별 기본/승격 모델
- 최근 생성 건수와 추정 비용
- 실패율, 재생성률, schema 위반율
- 마지막 공식 가격 확인일
- 마지막 골든 테스트 통과일
- 현재 운영 registry version
