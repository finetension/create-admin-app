# Create Admin App PRD

- 상태: 생성 경험 및 기반 범위 확정
- 최종 수정: 2026-07-27
- 범위: 공개 생성 CLI, 공통 기반과 첫 참조 제품 방향

## 1. 제품 정의

이 스캐폴드는 공동창업자에 가까운 5인 미만의 신뢰 팀이 바이브코딩으로 한 회사의 내부 매니징 시스템을 개발하고 운영하도록 돕는다. 완성된 범용 백오피스를 제공하는 제품이 아니다. 안전하고 작은 공통 기반만 제공하고, 각 회사에 필요한 실제 업무 흐름은 명시적인 코드로 개발한다.

공개 제품명은 Create Admin App이다. npm 패키지 `@finetension/create-admin-app`을 `pnpm create @finetension/admin-app`으로 실행해 독립 프로젝트를 생성한다. 공개 모노레포 루트는 기준 템플릿과 CI 검증 앱이고, 생성 CLI는 같은 저장소의 workspace package로 유지한다. 실제 Cloudflare 운영 배포는 생성한 독립 저장소에서 실행하며 기본 visibility는 private이고 `--public`을 명시하면 public도 지원한다.

첫 번째 완성형 참조 제품은 Beestory 매출 관리 시스템이다. 이 제품을 끝까지 구현해 스캐폴드를 검증한 뒤 반복되는 부분만 추출한다.

## 2. 대상 팀과 운영 모델

- 공동창업자에 가까운 5인 미만의 신뢰 팀과 명시적인 Owner·Admin·Member 책임 경계
- 개발자와 비개발자 모두 로컬 코딩 에이전트로 기능을 추가하고 오류를 수정
- 저장소 하나가 회사 하나, 앱 하나, Cloudflare 배포 하나, 기준 D1 하나를 의미
- 다른 회사나 격리가 필요한 운영 단위는 새 프로젝트로 생성
- 모든 배포 변경은 Git에서 검토 가능하고 CI/CD로 재현 가능

## 3. 목표

1. 비개발자와 AI 에이전트가 이해하고 수정하기 쉬운 코드베이스를 만든다.
2. 업무별 코드를 명시적으로 유지할 수 있도록 공통 코어를 작게 유지한다.
3. 첫 배포 이후 하나의 운영 데이터만 기준 데이터로 사용한다.
4. 인프라와 데이터 변경은 GitHub Actions로 제한하고, 런타임 역할 변경은 Owner 전용 API와 감사 로그로 추적한다.
5. FSD 경계가 강제되는 일관된 HeroUI 웹 기반을 제공한다.
6. 프레임워크 추상화나 예제를 먼저 만들지 않고 실제 제품 하나를 완성한다.
7. 에이전트가 비인터랙티브 CLI를 사용해 로컬 프로젝트를 만들고, 사람이 계획을 확인하면 같은 프로젝트 CLI로 GitHub와 Cloudflare 연결부터 Actions 배포 완료까지 진행한다.

## 4. 하지 않는 것

- 멀티테넌시, 워크스페이스 전환, 조직 계층, `workspace_id`
- 역할별 커스텀 권한 편집기, 리소스 단위 ACL, 초대 메일, 회원가입, 비밀번호, 고객·판매자용 외부 포털
- 런타임 노코드 빌더, 범용 `records` 테이블, 커스텀 필드 엔진, 동적 모듈 레지스트리
- 스마트스토어·아이디어스·자사몰에 이미 있는 판매자센터 기능 복제
- Content, Marketing, Operations, Files, 댓글, 태그, 알림, import/export를 필수 제품 모듈로 제공
- 기반 단계의 스케줄러
- 운영 배포 후 별도의 장기 개발 DB 유지
- 공통 기반의 D1 backup, export 또는 restore 기능
- create CLI가 Cloudflare 또는 GitHub 자격 증명을 저장소 파일에 평문으로 기록하는 동작

## 5. 공통 기반 요구사항

### 5.1 인증과 접근

