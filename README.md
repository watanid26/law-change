# LawChange

> 대한민국 중앙·지방 법률·시행령·시행규칙·행정규칙 중 고시의 변경을 자동 수집하고,
> 개정 이력과 조문 단위 신·구 비교, 시행일 관리 기능을 제공하는 웹 앱.

**이 앱은 AI 법률 해석 서비스가 아닙니다.** 공식 법령 데이터와 결정론적 Diff를 정확하고 깔끔하게 보여주는 것이 목적입니다. 사용자는 실제 의사결정 전에 반드시 국가법령정보센터의 공식 원문을 확인해야 하며, 각 문서 상세 화면에 공식 원문 링크를 함께 노출합니다.

---

## 기술 스택

- **프론트·API**: Next.js 14 (App Router, TypeScript, Tailwind CSS, Pretendard)
- **ORM**: Prisma 6
- **DB**: Supabase PostgreSQL (서울 리전 `ap-northeast-2`)
- **데이터 소스**: 법제처 국가법령정보 Open API
  - 법령: `lawSearch.do`, `lawService.do`
  - 행정규칙: `lawSearch.do?target=admrul`, `lawService.do?target=admrul`
- **인증(관리자)**: HMAC-SHA256 서명 쿠키 (`ADMIN_SECRET`) — 다음 라운드에 Supabase Auth로 교체 예정
- **스케줄러**: Vercel Cron
- **테스트**: Vitest

## 데이터 모델

- `LegalDocument` — 문서 정체성. `(sourceType, sourceId)` 로 unique. `LAW`(법령ID) 또는 `ADMIN_RULE`(행정규칙ID).
- `LegalDocumentVersion` — 개정 버전. `(documentId, sourceVersionId)` unique. 공포/발령 번호·일자, 시행일자.
- `LegalArticleVersion` — 조문 단위 스냅샷. SHA-256 해시로 조문 변경 감지.
- `LegalChangeEvent` — 사용자에게 노출되는 개정 사건. `FIRST_ISSUE` | `REVISION` | `REPEAL`.
- `LegalDiff` — 조문 단위 신설/수정/삭제/이동.
- `CollectorJob` — 상세 수집 잡 큐. `(source_type, source_id, job_type)` 활성 상태에서 partial unique.
- `CollectorRun` — 실행 이력.
- `BootstrapProgress` — 전체 카탈로그 초기 스캔 진행 커서.
- `AdminAuditLog` — 관리자 액션 감사 로그.
- 사용자 기능 모델 (`UserProfile`, `UserWatch`, `Memo`, `ChecklistItem`, `Reminder`, `Notification`) — 스키마 준비, 다음 라운드에 UI/API 연결.
## 폴더 구조

```
prisma/
  schema.prisma
  migrations/
src/
  app/
    laws/                # 목록·상세
    admin/               # 관리자 UI (login·collector 대시보드)
    api/
      cron/              # catalog·jobs·integrity Cron 라우트
      admin/actions/     # 관리자 액션 API
  components/            # UI 컴포넌트
  lib/
    prisma.ts
    law-api/             # 법제처 법령 API 클라이언트·정규화·해싱
    admin-rule-api/      # 법제처 행정규칙 API 클라이언트·정규화
    collector/
      queue.ts           # 원자적 claim (FOR UPDATE SKIP LOCKED) · stale 복구
      catalog.ts         # LAW 카탈로그 sync
      admin-rule-catalog.ts
      detail.ts          # 법령 상세 수집기
      admin-rule-detail.ts
      diff.ts            # 조문 단위 diff
      orchestrator.ts    # 배치 오케스트레이션
    queries/             # 대시보드용 조회
    security/
      auth.ts            # 관리자 인증
      audit.ts           # 감사 로그
scripts/
  seed.ts                # 이름 리스트 기반 초기 시딩 (개발용)
```

## 수집 흐름

1. **Catalog Sync** (`/api/cron/catalog`, 하루 2회)
   - 법제처 목록 API를 최근 45일 필터로 스캔
   - 각 문서의 최신 `sourceVersionId`와 DB 저장값 비교
   - 신규·변경만 `CollectorJob` 큐에 넣음
2. **Job Batch** (`/api/cron/jobs`, 30분마다)
   - `FOR UPDATE SKIP LOCKED` 로 N개 원자적 claim
   - stale(15분 이상 RUNNING) 잡 자동 복구, attempt 증가 후 RETRY 또는 DEAD 전이
   - 상세 API 호출 → 조문 정규화 → 이전 버전 대비 diff → `LegalChangeEvent` 생성
3. **Integrity Cron** (`/api/cron/integrity?mode=...`)
   - `mode=maintenance` (매일): stale 복구 + 30일 이상 지난 DONE 잡 정리
   - `mode=weekly`: 문서 200개 샘플로 최신 sourceVersionId 재확인 (catalog 누락 감지)
   - `mode=monthly`: 법제처 전체 sourceId vs DB 대조 (누락·폐지 후보 감지)

### 원자성·안전성 보장

- 잡 claim: PostgreSQL `SELECT ... FOR UPDATE SKIP LOCKED` — 다중 워커에서 겹침 없음.
- 활성 잡 중복: partial unique index `(source_type, source_id, job_type)` WHERE status IN (PENDING/RUNNING/RETRY).
- Stale 복구: 15분 이상 `RUNNING`인 잡은 attempt +1 후 RETRY. `COLLECTOR_MAX_ATTEMPTS` 초과 시 DEAD.
- Idempotency: `LegalDocumentVersion.(documentId, sourceVersionId)` unique.

