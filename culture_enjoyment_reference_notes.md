# 문화향유 인사이트 참고 기준

## 1. 자료 사용 원칙

- `2023 서울문화지표 조사연구.pdf`는 자치구별 문화자원·문화정책 정량지표의 정적 fallback 소스로 사용한다.
- `(보고서_1.요약) 2024 서울시민 문화향유 실태조사.pdf`는 서울시민 전체·문화관심집단·장애인 집단별 문화향유 행태를 해석하는 기준값으로 사용한다.
- 2024 문화향유 실태조사 값은 자치구 직접 관측값이 아니므로 자치구 점수 계산에는 직접 넣지 않는다.
- 생활권 단위 또는 서울시 전체값은 `reference` 또는 `note`로만 표시한다.
- API 기반 최신값과 보고서 기준연도 값은 혼합하지 않고, 보고서 값은 정적 fallback 및 해석 기준선으로 사용한다.

## 2. 2023 서울문화지표에서 1차 추출한 자치구 직접값

다음 표는 `district_culture_enjoyment_metrics.csv`에 자치구 25개 행으로 반영했다.

- `표 자치구별 공공 문화기반시설 유형별 시설 수`  
  본문 p.33 / PDF p.55
- `표 자치구별 공공도서관 수`  
  본문 p.35 / PDF p.57
- `표 자치구별 공공 공연장 수`  
  본문 p.38 / PDF p.60
- `표 자치구별 공공 공연공간 수`  
  본문 p.40 / PDF p.62
- `표 자치구별 공공 박물관·미술관 수`  
  본문 p.43 / PDF p.65
- `표 자치구별 지역문화 복지시설·문화보급 전수시설 수`  
  본문 p.46 / PDF p.68
- `표 생활문화센터 현황`  
  본문 p.52 / PDF p.74, 시설 단위 표를 자치구별 개수와 시설명 목록으로 집계
- `표 자치구별 문화관련 장애물 없는 생활환경 인증시설 수`  
  본문 p.309 / PDF p.331
- `표 2022-2023년 문화정책 조례 수 및 제·개정 건수`  
  본문 p.318 / PDF p.340

주의: `barrier_free_indoor_culture_spaces`는 사용자가 요청한 명칭에 맞춰 둔 컬럼이지만, 원표는 “문화관련 장애물 없는 생활환경 인증시설” 전체다. 실내 문화공간 전용값인지 수동 검수가 필요하다.

## 3. 2024 서울시민 문화향유 실태조사 조사개요

- 조사 목적: 서울시민의 문화향유 실태 파악 및 문화정책 기초자료 구축.
- 조사 집단: 일반시민, 문화관심집단, 장애인.
- 조사 항목: 여가활동, 오프라인 문화예술 관람, 디지털 콘텐츠 소비, 문화예술 활동 참여, 거주지역 문화예술활동, 문화예술 활동 경험과 인식 등.
- 척도: 만족도·인식 문항은 7점 척도 문항이 포함된다.
- 가중치: 일반시민 조사결과는 가중치 적용 여부를 확인해야 하며, 문화관심집단·장애인 결과는 표본 특성상 서울시 전체 대표값으로 무리하게 해석하지 않는다.
- 자치구 직접값 사용 가능 여부: 요약 보고서에서 확인한 주요 값은 자치구 직접값이 아니라 서울시 전체, 집단별, 생활권별 값이므로 `district_culture_enjoyment_metrics.csv`에는 넣지 않는다.

## 4. 도서관의 문화정보 유통 역할

요약 보고서의 핵심 문항은 `E4. 도서관에서의 지역사회 문화예술정보 경험`이다.

정리 대상 표:

- `표 2-60. 도서관 이용을 통한 지역사회 문화예술 정보획득 경험 여부`
- `표 2-61. 도서관 이용을 통한 지역사회 문화예술 정보획득 경험 여부_일반시민 시계열`
- `표 2-62. 도서관 이용을 통한 지역사회 문화예술 정보획득 경험 여부_문화관심집단 시계열`

활용 방식:

- 도서관을 `문화정보 유통 채널`로 해석하는 근거로 사용한다.
- 지역축제 및 행사 정보, 문화예술 관람 프로그램 정보, 문화예술교육 참여 정보, 지역 모임·동아리 활동 정보, 정보 접촉 경험 없음 비율을 기준값으로 정리한다.
- 단, 자치구 직접 점수 계산에는 사용하지 않는다.

## 5. 실제 참여 전환

정리 대상 표:

- `표 2-63. 정보를 통한 실제 참여 경험 여부`
- `표 2-64. 정보를 통한 실제 참여 경험 여부_일반시민 시계열`
- `표 2-65. 정보를 통한 실제 참여 경험 여부_문화관심집단 시계열`

요약 보고서 PDF p.80에서 확인한 값:

- 일반시민 2024년: 지역축제 및 행사 31.4%, 문화예술 관람 프로그램 19.6%, 문화예술교육 참여 13.9%, 지역 모임·동아리 활동 10.9%, 참여한 경험 없음 38.6%.
- 문화관심집단 2024년: 지역축제 및 행사 36.6%, 문화예술 관람 프로그램 30.8%, 문화예술교육 참여 21.1%, 지역 모임·동아리 활동 8.4%, 참여한 경험 없음 31.2%.

