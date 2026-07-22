# Create Admin App PRD

- 상태: 생성 경험 및 기반 범위 확정
- 최종 수정: 2026-07-22
- 범위: 공개 생성 CLI, 공통 기반과 첫 참조 제품 방향

## 1. 제품 정의

이 스캐폴드는 공동창업자에 가까운 5인 미만의 신뢰 팀이 바이브코딩으로 한 회사의 내부 매니징 시스템을 개발하고 운영하도록 돕는다. 완성된 범용 백오피스를 제공하는 제품이 아니다. 안전하고 작은 공통 기반만 제공하고, 각 회사에 필요한 실제 업무 흐름은 명시적인 코드로 개발한다.

공개 제품명은 Create Admin App이다. npm 패키지 `@finetension/create-admin-app`을 `pnpm create @finetension/admin-app`으로 실행해 독립 프로젝트를 생성한다. 공개 모노레포 루트는 기준 템플릿과 CI 검증 앱이고, 생성 CLI는 같은 저장소의 workspace package로 유지한다. 실제 Cloudflare 운영 배포는 생성한 private 저장소에서 실행한다.

첫 번째 완성형 참조 제품은 Beestory 매출 관리 시스템이다. 이 제품을 끝까지 구현해 스캐폴드를 검증한 뒤 반복되는 부분만 추출한다.

## 2. 대상 팀과 운영 모델

- 사실상 동등한 신뢰와 책임을 가진 5인 미만의 내부 팀원
- 개발자와 비개발자 모두 로컬 코딩 에이전트로 기능을 추가하고 오류를 수정
- 저장소 하나가 회사 하나, 앱 하나, Cloudflare 배포 하나, 기준 D1 하나를 의미
- 다른 회사나 격리가 필요한 운영 단위는 새 프로젝트로 생성
- 모든 배포 변경은 Git에서 검토 가능하고 CI/CD로 재현 가능

## 3. 목표

1. 비개발자와 AI 에이전트가 이해하고 수정하기 쉬운 코드베이스를 만든다.
2. 업무별 코드를 명시적으로 유지할 수 있도록 공통 코어를 작게 유지한다.
3. 첫 배포 이후 하나의 운영 데이터만 기준 데이터로 사용한다.
4. 로컬 운영 변경을 방지하고 모든 운영 작업을 보호된 GitHub Actions에서 재현한다.
5. FSD 경계가 강제되는 일관된 HeroUI 웹 기반을 제공한다.
6. 프레임워크 추상화나 예제를 먼저 만들지 않고 실제 제품 하나를 완성한다.
7. 비개발자도 한 번의 대화형 명령으로 로컬 개발과 선택형 원격 저장소·배포 준비를 마친다.

## 4. 하지 않는 것

- 멀티테넌시, 워크스페이스 전환, 조직 계층, `workspace_id`
- 역할, 세부 권한, 초대, 회원가입, 비밀번호, 고객·판매자용 외부 포털
- 런타임 노코드 빌더, 범용 `records` 테이블, 커스텀 필드 엔진, 동적 모듈 레지스트리
- 스마트스토어·아이디어스·자사몰에 이미 있는 판매자센터 기능 복제
- Content, Marketing, Operations, Files, 댓글, 태그, 알림, import/export를 필수 제품 모듈로 제공
- 기반 단계의 스케줄러
- 운영 배포 후 별도의 장기 개발 DB 유지
- create CLI가 Cloudflare 또는 GitHub 자격 증명을 저장소 파일에 평문으로 기록하는 동작

## 5. 공통 기반 요구사항

### 5.1 인증과 접근

- 배포된 호스트는 Cloudflare Access로 보호한다.
- 기본 로그인 방식은 Cloudflare Access One-time PIN이며 별도 OAuth 앱을 요구하지 않는다.
- 빌드·배포 단계의 `allowedEmails`가 인가 경계이며 Worker에서도 다시 검사한다.
- 허용된 모든 이메일은 앱 안에서 같은 기능을 사용할 수 있다.
- `users` 테이블은 식별 정보만 저장하고, 사용자 ID와 이메일은 audit의 행위자 정보로만 활용한다.
- 개발 환경에서는 `allowedEmails` 안의 이메일만 가장할 수 있고 개발용 역할 헤더는 두지 않는다.

완료 조건:

- 허용되지 않은 운영 사용자는 `403`을 받는다.
- 허용된 사용자는 첫 API 접근 시 멱등하게 생성된다.
- 공개 계약, UI, 라우트 가드에 역할이나 권한 개념이 없다.

### 5.2 앱 공통 코어

기반에는 다음만 포함한다.

- 인증된 앱 셸과 최소 홈 화면
- 공통 오류 처리와 API 요청 규약
- 명시적인 D1 migration
- audit에 사용할 행위자 식별 정보
- HeroUI 어댑터·공개 API와 FSD lint 경계
- 빌드, 테스트, 백업, 배포, 상태 조회, smoke check 도구

