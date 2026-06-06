# API Source Mapping

작성일: 2026-06-06  
목적: 현재 LIBscope 대시보드에서 사용하는 내부 CSV/JSON 기반 지표를 API 또는 주기 갱신 백엔드 데이터로 전환하기 위한 검토 문서입니다.

## 전환 원칙

- 프런트엔드는 계속 `/api/insight-api`만 호출합니다.
- 백엔드는 가능한 경우 원천 API에서 직접 조회하거나, 주 1회 배치로 웹DB에 저장한 값을 반환합니다.
- API가 불안정하거나 통계성 데이터라 실시간성이 낮은 경우, 주 1회 갱신 테이블로 전환합니다.
- 현재 CSV/JSON은 전환 완료 전까지 seed/fallback 용도로만 유지합니다.
- 인구 지표는 주민등록인구를 기본값으로 하고 생활인구를 병행 제공합니다.
- 화면에서는 인구 시각화 영역 우상단 전환 버튼으로 주민등록인구/생활인구를 즉시 전환합니다.
- 두 인구 데이터는 화면 진입 시 사전 로드하고, 전환 시에는 이미 받은 데이터 중 표시 대상만 바꿉니다.
- 수급률 산식의 분모는 주민등록인구로 고정합니다.
- 외국인 지표는 `외국인 주민` 기준으로 정의합니다.

## 저장소 후보

1. Supabase Postgres
   - 장점: SQL 집계, 갱신 이력, 관리자 검토, 지표별 테이블 관리가 쉬움
   - 추천도: 높음
   - 결정: 기본 웹DB로 채택. 무료 플랜 한도 안에서 주 1회 배치 갱신과 읽기 중심 조회 구조로 사용

2. Netlify Blobs
   - 장점: 설정이 가볍고 JSON 저장에 적합
   - 한계: 복잡한 필터/집계/검토 워크플로우에는 Postgres보다 불편
   - 추천도: 보조/대체 후보

현재 목표가 “통계값 검토 후 전환”이므로, Supabase Postgres를 기준 저장소로 설계합니다.

## 현재 지표별 API 매칭