- 배포된 호스트는 Cloudflare Access로 보호한다.
- 기본 로그인 방식은 Cloudflare Access One-time PIN이며 별도 OAuth 앱을 요구하지 않는다. 신규 Zero Trust organization에서 OTP가 기본 생성되지 않으므로 Application Deploy workflow가 기존 IdP를 보존하면서 OTP identity provider를 멱등하게 보장한다.
- `public`은 역할이 아니라 인증 없는 명시적 접근 범위다. 인증 사용자는 서로 배타적인 `owner`, `admin`, `member` 중 하나다.
- Cloudflare Access의 재사용 가능 그룹과 경로별 application·policy가 운영 인가의 유일한 기준이다. D1에는 현재 역할을 복제하지 않는다.
- 일반 경로는 Owner·Admin·Member, `/admin/*`와 `/api/admin/*`는 Owner·Admin, `/owner/*`와 `/api/owner/*`는 Owner만 허용한다. `/public/*`와 `/api/public/*`만 인증 없이 공개한다.
- Worker는 `Cf-Access-Jwt-Assertion`의 서명, issuer와 요청 경로에 해당하는 application audience를 검증한다. 검증된 이메일은 사용자 식별과 audit actor로 사용한다.
- 생성 시 한 명의 `bootstrap_owner_email`을 명시한다. 이 Owner는 CI가 계속 보장하며 앱에서 제거하거나 강등할 수 없다. 마지막 Owner를 제거하는 변경도 거부한다.
- Owner 전용 API는 Cloudflare Access 그룹의 구성원을 조회·변경하고, 변경 대상 사용자의 Access 세션을 native revoke한 뒤 D1에 감사 로그를 남긴다.
- Owner·Admin·Member 그룹의 동적 구성원은 Cloudflare가 기준이며 Git이나 D1에 복제하지 않는다.
- 개발 환경은 `owner`, `admin`, `member` 역할과 비인증 public 접근을 명시적으로 모사할 수 있다. 이 모사는 local database에서만 허용하고 운영 Worker는 개발용 역할·접근 입력을 거부한다.
- Zero Trust organization 자체가 없는 account는 Dashboard에서 team name과 plan을 한 번 설정해야 한다. 인터랙티브 deploy는 해당 온보딩으로 안내하고, 비인터랙티브 deploy는 URL과 재실행 방법을 가진 구조화 오류로 중단한다.

완료 조건:

- 역할에 맞지 않는 운영 사용자는 해당 경로의 Access edge에서 거부된다.
- Worker는 Access assertion이 없거나 서명, issuer 또는 경로별 audience가 올바르지 않은 운영 API 요청을 거부한다.
- 허용된 사용자는 첫 API 접근 시 멱등하게 생성된다.
- 운영 Worker 환경에는 이메일 allowlist나 역할 테이블 binding을 배포하지 않는다.
- public 경로 외의 API는 역할별 Access application으로 보호된다.
- Owner 변경 API는 서버에 고정된 프로젝트 그룹만 수정하며 클라이언트가 account·group ID나 임의 Access payload를 지정할 수 없다.

### 5.2 앱 공통 코어

기반에는 다음만 포함한다.

- 인증된 앱 셸과 최소 홈 화면
- Owner가 팀원 역할을 관리하는 공통 보안 화면
- 공통 오류 처리와 API 요청 규약
- 명시적인 D1 migration
- audit에 사용할 행위자 식별 정보
- HeroUI 어댑터·공개 API와 FSD lint 경계
- 빌드, 테스트, 배포, 상태 조회, smoke check 도구

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

운영 앱 철거 후:

- 성공한 Application Destroy workflow가 lifecycle을 `destroyed`로 자동 커밋한다.
- Worker와 Access가 없는 상태를 정상으로 보고 D1은 보존 또는 삭제된 상태를 모두 허용한다.
- `pnpm dev`는 local D1으로 되돌아가지 않고 production 재배포를 요구한다.
- 다시 Application Deploy workflow가 성공하면 lifecycle을 `deployed`로 되돌린다.

CLI는 진단을 위한 명시적인 local/remote override를 제공하지만 기본값은 Git 추적 lifecycle로 결정한다. 실제 리소스 존재 여부와 식별자는 Cloudflare가 기준이며 read-only 상태 조회로 확인한다. 리소스 ID, Access AUD, 검증 결과를 로컬 배포 state로 저장하지 않는다. lifecycle이 없거나 잘못되면 로컬 DB로 조용히 fallback하지 않는다. 로컬 `deploy`는 성공한 workflow의 lifecycle commit을 fetch하고 `main`에 fast-forward한 뒤에만 전체 성공을 보고한다.

### 5.5 배포와 운영