## 부트스트랩 (전체 카탈로그 초기 스캔)

기본 catalog sync는 최근 45일만 스캔합니다. 전체 법령 + 고시 목록을 최초 1회 스캔하려면 관리자 대시보드에서 부트스트랩 실행:

- `/admin/collector` → **부트스트랩 (LAW · 10페이지)** 버튼
- 한 번에 최대 10페이지(≈1,000건)만 진행 (Vercel 5분 상한)
- `BootstrapProgress` 테이블에 커서 저장 — 반복 실행하면 이어서 진행
- 완료되면 상태 `COMPLETED`
- 초기화하려면 API에 `reset: true` 전달

이후 상세 수집은 `/api/cron/jobs`가 30분마다 자동으로 소진.

## 로컬 실행

```bash
# 1) 의존성
npm ci

# 2) .env.local 준비 (.env.local.example 참고)
cp .env.local.example .env.local
# .env.local 편집

# 3) Prisma
npm run db:generate
npm run db:deploy    # 마이그레이션 (프로덕션·CI에도 동일 사용)

# 4) 개발용 시드 (개인정보보호법 등 3건)
npm run seed

# 5) 개발 서버
npm run dev
```

## 관리자 로그인

`ADMIN_SECRET` 환경변수 값을 그대로 로그인 폼에 입력:

- `/admin/login`
- 성공 시 12h TTL의 서명 쿠키 발급 → `/admin/collector`
- 로그아웃: `/admin/logout`

미들웨어(`src/middleware.ts`)가 `/admin/*` 접근 시 쿠키 없으면 로그인 페이지로 리다이렉트하며,
각 페이지 안에서 `checkAdminSession()`으로 서명까지 재검증합니다 (defense in depth).

## 환경변수

| 변수 | 필수 | 설명 |
|---|---|---|
| `LAW_API_OC` | ✓ | 법제처 OC 인증키 (서버 시크릿 — 브라우저·공개 URL·로그에 절대 노출 금지) |
| `LAW_API_BASE_URL` | | 기본 `https://www.law.go.kr/DRF` |
| `DATABASE_URL` | ✓ | Postgres (풀러, 앱 런타임용) |
| `DIRECT_URL` | ✓ | Postgres direct 5432 (마이그레이션 전용) |
| `NEXT_PUBLIC_SUPABASE_URL` | | Supabase 프로젝트 URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | | Supabase anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | | 다음 라운드용 |
| `CRON_SECRET` | ✓ | Vercel Cron 인증. `Authorization: Bearer $CRON_SECRET` |
| `ADMIN_SECRET` | ✓ | 관리자 로그인 비밀번호. **`CRON_SECRET`과 반드시 다른 값** |
| `COLLECTOR_BATCH_SIZE` | | 잡 배치 크기 (기본 15) |
| `COLLECTOR_STALE_MINUTES` | | stale 판정 임계 분 (기본 15) |
| `COLLECTOR_MAX_ATTEMPTS` | | DEAD 전이 임계 (기본 5) |

## Cron 스케줄

`vercel.json` 참조. UTC 기준 표기, KST는 +9:

- `0 22 * * *` — 07:00 KST catalog sync
- `0 9 * * *` — 18:00 KST catalog sync
- `*/30 * * * *` — 30분마다 job batch
- `0 21 * * *` — 06:00 KST 매일 maintenance
- `0 18 * * 0` — 일요일 03:00 KST weekly integrity
- `0 17 1 * *` — 매월 1일 02:00 KST monthly reconciliation

> Vercel Hobby 티어는 크론 개수·빈도 제한이 있습니다. Pro 업그레이드 또는 GitHub Actions로 이관 고려.

## 테스트·빌드

```bash
npm run typecheck   # tsc --noEmit
npm test            # vitest run
npm run build       # next build
```

Integration/E2E는 다음 라운드에서 fixture 기반으로 추가 예정.

## Vercel 배포

1. Vercel에 GitHub 저장소 연결
2. Environment Variables에 위 표의 모든 필수 값 등록
3. `vercel.json`의 Cron 자동 등록
4. Postgres 마이그레이션은 `npm run db:deploy` 를 Build Command에 포함 or 별도 실행

## 알려진 한계

- **일반 사용자 인증·관심 등록·메모·체크리스트·리마인더·이메일 알림** — 다음 라운드
- **고시 과거 연혁** — 법제처 행정규칙 API가 상세에 이력을 제공하지 않아 신규 개정만 수집. `historyCompleteness` 상태 관리는 다음 라운드
- **부트스트랩 실행 시간** — 전체 스캔은 20+ 실행에 걸쳐 진행. 자동화하려면 GitHub Actions/외부 워커 고려
- **onlyChanged 토글** — 전체 조문 뷰 미구현으로 disabled
- **관리자 인증** — 단일 비밀번호 방식 (환경변수). Supabase Auth admin role로 교체 예정
- **테스트** — 유닛만 있음. Integration/E2E는 다음 라운드
- **Vercel Hobby 크론 제한** — 실제 몇 개가 활성화되는지 티어별 확인 필요

## 라이선스·주의사항

- 데이터 소스: 법제처 국가법령정보 공동활용 (개별 이용 조건 준수)
- 표시된 diff는 편의 기능이며, **공식 판단은 국가법령정보센터 원문 기준**
- AI 요약·법률 해석·자문 제공 없음

- <!-- deploy trigger -->
- 


