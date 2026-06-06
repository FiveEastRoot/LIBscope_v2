# Implementation Log: Population Mode Switch and Supabase Schema Draft

작성일: 2026-06-06

## 구현 내용

- API 응답에 주민등록인구 기본값과 생활인구 병행 데이터를 함께 담는 `populationModes` 구조를 추가했습니다.
- 자치구별 현황과 개별도서관별 현황 모두 `resident`를 기본 모드로 반환합니다.
- 프런트엔드 인구 시각화 영역 우상단에 `주민등록` / `생활인구` 전환 버튼을 추가했습니다.
- 두 인구 모드는 API 응답 시점에 모두 사전 로드되고, 화면에서는 선택된 모드의 데이터만 바꿔 표시합니다.
- 수급률 응답에 `denominator: resident_population`을 추가했습니다.
- 수급률 출처 표기는 주민등록인구 분모 기준임을 명시했습니다.
- 외국인/다문화 지표의 화면 문구를 `외국인 주민` 기준으로 정리했습니다.
- Supabase 무료 플랜 기준의 검토용 SQL 초안을 추가했습니다.

## API 응답 구조

```text
population: {
  mode: "resident",
  ageDistribution: {},
  genderRatio: {},
  total: 0,
  source: "...",
  referenceDate: null,
  modes: {
    resident: {},
    living: {}
  }
}

populationModes: {
  defaultMode: "resident",
  modes: {
    resident: {},
    living: {}
  }
}
```

개별도서관 응답에서는 같은 구조가 `demographics` 아래에도 들어갑니다.

## 검증 결과

- `npm run build` 통과
- 자치구 API 직접 호출 통과
  - 강남구 기본 모드: `resident`
  - 주민등록인구: 527,320
  - 생활인구: 663,361
  - 생활인구 출처: `SPOP_LOCAL_RESD_DONG`
  - 수급률 분모: `resident_population`
- 개별도서관 API 직접 호출 통과
  - 강남구립못골도서관 기본 모드: `resident`
  - 반경 2km 주민등록인구: 82,549
  - 반경 2km 생활인구: 100,514
  - 생활인구 출처: `SPOP_LOCAL_RESD_DONG`
  - 수급률/수급자 지표 분모 기준: `resident_population`

## 남은 작업

- Supabase project-bound MCP 연결로 `initial_public_metrics_schema`, `tighten_public_metrics_grants` 마이그레이션을 적용했습니다.
- 서버 함수는 `SUPABASE_URL`과 `SUPABASE_SERVICE_ROLE_KEY`/`SUPABASE_ANON_KEY`가 있으면 주민등록인구와 수급 지표를 Supabase에서 우선 조회하고, 실패 시 기존 CSV fallback을 사용합니다.
- 기존 정적 데이터를 Supabase에 적재하는 `npm run seed:supabase` 스크립트를 추가했습니다.
- `KOSIS_API_KEY`가 있으면 주민등록인구는 KOSIS `DT_1B04005N` 최신 월자료를 우선 수집해 Supabase에 적재합니다. API 실패 또는 키 미설정 시 기존 CSV fallback을 사용합니다.
- 2026-06-07 기준 KOSIS `2026.05` 월자료를 적재해 강남구 주민등록인구는 `552,962`, source는 `resident_population_kosis`로 전환했습니다.
- 외국인 주민 지표는 화면/정의는 확정했지만, 실제 데이터는 아직 기존 fallback 컬럼을 사용합니다. `OA-13926` 기반 수집으로 교체해야 합니다.