TypeScript CLI가 자동화 구현의 기준이고 GitHub Actions가 인프라·D1 mutation 실행 환경이자 감사 경로다. 로컬 프로젝트 CLI는 Git과 GitHub를 통해 Actions 실행을 준비·요청하고 완료를 기다릴 수 있지만 Cloudflare 운영 리소스를 직접 변경하지 않는다. 런타임 예외는 Owner 전용 API의 프로젝트 Access 그룹 구성원 변경과 사용자 세션 revoke뿐이며 D1 감사 로그를 남긴다. account-wide write token은 로컬 OS credential store에도 있으므로 Actions-only는 token 자체의 보안 경계라고 주장하지 않는다.
Actions의 실제 Cloudflare mutation은 일반 help에서 숨긴 `pnpm cli internal <command>` namespace가 담당한다. 에이전트용 전체 JSON help에는 내부 명령의 CI 전용 조건과 위험도를 표시한다.

Application Deploy와 Application Destroy workflow는 private과 명시적으로 선택한 public 저장소에서 모두 실행할 수 있다. 공개 저장소의 Actions log나 artifact에 D1 데이터, Worker 요청·응답 또는 live log를 기록하지 않는다. 공개 기준 모노레포는 실제 회사의 production을 운영하지 않으며 Application CI, Package CI와 Package Publish만 실행한다.

- Application CI: 설치, 임시 D1 전체 migration, lint, type check, test, build
- Application Deploy: `main` push 또는 수동 dispatch로 실행. 별도 validation job의 `pnpm check`가 성공한 뒤에만 pending migration, Worker 배포, OTP·Access 정책 보장, Worker 활성 상태와 비인증 Access 차단 smoke check를 수행
- Application Destroy: `main`에서만 실행하는 인프라 철거. 정확한 서비스명, 작업별 capability와 단일 production 동시성 잠금을 강제
- Package CI: 생성 CLI 단위 검증과 실제 local tarball로 독립 프로젝트를 한 번 생성하는 smoke test
- Package Publish: 보호된 `npm` Environment에서 버전 선택, 전체 검증, release commit·tag, npm publish와 GitHub Release를 수행한 뒤 공개 registry의 정확한 버전으로 독립 프로젝트 생성과 `pnpm check`를 자동 smoke test
- Local: dev, check, doctor, build와 Cloudflare read-only status·live log 조회. 조회 결과를 GitHub artifact로 저장하지 않는다. `deploy`는 Git commit·push, repository secret 설정, Actions 실행 대기와 lifecycle fast-forward만 담당한다. local D1 reset·seed는 첫 배포 전 또는 임시 테스트 DB에서만 사용
- `doctor`는 진단과 실행 가능한 해결 hint만 제공하며 자동 수정이나 `--fix`를 제공하지 않는다.
- `logs`는 TTY에서 사용자가 중단할 때까지 스트림하고 비인터랙티브·에이전트 환경에서는 기본 30초 뒤 종료한다. 명시적인 `--duration`으로 실행 시간을 정할 수 있다.
- machine mode의 `logs`는 이벤트별 NDJSON과 마지막 summary event를 stdout에 출력하고 진행 메시지는 stderr로 분리한다.
- 운영 D1 migration은 코드와 schema를 함께 반영하는 Deploy에서만 실행하고 단독 작업으로 노출하지 않음

원격 DB 변경, 배포, 인프라 철거에는 GitHub Actions 실행 환경, `main` ref, 허용 event와 작업별 명시적인 capability guard가 모두 필요하다. Owner의 Access 구성원 변경은 인프라 변경이 아니라 제품의 감사 대상 운영 행위로 취급한다. 내부 명령은 OS credential store를 읽지 않고 process의 repository secret만 사용한다. 로컬 프로젝트 CLI의 `deploy`와 `destroy`는 Actions를 요청하고 완료를 기다릴 수 있지만 로컬 프로세스가 Cloudflare를 직접 변경해서는 안 된다. 로컬 `db migrate --remote`는 원격 변경 전에 실패해야 한다. Actions 입력은 임의 shell 명령이 아니라 좁은 operation과 검증된 옵션만 제공한다.
`destroy`는 TTY에서 정확한 project slug 입력을 요구한다. 비인터랙티브에서는 `--yes --confirm <slug>`를 모두 요구하고, D1과 역할 그룹 삭제는 추가 `--include-data`가 있을 때만 계획에 포함한다.

### 5.6 프로젝트 생성과 배포 경험