| 화면 영역 | 현재 값/필드 | 현재 내부 소스 | 후보 API/데이터셋 | 갱신 방식 | 적합성 | 메모 |
|---|---|---|---|---|---|---|
| 자치구 인구 | 성별/연령/총인구 | `district_age_gender_population.csv` fallback | 기본: KOSIS `DT_1B04005N` 행정구역(읍면동)별/5세별 주민등록인구; 보조 후보: 서울 열린데이터 `OA-877`, `OA-12240`; 병행: `SPOP_LOCAL_RESD_DONG`, `OA-14991`, `OA-14992` | 월 1회 웹DB | 높음 | 주민등록인구를 기본 표시, 생활인구를 전환 버튼으로 병행 표시 |
| 도서관 반경 인구 | 행정동별 성별/연령/총인구 | `2_population_and_senior.csv`, `3_gender.csv` fallback | 기본: KOSIS `DT_1B04005N`; 병행: `SPOP_LOCAL_RESD_DONG`, `OA-14991`, `OA-14992` | 월 1회 웹DB | 높음 | 반경 2km 행정동 집계 결과를 주민등록인구/생활인구 모두 사전 로드 |
| 수급률 | 자치구 수급률, 서울 평균 | `district_data_combined.csv` | `OA-401` 서울시 국민기초생활보장 수급자(2020 이후) 통계, `OA-22227` 서울시 국민기초생활 수급자 동별 현황 | 주 1회 또는 월 1회 웹DB | 높음 | 수급자 수 / 주민등록인구로 산식 고정 |
| 도서관 반경 수급자 | 행정동 수급자수 평균, 서울 평균 | `5_number_of_recipients.csv` | `OA-22227` 서울시 국민기초생활 수급자 동별 현황 | 주 1회 웹DB | 높음 | 현재 구조와 가장 잘 맞는 후보. 행정동 단위가 핵심 |
| 다문화/외국인 국적 | 중국, 대만, 일본, 베트남, 필리핀, 미국 등 | `district_data_combined.csv` | `OA-13926` 외국인주민(국적별), 보조 후보: `OA-12282`, `OA-12274` | 월 1회 또는 분기 1회 웹DB | 높음 | 정책 지표 기준은 외국인 주민으로 고정 |
| 장애 유형 | 지체, 청각, 시각, 지적 등 | `district_data_combined.csv` | `OA-12384` 장애인 현황(장애유형별/동별), `OA-12357` 장애인 현황(장애유형별), `OA-21963` 장애유형별/연령별 | 월 1회 또는 연 1회 웹DB | 높음 | 현재 구별 장애유형 값과 가장 가까운 후보는 `OA-12384` |
| 가구 유형 | 1인가구, 2인가구, 3인 이상, 5인 이상, 평균 가구원수 | `district_data_combined.csv` | `OA-13679` 1인가구(연령별), `OA-12414` 가구원수별 가구 통계, `OA-12363` 가구추계(가구원수별) | 월 1회 또는 연 1회 웹DB | 중간 | “현재 자치구 단면”인지 “추계”인지 정책적으로 선택 필요 |
| 공공도서관 수 | 자치구 공공도서관 개수 | API 실패 시 `library_dong_mapping.json` | `SeoulPublicLibraryInfo`, 데이터셋 `OA-15480` 서울시 공공도서관 현황정보 | 직접 API 또는 주 1회 웹DB | 높음 | 이미 API 사용 중. 웹DB에 목록/좌표 저장하면 매핑 JSON 의존 축소 가능 |
| 도서관 기본정보 | 도서관명, 구, 주소, 좌표 | `library_dong_mapping.json` | `SeoulPublicLibraryInfo`, 필요 시 좌표 보정 API | 주 1회 웹DB + 수동 보정 컬럼 | 중간 | 공공도서관 API 좌표 품질 확인 필요. 현재 수동 좌표가 더 정확할 수 있음 |
| 반경 2km 행정동 | 행정동 좌표, 거리 계산 | `dong_coordinates.json` | 후보: 서울 행정동 경계/좌표 공공데이터, SGIS 경계 API | 저빈도 갱신 | 중간 | 반경 판정은 좌표보다 경계 geometry 기반이 더 정확함. 1차 전환에서는 현 좌표 seed 유지 가능 |
| 학교 수 | 초/중/고 수 | `district_data_combined.csv` fallback | `neisSchoolInfo` 현재 사용 중, 서울시 학교 기본정보 후보 `OA-20561` 등 | 직접 API 또는 주 1회 웹DB | 높음 | 이미 API 사용 중. 자치구별 집계 결과만 웹DB 캐시 가능 |
| 대학 수 | 대학교/전문대 수 | 코드 하드코딩 fallback | `SebcCollegeInfoKor`, 통계 후보 `OA-647` 대학교 통계, `OA-645` 전문대학 통계 | 주 1회 또는 월 1회 웹DB | 높음 | 현재 API 사용 중이나 fallback 하드코딩 제거 필요 |
| 문화행사 수/목록 | 당월 행사 수, 도서관 주변 행사 | 없음, 실패 시 빈 값 | `culturalEventInfo`, 데이터셋 `OA-15486` 서울시 문화행사 정보 | 직접 API + 짧은 캐시 | 높음 | 실시간성이 있으므로 웹DB보다 API 직접+캐시 적합 |
| 주변 공공기관 | 도서관 반경 PO3 장소 | 없음, 실패 시 빈 값 | Kakao Local API `category_group_code=PO3` | 직접 API + 짧은 캐시 | 높음 | 공공기관 카테고리 결과 품질 검토 필요 |
| 문화시설 수 | 공연장, 박물관/미술관, 복지시설/전수시설 | `district_data_combined.csv` | 공연장 인허가 구별 데이터, `OA-15272` 박물관미술관 정보, 사회복지시설 목록 `OA-20389`~`OA-20417`, 전수시설 통계 `OA-596` | 주 1회 웹DB | 중간 | 여러 데이터셋을 합쳐야 함. 구별 인허가 데이터는 25개 자치구별 서비스로 나뉠 수 있음 |

## 우선순위

### 1차 전환: API 후보가 명확하고 현재 구조와 잘 맞음

