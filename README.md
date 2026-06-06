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
- 주 1회 배치로 백엔드(함수) 캐시를 사전 갱신

### 갱신 흐름

1. 사용자가 프런트에서 API 호출
2. 캐시 HIT면 즉시 반환
3. MISS면 실시간 API 시도
4. 실시간 API 실패하면 정적 CSV/JSON fallback
5. 응답을 7일 TTL로 캐싱
6. GitHub Actions가 주간으로 사전 `forceRefresh` 수행

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

## 배포 설정

- Netlify Functions 포함 파일은 `netlify.toml`에서 `*.csv`, `*.json`을 포함하도록 되어 있습니다.
- Netlify 대시보드에서 환경변수로 다음을 지정하세요.
  - `SEOUL_API_KEY`
  - `KAKAO_REST_API_KEY`
  - `INSIGHT_CACHE_ADMIN_TOKEN` (원하면 `type=cache` API 보호용)