- `pnpm create @finetension/admin-app <directory>`가 기준 생성 명령이다.
- 생성기 option을 전달하는 호출은 pnpm의 인자 경계를 명확히 하도록 `pnpm create @finetension/admin-app -- <directory> <options>` 형식을 사용한다.
- 생성은 같은 파일 시스템의 임시 디렉터리에서 pnpm 의존성 설치, 전체 검증, Git 초기화와 첫 commit까지 완료한 뒤 대상 경로로 원자적으로 이동한다.
- 대상이 비어 있지 않으면 기존 파일을 덮어쓰지 않는다. 중간 실패 시 불완전한 대상 프로젝트를 남기지 않는다.
- 생성 단계는 GitHub 또는 Cloudflare 자격 증명을 요구하지 않고 초기 Owner 이메일 하나만 요구한다.
- 인터랙티브 생성은 완료 뒤 배포를 계속할지 묻고, 비인터랙티브 생성은 `--deploy --yes`를 명시한 경우에만 생성된 프로젝트의 `pnpm cli deploy`를 실행한다. 비인터랙티브 생성은 `--owner-email`을 요구하고 commit할 변경이 있으면 `--message`를 프로젝트 CLI에 전달한다.
- `pnpm cli deploy`가 첫 GitHub·Cloudflare 연결과 이후 배포를 같은 흐름으로 담당한다. 별도 `setup`이나 공개 `init` 명령은 두지 않는다.
- GitHub 인증은 `gh`를 사용하고, 인증된 개인 계정과 소속 조직을 조회해 owner를 결정한다.
- 원격 저장소는 기본 private이며 repository 이름은 project slug를 기본값으로 사용한다. `--public`은 public 저장소와 배포를 명시적으로 선택한다.
- 생성 시 `--public`을 선택하고 즉시 배포하지 않아도 `config.toml`의 partial `[github]` section에 visibility를 보존한다.
- 기존 public `origin`도 배포할 수 있다. `config.toml`의 visibility와 실제 GitHub visibility가 다르면 자동 변경하지 않고 `--reconfigure`를 요구한다.
- Cloudflare 연결에는 계정 소유 Account API Token을 사용한다. 사용자는 Dashboard의 기본 `Write all resources` 템플릿을 그대로 선택하고 만료일을 두지 않으며, CLI는 개별 권한을 조합하거나 하위 token을 발급하지 않는다.
- `Write all resources`는 계정과 Zone 전반을 변경할 수 있는 의도적으로 강한 권한이다. 연결 전에 범위를 명확히 경고한다.
- CLI는 token을 저장하기 전에 token 자체와 선택한 계정의 Workers, D1, Workers KV, Access, Zero Trust organization·identity provider와 Zone 조회 권한을 읽기 전용 요청으로 확인한다. 배포에 필요하지 않은 다른 Account API Token 목록·변경 권한은 요구하지 않는다.
- token은 저장소 파일이나 로그에 기록하지 않고 계정 단위 OS credential store와 대상 GitHub 저장소의 repository Actions secret에 등록한다. Application Deploy는 같은 secret 값을 Worker의 `ACCESS_MANAGEMENT_TOKEN` secret으로 암호화해 주입한다. PR과 fork workflow는 이 secret을 참조하지 않는다.
- Zero Trust organization이 있으면 Application Deploy workflow가 기존 IdP를 유지한 채 OTP identity provider, 역할 그룹과 경로별 Access application·policy를 멱등하게 보장한다.
- 배포 후 remote D1 개발에 Cloudflare 계정 로그인이 필요하면 TTY의 `pnpm cli dev`가 Wrangler 브라우저 로그인을 사용한다. 비인터랙티브 실행은 브라우저를 열지 않고 `access_login_required` 오류와 사용자 handoff 명령을 반환한다.
- 배포 주소는 `workers.dev`를 기본 선택으로 하고, 인터랙티브에서는 조회한 Zone을 키보드로 선택할 수 있다. custom subdomain 기본값은 project slug다.
- 비민감 프로젝트 설정과 확정된 GitHub·Cloudflare 대상은 Git 추적 루트 `config.toml`에 저장한다. 사용자 전역 설정은 owner와 account 기본값만 저장한다.
- `config.toml`은 strict schema로 검증하고 알 수 없는 section이나 key를 설정 오류로 보고한다. CLI 저장은 canonical TOML 전체 rewrite를 사용한다.
- 로컬 첫 배포가 성공하면 확정된 owner와 account를 사용자 전역 기본값으로 자동 저장하고 결과에 표시한다. CI에서는 사용자 전역 설정을 변경하지 않는다.
- `pnpm cli auth status|login|logout`은 계정 단위 OS credential의 상태 조회, 교체와 삭제를 담당한다. token 값은 어떤 출력에도 포함하지 않고 machine login은 `CLOUDFLARE_API_TOKEN`으로만 입력받는다.
- 배포 전 역할 그룹, 경로 application과 Worker secret 주입을 포함한 전체 계획을 출력한다. TTY에서는 한 번 확인받고 비인터랙티브에서는 `--yes`가 있어야 외부 변경을 실행한다.
- 승인 뒤 전체 검증과 secret 검사를 통과한 변경을 사용자가 제공한 message로 자동 commit·push하고, Actions 완료와 lifecycle commit의 local fast-forward까지 기다린 뒤 production URL을 출력한다. 비인터랙티브 실행은 commit할 변경이 있을 때 `--message`를 요구한다.
- secret 검사 오탐은 사유가 있는 정밀한 Git 추적 ignore 규칙으로만 처리한다. 실행 시점에 검사를 건너뛰는 옵션은 제공하지 않는다.
- Actions 배포가 실패하면 commit·push와 이미 완료된 원격 상태를 유지하고 실패 단계, run URL과 재실행 방법을 출력한다. 자동 retry, Git revert 또는 Cloudflare rollback은 수행하지 않는다.
- lifecycle이 `deployed` 또는 `destroyed`인 프로젝트의 Cloudflare account 변경은 새 D1과 데이터 이전을 의미하므로 `--reconfigure`로 처리하지 않고 새 프로젝트와 별도 데이터 이전 계획을 요구한다.

