# 개발 핸드북

> `config.toml`과 agent-first CLI 계약은 [Developer Experience](../specs/developer-experience.md)가 기준이며 이 저장소의 CLI와 workflow가 해당 계약을 구현한다.

## 저장소 구성

공개 저장소 루트는 Create Admin App이 복사하는 기준 템플릿이자 로컬·CI 검증 앱이다. `packages/create-admin-app`은 npm에 공개할 생성 CLI다. 생성 패키지는 배포 전에 루트의 Git 추적 파일 중 프로젝트에 필요한 파일만 snapshot으로 포함하며 `packages` 자체는 생성 결과에 복사하지 않는다. 실제 Cloudflare 운영 배포는 생성한 독립 저장소에서 검증하며 private와 명시적으로 선택한 public visibility를 모두 지원한다.

생성 CLI와 템플릿 변경은 같은 커밋에서 검토한다. Application CI는 앱과 임시 D1을 검증하고, canonical 전용 Package CI는 생성 패키지 테스트와 local tarball을 사용한 독립 프로젝트 생성 smoke를 수행한다. 생성된 프로젝트는 이 모노레포나 상위 workspace package에 의존하면 안 된다.

생성 CLI는 Cloudflare의 Create Cloudflare 패턴을 이 제품 범위에 맞게 축소한 구조를 따른다.

- `src/cli`: 인자 해석, 대화형 입력과 `CreateContext` 생성
- `src/core`: 생성 상태와 `scaffold → configure → finalize` phase orchestration
- `src/phases`: 임시 경로의 템플릿 복사, install·검증·Git commit과 원자적 이동
- `src/template`: canonical root snapshot 복사와 프로젝트별 변환

phase는 하나의 `CreateContext`를 순서대로 전달하며 앞 단계가 실패하면 이후 단계를 실행하지 않는다. 완성 전 생성물은 대상과 같은 파일 시스템의 임시 디렉터리에 두고 install, check와 첫 commit이 성공한 뒤에만 대상 경로로 이동한다. 생성 뒤 배포를 선택하면 생성 CLI가 원격 연결을 구현하지 않고 새 프로젝트의 `pnpm cli deploy`를 실행한다.
Cloudflare, GitHub와 OS credential store integration은 생성 패키지가 아니라 생성된 프로젝트의 `src/cli`에만 둔다.

단일 canonical template을 유지하므로 다중 template registry나 선택형 업무 installer는 두지 않는다. `packages/create-admin-app/template`은 Git으로 추적하지 않는 build artifact다. `pnpm run generator:check`, 로컬 생성 명령과 npm `prepack`은 항상 canonical root에서 snapshot을 새로 만들므로 복사본을 별도 source of truth로 관리하거나 커밋하지 않는다.

CLI의 기반 경계는 검증된 전용 라이브러리로 유지한다.

- 명령 정의와 인자 해석: `citty`
- 대화형 입력: `@clack/prompts`
- 외부 프로세스: `execa`
- HTTP와 검증: `ofetch`, `zod`
- OS credential store: `@napi-rs/keyring`
- TOML parsing과 canonical rewrite: `smol-toml`
- OS별 사용자 config 경로: `env-paths`
- 브라우저 열기: `open`
- CI·에이전트 실행 환경 감지: `std-env`
- 안전한 설정 저장: `write-file-atomic`
- 자동 commit 전 credential 검사: `secretlint`

CLI 프레임워크, prompt, spinner, Git과 GitHub API wrapper를 중복 추가하지 않는다. 프로젝트 파일 복사와 원자적 디렉터리 이동은 Node.js 표준 파일 API를 사용한다.

`config.toml`은 사람이 직접 편집할 수 있지만 CLI 저장 시 `smol-toml`과 strict schema 검증을 거쳐 전체 파일을 canonical 형식으로 다시 쓴다. 알 수 없는 section이나 key는 경로와 허용 key를 포함한 오류로 거부한다. 주석과 수동 서식은 보존하지 않으며 설정 설명은 handbook이나 decision 문서에 둔다.

## 시작

```bash
pnpm install --frozen-lockfile
pnpm dev
```

새 독립 프로젝트를 만드는 공개 명령은 다음과 같다.

```bash
pnpm create @finetension/admin-app my-company
```

