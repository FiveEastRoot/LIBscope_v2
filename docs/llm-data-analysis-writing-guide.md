# LIBscope AI 데이터 분석 문구 작성 가이드

## 목적

LIBscope의 AI 작성 영역은 지표를 설명하는 문장이 아니라 도서관 정책 담당자가 다음 판단을 잡을 수 있도록 돕는 짧은 분석 단위여야 한다. 화면용 문구는 빠르게 훑어볼 수 있어야 하며, 보고서용 문구는 같은 판단 흐름을 더 길게 확장해야 한다.

## 참고한 외부 가이드

| 출처 | LIBscope 반영 방식 |
| --- | --- |
| [UK Government Analysis Function, dashboard guidance](https://analysisfunction.civilservice.gov.uk/policy-store/data-visualisation-testing-dashboards-for-design-and-accessibility/) | 한 화면에서 읽히는 정보량 제한, 차트와 텍스트의 역할 분리 |
| [UK Government Analysis Function, chart guidance](https://analysisfunction.civilservice.gov.uk/policy-store/data-visualisation-charts/) | 차트 종류별 해석 한계, 제목·라벨·주석의 역할 분리 |
| [ONS service manual, online reading guidance](https://service-manual.ons.gov.uk/content/writing-for-users/how-people-read-online) | 사용자가 모든 문장을 읽지 않는다는 전제, 앞부분에 결론 배치 |
| [GOV.UK accessibility, text descriptions for data visualisations](https://accessibility.blog.gov.uk/2023/04/13/text-descriptions-for-data-visualisations/) | 수치·단위·기준시점이 필요한 곳과 필요하지 않은 곳 분리 |
| [UN Statistics data storytelling guide](https://unstats.un.org/sdgs/data-storytelling/documents/Practical_Guide_to_Data_Storytelling_in_VNRs_and_SDG_Reporting.pdf) | 지표 나열보다 맥락, 의미, 행동 가능한 판단 흐름 우선 |
| [IDRC policy brief guide](https://idrc-crdi.ca/en/funding/resources-idrc-grantees/how-write-policy-brief) | 정책 독자용 핵심 메시지, 근거, 함의, 유의사항 구조 |
| [California Policy Lab policy brief guide](https://www.capolicylab.org/wp-content/uploads/2023/05/Policy-Brief-Guide.pdf) | 연구 결과를 정책 판단 문장으로 압축하는 구조 |
| [Urban Institute graphics style guide](https://urbaninstitute.github.io/graphics-styleguide/) | 시각화 왜곡 방지, 라벨과 색상 사용의 일관성 |
| [From Data to Viz](https://www.data-to-viz.com/) | 데이터 유형에 맞는 시각화 선택과 비교 불가 지표의 무리한 순위화 금지 |

## 화면용 출력 원칙

1. 첫 문장은 결론 또는 판단으로 시작.
2. 두 번째 단위는 근거와 의미를 분리.
3. 세 번째 단위는 도서관 운영상 함의 또는 확인 필요 조건으로 마무리.
4. 존대 표현 금지, 보고서형 명사형 어미 우선.
5. 민감 지표는 대상 집단을 문제 원인처럼 표현하지 않음.
6. 입력에 없는 순위, 추세, 인과관계 생성 금지.
7. 화면 상단 종합 인사이트는 숫자 직접 표기 금지. 지표 간 관계와 판단 흐름 중심.
8. 섹션별 지표 해석은 필요한 경우 숫자와 단위를 유지하되, 숫자 뒤에 반드시 의미를 붙임.

## 섹션별 AI 패널 구조

### 판단문

- 1문장.
- 70~120자 권장.
- "무엇이 중요하게 보이는가"를 먼저 제시.
- 예: `생활인구와 주민등록인구의 차이가 도서관 서비스 시간대와 안내 접점 분리 검토를 요구함.`

### 근거-의미 항목

- 2~4개.
- 각 항목은 `근거: ... / 의미: ...` 형식 권장.
- 근거에는 지표명, 값, 단위, 기준시점을 가능한 유지.
- 의미에는 도서관 서비스, 접근성, 협력, 공간, 프로그램, 정보 도달성 중 하나 이상의 판단어 포함.

### 유의사항

- 0~2개.
- 비교 기준, 고정 데이터, 결측, 분모 차이를 짧게 명시.
- 긴 설명 대신 칩 형태로 읽히도록 50자 안팎 권장.

## 자치구 종합 인사이트 구조

| 카드 | 역할 | 작성 기준 |
| --- | --- | --- |
| 핵심 판단 | 자치구의 가장 중요한 판단축 | 인구, 사회안전망, 문화, 교육 중 최소 3개 축 연결 |
| 주의 지점 | 오해 또는 과잉해석 위험 | 비교 불가 지표, 결측, 단일 지표 의존 위험 제시 |
| 실행 방향 | 다음 실행 단위 | 도서관 운영, 협력, 공간, 프로그램, 안내 경로 중 하나를 어떻게 바꿀지 제시 |

상단 카드에는 숫자, 단위, 순위 표현을 쓰지 않는다. 숫자는 섹션별 패널이나 보고서 본문에서 사용한다.

## 보고서용 출력 원칙

보고서 본문은 화면 문구보다 길어도 되지만, 문단 안에서 지표를 계속 나열하지 않는다. 각 문단은 다음 순서를 따른다.

1. 근거 지표 묶음
2. 지표 간 관계
3. 도서관 의사결정 함의
4. 확인 필요 조건

## 품질 점검 기준

- 지표값만 바꿔도 어느 자치구에나 붙을 수 있는 문장인지 확인.
- 한 문장에 숫자만 있고 해석어가 없는지 확인.
- "필요", "검토", "가능성"만 있고 근거 지표가 없는지 확인.
- 동일 분모가 아닌 지표를 같은 비율처럼 비교하지 않았는지 확인.
- 장애, 외국인, 수급자 등 민감 지표를 결핍이나 문제 원인으로 표현하지 않았는지 확인.