해석:

- 도서관에서 접한 문화예술 정보는 실제 지역 문화예술 활동 참여로 일부 전환된다.
- `libraryHub` 또는 `cultureEnjoyment.insight`에서 “도서관은 단순 열람공간을 넘어 지역 문화참여의 진입점 역할을 한다”는 문장 근거로 사용할 수 있다.

## 6. 거주지 주변 소규모 문화행사

정리 대상 표:

- `표 2-66. 거주지 주변 소규모 문화행사 참여 경험`
- `표 2-67. 거주지 주변 소규모 문화행사 참여 경험_일반시민 시계열`
- `표 2-68. 거주지 주변 소규모 문화행사 참여 경험_문화관심집단 시계열`

요약 보고서 PDF p.82에서 확인한 값:

- 일반시민 전체: 참여 경험 18.1%, 향후 참여 의향 49.9%.
- 문화관심집단 전체: 참여 경험 30.0%, 향후 참여 의향 76.0%.
- 장애인 전체: 참여 경험 2.4%, 향후 참여 의향 35.2%.

해석:

- 거주지 주변의 소규모 문화행사는 실제 경험률보다 잠재 의향이 크다.
- 장애인 집단은 참여 경험이 낮지만 참여 의향은 더 높으므로, 접근성·정보 접근·동행 지원 지표와 함께 해석하는 것이 적절하다.
- 자치구 직접값이 아니므로 자치구별 점수에는 넣지 않는다.

## 7. 문화향유 기준선

정리 대상:

- `최근 1년간 경험한 오프라인 활동`
- `연간 이용 총 횟수`
- `연간 총 비용`
- `오프라인 문화예술 관람활동 전반적 만족도`
- `문화예술 활동 경험 전반적 만족도`
- `문화예술이 본인의 삶에서의 중요도`
- `현재 느끼는 행복 정도`
- `사회적 고립감`

활용 방식:

- 자치구 문화역량 점수에는 직접 넣지 않는다.
- 대시보드 설명문에서 “서울시 기준선 대비 해석” 또는 “문화향유 맥락 설명”으로 사용한다.
- 향후 원표 수치를 더 정밀 추출한 뒤 `culture_enjoyment_reference` JSON 또는 Markdown 블록으로 관리하는 것이 좋다.

## 8. Supabase 반영 가능 여부

가능하다. 현재 Supabase 스키마는 별도 DDL 없이 반영 가능하다.

권장 저장 방식:

- `source_catalog`
  - `source_key`: `culture_enjoyment_2023_report`
  - `provider`: `seoul_culture_foundation`
  - `dataset_id`: `2023_seoul_culture_indicators`
  - `service_name`: `2023 서울문화지표 조사연구`
  - `source_url`: 로컬 PDF 또는 공식 배포 URL 확인 후 입력
  - `refresh_cycle`: `static_report`
  - `status`: `fallback`
  - `notes`: `자치구별 문화자원·문화정책 정적 fallback`
- `district_metrics`
  - `metric_key`: `culture_enjoyment_profile`
  - `gu`: 자치구명
  - `population_mode`: null
  - `metric_value`: 대표값이 필요하면 `public_culture_facilities` 또는 별도 산식 점수. 현재는 null 권장.
  - `metric_json`: CSV 한 행 전체를 JSON으로 저장
  - `reference_date`: `2023-12-31` 또는 표별 기준연도가 섞이므로 `2023-01-01` + notes 보완. 1차 적재는 `2023-12-31` 권장.
  - `source_key`: `culture_enjoyment_2023_report`

권장 API 매핑:

- `cultureEnjoyment.infrastructure.publicCultureFacilities`
  - `public_culture_facilities`
  - `public_culture_facilities_per100k`
- `cultureEnjoyment.libraryHub`
  - `public_libraries_total`
  - `public_libraries_per100k`
  - `public_libraries`
  - `small_libraries_total`
- `cultureEnjoyment.performanceAccess`
  - `public_performance_halls`
  - `public_performance_spaces`
- `cultureEnjoyment.exhibitionAccess`
  - `public_museums_galleries`
  - `public_museums_total`
  - `public_galleries_total`
- `cultureEnjoyment.localCultureBase`
  - `local_culture_welfare_facilities`
  - `life_culture_centers`
  - `life_culture_center_names`
- `cultureEnjoyment.accessibility`
  - `barrier_free_indoor_culture_spaces`
  - `barrier_free_indoor_culture_spaces_per100k`
- `cultureEnjoyment.policy`
  - `culture_policy_ordinance_count`
  - `culture_policy_revision_count`

반영 전 검수 필요:

- 문화예산 관련 컬럼은 원표가 후반부에 있으나 아직 CSV에 넣지 않았다.
- 예술활동증명 예술인, 문화예술 사업체, 축제, 티켓 판매는 후속 추출 대상이다.
- 2024 문화향유 실태조사 값은 자치구 직접값이 아니므로 Supabase에는 `district_metrics`보다 별도 reference 파일 또는 `source_catalog.notes`/문서형 JSON으로 관리하는 편이 안전하다.