업무 테이블·API·화면은 실제 제품 요구가 생길 때 추가한다. 선택형 예제 모듈을 미리 생성하지 않는다.

### 5.3 웹 구조와 디자인 시스템

- `src/web`은 `finetension/lorden`에서 참고한 Feature-Sliced Design 경계를 따른다.
- 제품 계층은 `src/web/shared/ui`를 통해서만 UI 컴포넌트를 사용한다.
- `shared/ui`는 이후 기능에서 HeroUI를 직접 import하지 않도록 HeroUI 전체 컴포넌트 표면을 미리 래핑한다.
- HeroUI의 합성 구조, variant, 접근성, 기본 시각 언어를 디자인 시스템의 기준으로 삼는다.
- 제품 코드의 Tailwind 클래스는 레이아웃과 반응형 배치에만 사용한다. 별도의 테마나 시각 variant를 만들지 않는다.

### 5.4 데이터베이스 생명주기

첫 배포 전:

- `pnpm dev`는 persistent local D1을 사용한다.
- 로컬 migration, reset, seed를 허용한다.
- PR은 임시 local D1에 모든 migration을 적용한다.
- Git 추적 `infra/lifecycle.json`의 production은 `predeploy`다.

Worker와 D1의 첫 배포 후:

- `pnpm dev`는 기준 원격 D1을 binding한다.
- 원격 모드 시작 시 persistent local D1 상태를 제거한다.
- 개발 서버는 원격 D1에 migration이나 seed를 자동 실행하지 않는다.
- 운영 migration은 보호된 CI/CD에서만 실행한다.
- 테스트용 임시 local D1만 예외로 둔다.
- 성공한 첫 production workflow가 lifecycle을 `deployed`로 자동 커밋한다.

CLI는 복구를 위해 명시적인 local/remote override를 제공하지만 기본값은 Git 추적 lifecycle로 결정한다. 실제 리소스 존재 여부와 식별자는 Cloudflare가 기준이며 read-only 상태 조회로 확인한다. 리소스 ID, Access AUD, 검증 결과를 로컬 배포 state로 저장하지 않는다. lifecycle이 없거나 잘못되면 로컬 DB로 조용히 fallback하지 않는다.

### 5.5 배포와 운영

TypeScript CLI가 자동화 구현의 기준이고 GitHub Actions가 운영 작업의 유일한 사용자 인터페이스이자 정책·자격 증명 경계다. CLI 구현은 제거하지 않지만 팀원이 로컬에서 운영 작업을 실행하는 용도로 사용하지 않는다.

운영 D1 backup과 Worker log에는 회사 데이터가 포함될 수 있으므로 Deploy, Operations, Maintenance workflow는 private GitHub 저장소에서만 실행한다. 공개 기준 모노레포에서는 CI, generator 검증, npm package release만 실행한다.

- CI: 설치, 임시 D1 전체 migration, lint, type check, test, build
- Deploy: 기반 단계에서는 수동 보호 워크플로 사용. 기존 D1 백업, pending migration, Worker 배포, Access 보호 smoke check
- Operations: 수동 read-only 상태 조회, D1 export, 제한시간 Worker 로그 수집
- Maintenance: production Environment에서만 실행하는 D1 복구와 인프라 철거. 정확한 서비스명 확인, 실행 전 D1 백업, `main` 제한, 단일 production 동시성 잠금을 강제
- Package release: 보호된 `npm` Environment에서 버전 선택, 전체 검증, release commit·tag, npm publish와 GitHub Release를 수행
- Local: init, dev, check, doctor, build와 read-only status·log 조회. local D1 reset·seed·import는 첫 배포 전 또는 임시 테스트 DB에서만 사용
- 운영 D1 migration은 코드와 schema를 함께 반영하는 Deploy에서만 실행하고 단독 작업으로 노출하지 않음

원격 DB 변경, 배포, 인프라 철거에는 GitHub Actions 실행 환경과 작업별 명시적인 capability guard가 모두 필요하다. 로컬 `deploy`, 로컬 `db migrate --remote`, 로컬 원격 import, 로컬 `destroy`는 Cloudflare 변경 전에 실패해야 한다. Actions 입력은 임의 shell 명령이 아니라 좁은 operation과 검증된 옵션만 제공한다.

### 5.6 프로젝트 생성 경험