전체 명령 체계, 프롬프트 순서와 단계별 완료 조건은 [Developer Experience](./developer-experience.md)를 따른다.

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

- 기존 범용 Content/Marketing/Operations/Files/workspace 런타임과 커스텀 권한 편집기가 없다.
- Owner·Admin·Member 역할과 명시적 public 접근 범위가 Cloudflare Access 경로 정책으로 동작하고 Owner가 앱에서 구성원을 관리할 수 있다.
- 최소 인증 앱이 `shared/ui`의 HeroUI 기본 스타일로 실행된다.
- 새 local DB는 공통 기반 테이블만 생성한다.
- 기존 배포 DB의 레거시 테이블은 이번 변경에서 파괴적으로 삭제하지 않는다.
- 첫 production workflow가 성공하고 lifecycle commit이 반영되면 로컬 개발이 원격 D1으로 전환된다.
- 제품 CLI에서 guarded Actions 밖의 원격 migration과 배포가 거부된다.
- 제품 CLI에서 guarded Actions 밖의 인프라 철거가 거부된다.
- Application Deploy의 Cloudflare mutation job은 같은 workflow의 전체 validation job 성공을 명시적으로 요구한다.
- Application과 Package CI/CD 워크플로가 이 문서와 일치한다.
- create CLI로 임시 디렉터리에 생성한 독립 프로젝트가 install, migration, check, build를 통과한다.
- 생성 프로젝트는 기준 저장소의 Create Admin App·Beestory 제품 문맥을 상속하지 않고 프로젝트 전용 README, AGENTS와 빈 제품 PRD를 가진다.
- npm package에 독립 template lockfile을 포함하고 생성 시 frozen install을 사용해 같은 package version이 같은 dependency graph를 만든다.
- npm release workflow가 검증한 tarball만 publish하며 로컬 publish를 요구하지 않고, publish된 정확한 버전의 독립 생성·검사를 자동으로 완료한다.
- Package CI가 배포 전 local tarball로 독립 프로젝트 생성·검사를 완료한다.
- 공개 모노레포의 production workflow는 skip되고 Worker log artifact를 생성하지 않는다.
- GitHub Free private 저장소가 repository Actions secret으로 첫 배포와 재배포를 완료한다.
- Zero Trust organization이 없는 account는 외부 변경 전에 명확한 onboarding handoff를 받고, 설정 후 같은 deploy 명령으로 재개된다.
- `pnpm check`가 성공한다.

## 9. 보류한 결정

- Beestory 제품에서 필요한 audit 범위
- connector 동기화에 스케줄러가 필요한 시점
- 검증된 Beestory 코드 중 canonical example 또는 공통 코어로 이동할 범위
