# LIBscope 분석 하네스 가이드

기준일: 2026-06-14  
관리 코드:

- `functions/_shared/analysis-signals.cjs`
- `functions/_shared/llm-harness.cjs`
- `functions/_shared/llm-gateway.cjs`

## 목적

이 문서는 LIBscope의 AI 작업 파이프라인에서 판단 근거로 작동하는 분석 하네스 규칙이다. 문서는 Obsidian 등에서 수정 가능해야 하며, 이후 프롬프트와 코드 계약을 갱신할 때 기준 문서로 사용한다.

핵심 원칙은 다음과 같다.

1. 수치 계산은 코드가 담당.
2. 평균, 분위, 순위, 격차, 데이터 계보는 코드 산출물만 사용.
3. AI는 계산된 `analysisSignals`를 해석해 판단문, 검토 가설, 유의사항을 작성.
4. 도서관 운영데이터가 붙기 전까지 실제 이용 수요나 성과는 단정하지 않음.

## 데이터 계보 구분

| 구분 | 의미 | 재계산 정책 | AI 표현 규칙 |
| --- | --- | --- | --- |
| `fixed_dataset` | PDF, CSV, 수동 추출처럼 기준값이 고정된 데이터 | 원자료 교체 또는 수동 재추출 전까지 재집계하지 않음 | "고정 참고값", "조사 기준값"으로 표현 |
| `fixed_fallback` | API 미연결 또는 보조 CSV fallback | 운영 기준값이 아니라 임시 기준으로 표시 | "fallback", "백업 기준"을 숨기지 않음 |
| `api_cached` | Supabase 또는 외부 API에서 적재·캐시한 데이터 | `reference_date`, snapshot, cache version 변경 시 재계산 | "갱신형 지표", "기준월/기준일"을 함께 해석 |
| `api_cached_current_static_baseline` | 현재 값은 API 캐시, 비교 기준은 정적 baseline | 현재 값 갱신 시 재계산, baseline은 원자료 교체 전까지 유지 | 현재값과 baseline의 기준 차이를 유의사항에 반영 |
| `mixed_static_refreshable` | 고정 문화 지표와 갱신 인구/복지 지표를 함께 쓰는 판단 | 갱신형 축이 바뀌면 재계산 | 추세나 인과관계로 쓰지 않고 교차 검토 질문으로 사용 |

## 코드 기반 산출물

`analysisSignals`는 AI 호출 전 코드가 생성한다.

```json
{
  "version": "analysis-signals-v0.1",
  "dataLineage": {},
  "comparisons": {},
  "notableSignals": [],
  "crossMetricTensions": [],
  "serviceHypotheses": [],
  "watchPoints": [],
  "recommendedQuestions": []
}
```

### `comparisons`

지표별 서울 평균, 25개 자치구 내 분위, 평균 격차, 데이터 유형을 담는다. AI는 이 값 외의 평균, 순위, 분위, 격차를 새로 만들 수 없다.

### `notableSignals`

상위권, 하위권, 평균 대비 격차가 있는 지표를 모은다. 화면 문구는 이 배열에서 출발하되 단순 순위 설명으로 끝나면 안 된다.

### `crossMetricTensions`

지표 간 엇갈림, 불균형, 보완 관계를 담는다. 심화 인사이트는 이 배열을 가장 우선 사용한다.

예시:

- 문화시설 공급은 상위권이나 도서관 밀도는 하위권.
- 아동층과 고령층 비중의 방향이 다름.
- 교육기관 밀도는 높지만 도서관 밀도가 낮음.
- 수급률과 연령구조가 동시에 정보 도달성 점검을 요구함.

### `serviceHypotheses`

운영데이터가 붙기 전 단계의 검토 가설이다. 실제 결론이 아니라 이후 도서관 운영데이터로 검증할 질문이다.

### `watchPoints`

해석 유의사항이다. 고정값과 갱신값의 기준 차이, 민감 지표 표현, 운영데이터 부재를 명시한다.

## AI 판단 절차

AI는 다음 순서로만 판단한다.

1. `dataLineage` 확인.
2. `notableSignals`에서 자치구 특이점 확인.
3. `crossMetricTensions`에서 지표 간 긴장 또는 보완 관계 확인.
4. `serviceHypotheses`를 검토 가설로 변환.
5. `watchPoints`로 과잉해석 제거.
6. 화면용 문구 또는 보고서 본문 작성.

## 금지 규칙

- 코드가 주지 않은 평균, 순위, 분위 생성 금지.
- 고정 PDF/CSV 값을 최신 API 결과처럼 표현 금지.
- API 캐시 값을 영구 고정값처럼 표현 금지.
- 지표값만 반복하는 문장 금지.
- "접근성 강화 필요", "맞춤형 서비스 필요" 같은 일반론 단독 사용 금지.
- 장애, 외국인, 수급자 등 민감 지표를 지역 문제의 원인처럼 표현 금지.
- 운영데이터 없이 프로그램 성과, 이용 수요, 방문 패턴 단정 금지.

## 화면 출력 규칙

화면 패널은 다음 구조를 따른다.

1. 판단: 1문장.
2. 근거: 코드 산출 비교값 또는 실제 지표값.
3. 의미: 도서관 운영상 함의.
4. 판단 근거: 비교 기준, 데이터 유형, 유의사항.

`keyFindings`는 가능한 한 다음 형식을 사용한다.

```text
근거: [코드 산출값 또는 입력 지표] / 의미: [도서관 운영상 판단]
```

## 보고서 출력 규칙

보고서 본문은 다음 순서를 따른다.

1. 근거 지표 묶음.
2. 비교 기준 또는 교차 긴장.
3. 도서관 의사결정 함의.
4. 운영데이터 연결 후 검증할 질문.
5. 해석 유의사항.

## 갱신 정책

| 산출물 | 갱신 조건 |
| --- | --- |
| `analysisSignals` | `districtData`, `cultureMetrics`, `ANALYSIS_SIGNAL_VERSION`, `HARNESS_VERSION` 중 하나 변경 |
| LLM 캐시 | `snapshotKey`, `promptVersion`, `harnessVersion`, `modelRegistryVersion` 변경 |
| 고정 문화 지표 해석 | 원자료 또는 하네스 문서 변경 전까지 재생성하지 않음 |
| 갱신형 인구·사회안전망 해석 | API 기준일, Supabase reference_date, cache version 변경 시 재생성 |
| 보고서 아카이브 | 생성 시점별 누적 저장, 최신 snapshot 전까지 재사용 |

## 향후 운영데이터 연결 시 추가할 축

- 시간대별 방문·대출.
- 연령대별 회원·이용.
- 프로그램 신청·참여·노쇼.
- 장서 주제별 대출.
- 공간 예약·체류.
- 민원·문의 유형.

운영데이터가 연결되면 `serviceHypotheses`는 검토 가설에서 검증 결과로 승격할 수 있다.