- `pnpm create @finetension/admin-app <directory>`가 기준 명령이다.
- pnpm 의존성 설치, 기존 프로젝트 CLI의 `init`, Git 초기화와 첫 커밋을 기본으로 실행한다.
- GitHub 저장소 생성은 사용자 확인 뒤에만 실행한다.
- GitHub 인증은 `gh`를 사용하고, 인증된 개인 계정과 소속 조직을 조회해 소유자를 선택한다.
- 원격 저장소는 기본 private이며, `--public`은 Cloudflare 운영 연결 없이 로컬 개발용 공개 저장소만 생성한다.
- Cloudflare 연결은 선택 사항이다. 연결하지 않아도 local D1으로 개발과 전체 검증이 가능해야 한다.
- Cloudflare 연결 시 하나의 account-wide API token을 대화형으로 입력해 계정과 Zone을 조회하고 GitHub `production` Environment Secret에도 등록한다.
- 로컬에서 계속 사용할 토큰은 저장소 파일이 아니라 OS credential store에 보관한다.
- Zone을 선택하면 프로젝트명 기반 서브도메인을 제안하고 수정할 수 있다.
- 사용 가능한 Zone이 없거나 사용자가 원하면 `workers.dev`로 배포할 수 있다.
- 원격 설정이 끝나도 첫 배포는 자동 실행하지 않고 마지막 확인 뒤에만 Deploy workflow를 dispatch한다.
- 실패한 생성 디렉터리를 자동 삭제하지 않고 재시도 가능한 상태와 명령을 안내한다.

## 6. 첫 참조 제품: Beestory 매출 관리

### 문제

Beestory는 현재 판매 채널 전체의 매출을 안정적으로 추적하거나 분석하지 못한다. 스마트스토어, 아이디어스, `beestory.kr` 자사몰이 주요 채널로 예상되지만 실제 사용 가능한 데이터와 식별자는 추가 확인이 필요하다.

### 집중 영역

판매자센터를 하나 더 만드는 대신 의사결정 시스템을 만든다.

- 채널 통합 매출 원장
- 멱등한 주문·정산 수집과 동기화 이력
- 채널 간 상품 매핑
- 환불, 채널 수수료, 원가, 배송비, 광고비 배분
- 기여이익과 추세 분석
- 수치 변화를 설명하는 주간 리뷰와 마케팅 메모

초기 수집은 로컬 에이전트나 CLI를 수동 실행하는 방식이어도 된다. 스마트스토어 API를 첫 connector 후보로 하고, 아이디어스와 자사몰은 CSV로 시작할 수 있다. 구체적인 분석 요구가 확인되기 전에는 고객 개인정보를 수집하지 않는다.

### 추가 조사 항목

- 스마트스토어, 아이디어스, 자사몰, 광고 데이터에서 얻을 수 있는 필드
- 주문, 주문 항목, 상품, 환불, 정산, 캠페인의 기준 식별자
- 원가 데이터의 출처와 갱신 주기
- 첫 대시보드가 지원해야 할 주간 의사결정 하나

이번 기반 변경에는 Beestory 업무 schema를 포함하지 않는다. 데이터 소스 감사 후 시작한다.

## 7. 공통화 판단 기준

다음 조건을 모두 만족할 때만 공통 코어에 넣는다.

1. 예상되는 모든 내부 매니징 제품에 필요하다.
2. 업종에 따라 의미가 달라지지 않는다.
3. 빠뜨리면 안전하지 않거나 불일치한 구현이 반복된다.
4. 비개발자와 AI 에이전트가 쉽게 이해할 수 있다.

그 외 기능은 실제 제품에 둔다. Beestory 구현에서 안정된 반복 패턴이 확인된 뒤 재사용 코드를 추출한다.

## 8. 기반 단계 완료 조건

- 기존 범용 Content/Marketing/Operations/Files/RBAC/workspace 런타임이 없다.
- 최소 인증 앱이 `shared/ui`의 HeroUI 기본 스타일로 실행된다.
- 새 local DB는 공통 기반 테이블만 생성한다.
- 기존 배포 DB의 레거시 테이블은 이번 변경에서 파괴적으로 삭제하지 않는다.
- 첫 production workflow가 성공하고 lifecycle 커밋이 반영되면 로컬 개발이 원격 D1으로 전환된다.
- 보호된 Actions 밖의 원격 migration과 배포가 거부된다.
- 보호된 Actions 밖의 원격 복구와 인프라 철거가 거부된다.
- CI, 배포, 안전 운영, 보호된 maintenance 워크플로가 이 문서와 일치한다.
- create CLI로 임시 디렉터리에 생성한 독립 프로젝트가 install, migration, check, build를 통과한다.
- npm release workflow가 검증한 tarball만 publish하며 로컬 publish를 요구하지 않는다.
- 공개 모노레포의 production workflow는 skip되고 D1 backup이나 Worker log artifact를 생성하지 않는다.
- `pnpm check`가 성공한다.

## 9. 보류한 결정

- 수동 기반 단계를 마친 뒤 `main` 변경을 자동 배포할지 여부
- 백업 보관 기간과 복구 목표 시간
- Beestory 제품에서 필요한 audit 범위
- connector 동기화에 스케줄러가 필요한 시점
- 검증된 Beestory 코드 중 canonical example 또는 공통 코어로 이동할 범위