프로젝트 CLI의 공식 표면은 `pnpm cli <command>`다. `pnpm dev`, `pnpm check`, `pnpm deploy`, `pnpm test`, `pnpm build`는 도구 호환을 위해 같은 구현을 가리키는 표준 alias로 유지한다. TypeScript CLI는 로컬 개발 orchestration과 GitHub Actions가 함께 사용하는 자동화 엔진이다.

로컬 `pnpm cli deploy`는 설정 확인, 검증, Git commit·push, GitHub repository secret 구성, workflow 요청과 완료 대기, lifecycle commit의 local fast-forward까지만 수행한다. D1 migration, Worker와 Access 변경은 저장소의 guarded Actions에서 실행한다.

Actions는 같은 CLI의 숨겨진 `internal deploy`와 `internal destroy`를 사용한다. 일반 help에서는 숨기고 `help --all --json`에서는 CI 전용 조건과 위험도를 명시한다. 내부 명령은 GitHub Actions 환경, `main` ref, 허용 event와 작업별 capability를 모두 검증하고 process의 `CLOUDFLARE_API_TOKEN`만 사용한다. OS credential store를 읽는 로컬 호출은 Cloudflare 요청 전에 거부한다.

`pnpm dev`는 DB 모드를 자동 선택한다.

- `infra/lifecycle.json`의 production이 `predeploy`이면 `local`
- 첫 성공 배포 뒤 production이 `deployed`이면 `remote`
- 성공한 철거 뒤 production이 `destroyed`이면 자동 개발을 중단하고 재배포를 요구

이 파일은 민감정보나 Cloudflare 리소스 ID를 담지 않는 Git 추적 정책 상태다. 비민감 프로젝트 설정, GitHub repository와 Cloudflare account·route는 루트 `config.toml`이 기준이다. 실제 Worker·D1 존재 여부는 Cloudflare가 기준이며 `pnpm cli status`로 조회한다. 생명주기 파일이 없거나 잘못되면 로컬 DB를 임의로 선택하지 않고 개발 시작을 실패시킨다.

로컬 deploy와 destroy는 성공한 workflow가 lifecycle을 갱신하면 `origin/main`을 fetch하고 `git merge --ff-only origin/main`으로 동기화한다. fast-forward가 불가능하면 완료된 원격 변경을 되돌리지 않고 partial success와 복구 명령을 보고하며, local lifecycle이 동기화될 때까지 전환 완료로 취급하지 않는다.

`pnpm cli dev --database local` 또는 `--database remote`는 명시적인 진단에만 사용한다. 원격 모드는 migration과 seed를 실행하지 않으며, 로컬 데이터가 조용히 분기되지 않도록 persistent local D1을 제거한다. `.wrangler`에는 로컬 에뮬레이터와 빌드의 임시 파일만 생성되며 배포 상태는 저장하지 않는다.

`pnpm cli doctor`는 로컬 도구, 설치, strict config, lifecycle, Git 상태와 연결 단계에 필요한 인증 준비 상태를 진단한다. 자동 수정이나 `--fix` 없이 에이전트가 적용할 수 있는 구체적인 해결 명령을 제공한다. `pnpm cli status`는 연결된 Cloudflare 리소스와 Git 추적 설정의 drift를 read-only로 조회한다. 둘 다 항목별 상태 code와 해결 hint를 구조화해 출력하고 상태를 변경하지 않는다.

원격 개발 모드는 시작할 때 Cloudflare에서 서비스 이름으로 D1 ID를 조회해 `.wrangler/dev-config.jsonc`에 임시 binding을 만들고, 개발 서버가 종료되거나 시작에 실패하면 해당 파일을 제거한다. D1 ID는 Git이나 배포 상태 파일에 저장하지 않는다.

Access로 보호된 remote binding은 첫 연결에 사용자 인증이 필요하다. TTY의 `pnpm cli dev`는 Wrangler의 브라우저 Access 로그인을 허용한다. machine mode는 브라우저를 열지 않고 `access_login_required` 오류와 `pnpm cli dev --interactive` hint를 반환한다. 공통 기반은 이 흐름을 위해 Access service token을 만들지 않는다.