- 공공도서관 목록/수: `SeoulPublicLibraryInfo`
- 학교 수: `neisSchoolInfo` 또는 서울시 학교 기본정보
- 대학 수: `SebcCollegeInfoKor`
- 문화행사: `culturalEventInfo`
- 도서관 주변 공공기관: Kakao Local API
- 수급자 동별 현황: `OA-22227`

### 2차 전환: 통계 정의 검토 후 전환

- 등록외국인/다문화 국적
- 장애 유형
- 1인가구/가구원수
- 생활인구 병행 표시
- 문화시설 수

## 제외 및 향후 재설계

- 문화 활동 및 운영 관심도 지표 4종(강좌 비율, 참가자 비율, 운영 관심도 점수, 이용 관심도 점수)은 현재 전환 범위에서 제외합니다.
- 향후 도서관 정책 판단에 더 적합한 문화/운영 지표를 새로 정의한 뒤 API 매칭과 웹DB 적재 대상을 다시 설계합니다.

## 웹DB 스키마 초안

### `source_catalog`

| 컬럼 | 설명 |
|---|---|
| `source_key` | 내부 소스 식별자 |
| `provider` | `seoul_open_data`, `kakao`, `kosis`, `manual_seed` 등 |
| `dataset_id` | 예: `OA-22227` |
| `service_name` | 예: `SPOP_LOCAL_RESD_DONG` |
| `source_url` | 공식 데이터셋 URL |
| `refresh_cycle` | `daily`, `weekly`, `monthly`, `quarterly`, `yearly` |
| `status` | `confirmed`, `candidate`, `needs_review`, `fallback_only` |
| `notes` | 산식/주의사항 |

### `district_metrics`

| 컬럼 | 설명 |
|---|---|
| `gu` | 자치구 |
| `metric_key` | 예: `recipient_rate`, `one_person_households` |
| `metric_value` | 숫자값 |
| `metric_json` | 복합 지표 JSON |
| `reference_date` | 원천 기준일 |
| `fetched_at` | 수집 시각 |
| `source_key` | `source_catalog` 참조 |

### `dong_metrics`

| 컬럼 | 설명 |
|---|---|
| `gu` | 자치구 |
| `dong` | 행정동 |
| `metric_key` | 예: `welfare_recipients`, `living_population_age_gender` |
| `metric_value` | 숫자값 |
| `metric_json` | 연령/성별 등 복합값 |
| `reference_date` | 원천 기준일 |
| `fetched_at` | 수집 시각 |
| `source_key` | `source_catalog` 참조 |

### `library_profiles`

| 컬럼 | 설명 |
|---|---|
| `library_id` | 내부 ID |
| `name` | 도서관명 |
| `gu` | 자치구 |
| `address` | 주소 |
| `lat` / `lng` | 좌표 |
| `source_key` | 공공도서관 API 또는 수동 보정 |
| `updated_at` | 갱신 시각 |

## 확정된 설계 결정

1. 인구 기준은 주민등록인구 기본, 생활인구 병행으로 확정합니다.
2. 인구 시각화 영역 우상단에 주민등록인구/생활인구 전환 버튼을 둡니다.
3. 두 인구 데이터는 사전 로드하고, 버튼 전환 시 표시 데이터만 바꿉니다.
4. 수급률 산식의 분모는 주민등록인구로 확정합니다.
5. 외국인 지표는 외국인 주민 기준으로 확정합니다.
6. 웹DB는 Supabase Postgres 기준으로 설계하되 무료 플랜 한도 안에서 운영합니다.

## 확인에 사용한 공식/준공식 출처

- 서울 열린데이터광장 OpenAPI 이용 안내: https://data.seoul.go.kr/together/guide/useGuide.do
- 서울 열린데이터광장 개방현황 목록 API `SearchCatalogService`: https://data.seoul.go.kr/dataList/OA-1263/A/1/datasetView.do
- 서울 데이터 허브 소개 및 분야 안내: https://data.seoul.go.kr/bsp/wgs/index.do?tab=portal
- KOSIS OpenAPI 안내: https://edu.kosis.kr/serviceInfo/openAPIGuide.do
- KOSIS 통계자료 API 개발가이드: https://kosis.kr/openapi/devGuide/devGuide_0201List.do
