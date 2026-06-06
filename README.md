# LIBSCOPV2

서울시 자치구/도서관 인사이트 대시보드입니다.  
Netlify Function(`/api/insight-api`)을 중심으로 동작하며, 가능한 데이터는 API에서 직접 가져오고, 가져올 수 없는 데이터는 정적 CSV/JSON으로 대체합니다.

## API 우선 + 주기적 갱신 전략

현재 구성은 다음을 목표로 합니다.

- 프런트는 항상 `/api/insight-api`만 사용
- API 호출 결과는 캐시로 보관
  - `type=district` / `type=library` 요청 시 동일 쿼리에 대한 캐시 히트 시 즉시 반환
  - 캐시는 메모리 + `/tmp/insight-api-cache.json` 영속파일로 관리
  - TTL: 7일
- Netlify가 제공하지 않는 데이터는 정적 데이터로 즉시 fallback
- `SUPABASE_URL`과 서버 키가 있으면 주민등록인구/수급 지표는 Supabase Postgres를 우선 조회
- 주 1회 배치로 백엔드(함수) 캐시를 사전 갱신

### 갱신 흐름

1. 사용자가 프런트에서 API 호출
2. 캐시 HIT면 즉시 반환
3. MISS면 실시간 API 시도
4. Supabase에 주간 적재된 주민등록인구/수급 지표가 있으면 우선 사용
5. 실시간 API나 Supabase 조회가 실패하면 정적 CSV/JSON fallback
6. 응답을 7일 TTL로 캐싱
7. GitHub Actions가 주간으로 사전 `forceRefresh` 수행

## 사용 가능한 API 파라미터

기본:
- `type=district, gu=...`  
- `type=library, gu=..., library=...`

캐시 제어:
- `forceRefresh=1`: 캐시 무시 후 재생성
- `includeCacheMeta=1`: `_cache` 메타데이터 포함
- `cacheVersion=...`: 캐시 키 버전 분리 시 사용

특수:
- `type=cache&action=clear`: 캐시 전체 삭제
- `type=health`: 함수 상태와 필수 데이터 파일 존재 여부 확인

## 함수 정적 데이터 번들

Netlify Function 배포에서 CSV/JSON 파일 누락이 발생하지 않도록 필수 백업 데이터는 함수 번들 내부에도 포함합니다.

- 원본 데이터: 프로젝트 루트의 CSV/JSON
- 함수용 복사본: `functions/_data`
- 번들 내장 파일: `functions/_shared/static-data.cjs`

원본 CSV/JSON을 수정한 뒤에는 아래 명령으로 함수용 데이터를 다시 생성하세요.

```bash
npm run build:function-data
```

## 500 에러가 날 때 가장 먼저 확인할 포인트

- 필수 파라미터 누락
  - `type=district`는 `gu` 필요
  - `type=library`는 `gu`, `library` 모두 필요
- 라이브러리명 불일치
  - `library` 값이 `library_dong_mapping.json`의 이름과 다르면 404로 떨어질 수 있음
- Netlify Function 파일 동봉 파일 누락
  - `netlify.toml`의 `[functions].included_files`에서 정적 파일이 빠지면 fallback 데이터만 처리되거나 해당 로직이 실패 가능
- 라이브 API 타임아웃/한시적 장애
  - 이 경우에는 정적 데이터 fallback으로 처리되므로, 순수 500는 보통 예외 처리 누락이나 파일 탐색 실패 경로에서 나타남

실운영에서는 Netlify Function 로그에서 응답 코드 500 직전 에러 스택을 우선 확인하세요.

## 주간 갱신(운영) 실행

- 로컬:  
  `npm run refresh:insight-cache`
- 구간 제한:
  - `npm run refresh:insight-cache:district`
  - `npm run refresh:insight-cache:library`
- GitHub Actions 워크플로우:
  - `.github/workflows/refresh-insight-cache.yml`
  - 스케줄: 매주 일요일 03:00 KST (현재는 `0 18 * * 6` UTC)
  - 필요 Secrets:
    - `INSIGHT_API_BASE_URL` (예: `https://your-site.netlify.app/api/insight-api`)

## Supabase seed

Supabase 스키마를 만든 뒤 기존 정적 데이터를 DB에 적재하려면 서버 전용 환경변수를 설정하고 실행합니다.

```bash
npm run seed:supabase
```

필요 환경변수:
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `KOSIS_API_KEY` (있으면 주민등록인구를 KOSIS 최신 월자료로 적재, 없으면 기존 CSV fallback)

현재 seed 대상:
- `library_profiles`: 도서관 215개 기본 프로필
- `district_metrics`: 자치구 주민등록인구, 수급률
- `dong_metrics`: 행정동 주민등록인구, 수급자 수
- `refresh_runs`: seed 실행 이력

## 배포 설정

- Netlify Function은 `/api/insight-api` 경로로 직접 매핑됩니다.
- 필수 백업 데이터는 `functions/_shared/static-data.cjs`에 내장되어 배포 파일 누락 위험을 줄입니다.
- Netlify 대시보드에서 환경변수로 다음을 지정하세요.
  - `SEOUL_API_KEY`
  - `KAKAO_REST_API_KEY`
  - `INSIGHT_CACHE_ADMIN_TOKEN` (원하면 `type=cache` API 보호용)
  - `SUPABASE_URL`
  - `SUPABASE_SERVICE_ROLE_KEY` (서버 함수/seed 전용, 클라이언트 노출 금지)

## Notion 문서 기록

프로젝트 의사결정, 개발 로그, API 매핑 문서는 Notion 프로젝트 페이지 아래에 남깁니다. 로컬 `.env`에만 아래 값을 저장하세요.

- `NOTION_TOKEN`
- `NOTION_PROJECT_PAGE_ID`

마크다운 파일을 Notion 하위 페이지로 올릴 때:

```bash
npm run notion:create -- --title "데이터 API 전환 매핑" --file docs/api-source-mapping.md
```

`NOTION_TOKEN`은 서버/클라이언트 런타임에 필요하지 않은 문서화 자동화용 토큰이므로 Netlify 환경변수에는 넣지 않아도 됩니다.