프로젝트 CLI로 Cloudflare를 연결하면 Dashboard의 기본 `Write all resources` 템플릿으로 만든 계정 소유 Account API Token 하나를 사용한다. CLI는 token을 받기 전에 전체 계정·Zone 변경 권한을 안내하고, 저장하기 전에 token 자체, Workers, D1, Workers KV, Access, Zero Trust organization·identity provider와 Zone 조회를 읽기 전용으로 검증한다. 다른 Account API Token의 목록이나 변경 권한은 배포에 필요하지 않으므로 요구하지 않는다. token은 계정 단위 OS credential store에 보관하고 대상 GitHub 저장소의 repository Actions secret에도 등록한다. PR과 fork workflow는 이 secret을 참조하지 않는다.

Zero Trust organization이 없으면 인터랙티브 CLI가 Dashboard onboarding을 열고 완료 뒤 재검사하며 machine mode는 URL을 포함한 구조화 오류로 실패한다. Application Deploy workflow는 기존 IdP를 보존하면서 OTP identity provider와 email Allow policy를 멱등하게 보장한다. 로컬 token도 write 권한을 가지므로 Actions는 token 자체의 보안 경계가 아니라 제품이 지원하는 mutation·감사 경로다. CLI는 로컬 mutation을 노출하지 않는다.

## 구조

- `src/web/app`: 앱 provider와 routing
- `src/web/pages`: route 단위 UI slice
- `src/web/widgets`: 앱 셸 같은 페이지 합성 단위
- `src/web/entities`: 실제 도메인에 필요한 안정적인 업무 entity
- `src/web/features`: entity를 가로지르는 사용자 행동
- `src/web/shared/ui`: 유일한 웹 UI 공개 API이자 HeroUI 래퍼
- `src/shared/contracts`: Worker와 웹 사이의 전송 계약
- `src/worker`: Hono API, middleware, 명시적인 도메인 route
- `src/cli`: 로컬 및 CI orchestration

자리만 차지하는 slice는 만들지 않는다. 새 업무 기능은 일반적으로 contract, migration, Worker route, web slice를 하나의 검토 가능한 변경으로 추가한다.

## HeroUI 경계

제품 UI는 `src/web/shared/ui`에서 import한다. 어댑터는 HeroUI 전체 컴포넌트 표면을 미리 래핑하지만 페이지에서는 실제 흐름에 필요한 것만 사용한다. HeroUI의 compound component 구조와 기본 스타일을 유지한다. Lucide 아이콘도 같은 공개 API를 통한다. CSS나 variant는 확인된 제품 요구가 있을 때만 추가하고 레이아웃 utility만 자유롭게 사용한다.

강제 규칙:

- ESLint는 어댑터 밖의 직접 HeroUI import를 거부한다.
- ESLint는 어댑터 밖의 직접 Lucide import를 거부한다.
- ESLint는 제품 계층의 raw interactive HTML을 거부한다.
- Steiger는 FSD import 방향을 검사한다.
- 디자인 시스템 테스트는 wrapper 전체 범위와 단일 CSS 진입점을 검사한다.

## 업무 기능 추가 순서

1. 해당 흐름이 공통 코어가 아니라 실제 제품에 속하는지 확인한다.
2. 도메인 이름이 드러나는 명시적인 D1 migration을 추가한다.
3. 좁은 shared 전송 contract를 정의한다.
4. Hono route와 테스트를 구현한다.
5. 필요한 최소 FSD page·feature·entity slice를 추가한다.
6. `shared/ui`의 HeroUI 컴포넌트로 화면을 합성한다.
7. `pnpm check`를 실행한다.

실제 구현이 반복되기 전에는 범용 테이블, JSON 필드 묶음, registry, 설정형 workflow, runtime schema를 만들지 않는다.

## 로컬 사용자

운영 인증·인가는 Cloudflare Access가 담당한다. Worker는 Access application의 공개 JWKS로 assertion의 서명, issuer와 audience를 검증하지만 `allowedEmails`를 다시 평가하지 않는다. 검증된 이메일은 앱 사용자 식별과 audit actor로만 사용한다.

개발 환경에는 Access가 없으므로 `allowedEmails`를 `DEV_ALLOWED_EMAILS` binding으로만 주입한다. 목록의 첫 이메일을 기본 사용자로 사용하고, 다른 팀원을 확인할 때는 설정에 포함된 이메일을 `X-Dev-User`로 전달한다. 운영 배포에는 `DEV_ALLOWED_EMAILS`를 포함하지 않으며 `X-Dev-Role`은 존재하지 않는다.
