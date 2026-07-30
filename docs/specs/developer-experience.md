# Create Admin App Developer Experience

- 상태: 목표 사용자 여정과 구현 계약 확정
- 최종 수정: 2026-07-27
- 범위: 프로젝트 생성부터 에이전트 기반 개발, 원격 연결, 첫 배포와 일상 운영까지

## 1. 문서 역할

이 문서는 Create Admin App의 사용자 여정과 공개 명령 계약의 기준이다. 명령 이름, 설정 우선순위, 인터랙티브·비인터랙티브 동작, 자격 증명 처리, 외부 변경 승인과 실패 후 재실행은 이 문서를 따른다.

- 제품 대상과 기능 경계는 [PRD](./product-requirements.md)가 결정한다.
- 코드 구조와 로컬 개발 구현은 [개발 핸드북](../handbook/development.md)이 설명한다.
- 데이터와 운영 안전장치는 [배포 핸드북](../handbook/deployment.md)이 설명한다.

## 2. 대상 사용자

핵심 사용자는 CLI를 직접 외우는 비개발자가 아니라 로컬 코딩 에이전트에게 작업을 요청하고 계획과 결과를 확인하는 비개발자다.

- 공동창업자에 가까운 5인 미만의 신뢰 팀
- 기능 추가, 오류 수정과 배포를 수행하는 로컬 코딩 에이전트
- 에이전트가 제시한 외부 변경 계획과 결과를 승인하는 사람

CLI는 에이전트가 해석할 수 있는 구조화 출력, 안정적인 오류 코드와 완전한 비인터랙티브 실행을 제공한다. TTY에서는 사람이 직접 수행할 수 있는 키보드 중심 UI를 함께 제공한다.

## 3. DX 원칙

### 로컬 프로젝트가 먼저

`create`는 GitHub와 Cloudflare 없이 실행 가능한 독립 프로젝트를 먼저 완성한다. 생성 직후 의존성 설치, 전체 검증과 첫 Git commit까지 끝난다. 그 뒤에만 배포를 계속할지 묻는다.

### 생성 CLI는 얇게

공개 생성 CLI는 템플릿 복사, 프로젝트별 설정, 설치, 검증과 Git 초기화만 담당한다. 생성 직후 배포를 선택해도 생성 CLI가 원격 연결을 다시 구현하지 않고 생성된 프로젝트의 `pnpm cli deploy`를 호출한다.

생성된 프로젝트의 TypeScript CLI가 개발, 진단, 배포와 운영 자동화의 기준이다. CLI 소스는 프로젝트 저장소 안에 포함되어 에이전트가 읽고 수정할 수 있으며 외부 workspace package에 런타임 의존하지 않는다.

### CLI 권위, 에이전트 안내

`AGENTS.md`는 에이전트에게 명령 선택과 승인 규칙만 안내한다. 실제 입력 검증, 자격 증명 처리, 위험 작업 제한, 출력 계약과 CI capability는 CLI가 강제한다.

에이전트는 다음으로 현재 명령 계약을 조회할 수 있어야 한다.

```bash
pnpm cli --help
pnpm cli help --all --json
```

### 프로젝트 설정은 Git에

루트 `config.toml`은 비민감 프로젝트 설정의 단일 기준이다.

```toml
[project]
name = "My Company"
slug = "my-company"

[access]
bootstrap_owner_email = "owner@example.com"
google_login = false

[github]
owner = "finetension"
repository = "my-company"
visibility = "private"

[cloudflare]
account_id = "00000000000000000000000000000000"
workers_dev = true
```

GitHub와 Cloudflare가 아직 연결되지 않은 로컬 프로젝트는 기본적으로 `[project]`와 `[access]`를 가진다. `google_login`은 생략하거나 `false`이면 OTP만 사용하고 `true`이면 Google 로그인을 함께 사용한다. 생성할 때 `--public`을 명시하면 연결 전 `[github]`에는 `visibility = "public"`만 기록한다. 첫 배포에서 확정한 나머지 대상은 같은 파일에 기록하고 검증·커밋한다. D1 ID, Access AUD, API 응답과 단계별 진행 상태는 기록하지 않는다.

사람과 에이전트가 `config.toml`을 직접 편집할 수 있다. CLI는 `smol-toml`로 전체 파일을 parse하고 strict schema를 검증한 뒤 정해진 section·key 순서의 canonical TOML로 원자적으로 다시 저장한다. 알 수 없는 section이나 key는 조용히 제거하거나 보존하지 않고 정확한 경로, 허용 key와 수정 예시를 포함한 설정 오류로 실패한다. 기존 주석, 공백과 수동 서식은 보존하지 않으므로 설정의 이유나 장기 설명은 문서에 기록한다.

### 사용자 기본값과 자격 증명을 분리

OS별 사용자 config 디렉터리의 `create-admin-app/config.toml`은 기본 GitHub owner와 Cloudflare account만 저장한다. 실제 배포 대상은 항상 프로젝트 `config.toml`에 확정한다.

Cloudflare token은 OS credential store에 계정 단위로 저장한다. GitHub 인증은 `gh`에 맡긴다. 환경변수로 주입한 token은 CI용으로 보고 credential store에 저장하지 않는다. 선택형 Google 로그인 자격 증명은 `GOOGLE_OAUTH_CLIENT_ID`와 `GOOGLE_OAUTH_CLIENT_SECRET` 환경변수 또는 인터랙티브 password prompt로만 받고, 프로젝트 파일이나 OS credential store에 저장하지 않은 채 대상 GitHub repository Actions secret으로 직접 전달한다.

로컬에서 첫 배포가 성공하면 확정된 GitHub owner와 Cloudflare account를 사용자 config에 원자적으로 저장하고 결과에 변경 사실을 표시한다. 기존 기본값이 있으면 가장 최근에 성공한 선택으로 갱신한다. CI에서는 사용자 config를 만들거나 변경하지 않으며, 이미 연결된 프로젝트에서는 사용자 기본값이 프로젝트 `config.toml`을 덮어쓰지 않는다.

### 인프라 변경은 Actions에서

로컬 `pnpm cli deploy`는 설정 확인, commit 전 secret 검사, Git commit·push, GitHub repository secret 설정, workflow 실행과 결과 대기만 담당한다. type check, lint, test와 build는 GitHub Actions에서 한 번 실행하며 D1 migration, Worker·Access application·policy 생성과 변경도 Actions 안에서만 수행한다.

Actions-only는 제품 CLI가 지원하고 감사하는 인프라 경로이지 Cloudflare token 자체의 보안 경계가 아니다. 같은 account-wide write token이 로컬 OS credential store에도 있으므로 신뢰된 사용자는 Cloudflare API를 직접 호출할 수 있다. CLI는 로컬 mutation 명령을 제공하지 않고 에이전트가 모든 인프라 변경을 Actions로 보내도록 강제한다.

런타임 역할 변경은 좁은 예외다. Owner 전용 API만 서버에 고정된 프로젝트 Access 그룹의 구성원을 변경하고 사용자 세션을 revoke할 수 있으며, 매 변경을 D1에 기록한다. Application Deploy는 기존 repository secret의 값을 Worker의 `ACCESS_MANAGEMENT_TOKEN` secret으로 주입한다. Worker 코드에서는 이 별도 binding 이름만 사용해 이후 제한 토큰으로 교체할 수 있게 한다.

### 재실행 가능

별도 로컬 진행-state 파일을 만들지 않는다. `config.toml`, Git remote, GitHub와 Cloudflare의 read-only 상태를 다시 조회해 이미 끝난 단계를 재사용한다. 일부 단계 뒤 실패해도 같은 명령으로 수렴한다.

## 4. 공개 명령 표면

프로젝트 CLI가 공식 명령 표면이다.

```bash
pnpm cli dev
pnpm cli build
pnpm cli check
pnpm cli deploy
pnpm cli destroy
pnpm cli doctor
pnpm cli status
pnpm cli logs
pnpm cli auth <command>
pnpm cli db <command>
```

도구와 생태계 호환을 위해 표준 pnpm script를 같은 구현의 alias로 유지한다.

```bash
pnpm dev
pnpm check
pnpm deploy
pnpm test
pnpm build
```

프로젝트 초기 연결을 위한 별도 `setup`이나 `init` 명령은 공개하지 않는다. 첫 `deploy`가 필요한 GitHub·Cloudflare 연결을 함께 처리한다.
저빈도 인프라 작업을 위한 포괄적인 `infra` 그룹도 두지 않는다. 운영 리소스 철거는 의도가 분명한 최상위 `destroy`로 노출하고, 실제 Cloudflare 삭제는 guarded GitHub Actions에서만 수행한다.

`destroy`의 기본 계획은 Worker와 경로별 Access application·policy를 제거하고 D1과 역할 그룹 구성원을 보존한다. 인터랙티브 모드에서는 데이터와 역할 구성원 보존을 기본 선택으로 표시하고, 비인터랙티브 모드도 `--include-data`가 없으면 둘을 보존한다. `--include-data`를 명시하면 D1과 역할 그룹 구성원도 복구 보장 없이 제거한다.

`destroy`는 최종 계획을 표시한 뒤 인터랙티브 모드에서 project slug를 직접 입력받는다. 비인터랙티브 모드는 `--yes --confirm <slug>`를 모두 요구하고 값이 `config.toml`의 project slug와 정확히 일치해야 한다. D1과 역할 그룹까지 제거하려면 여기에 `--include-data`를 별도로 지정한다. 확인이 없거나 일치하지 않으면 안전 정책 위반 종료 코드 `5`로 끝나며 Application Destroy workflow를 요청하지 않는다.

성공한 Application Destroy workflow는 lifecycle을 `destroyed`로 커밋한다. 로컬 `destroy`는 workflow 완료 뒤 해당 commit을 `main`에 fast-forward해야 전체 성공을 보고한다. 철거 후 `status --strict`는 Worker와 Access가 없고 D1이 보존되었거나 삭제된 상태를 모두 정상으로 판단한다. 자동 `dev`와 persistent local D1 명령은 local database로 되돌아가지 않고 `deploy`를 요구한다.

`db` 그룹은 다음의 좁은 데이터 생명주기만 제공한다.

```bash
pnpm cli db migrate
pnpm cli db seed
pnpm cli db reset
```

`migrate`, `seed`, `reset`은 첫 배포 전 persistent local D1 또는 격리된 테스트 D1에서만 실행한다. 운영 migration은 `deploy`에 포함하며 별도 명령으로 실행하지 않는다. 공통 CLI는 운영 D1 backup, export 또는 restore를 제공하지 않는다.

`status`와 `logs`는 OS credential store 또는 환경변수의 Cloudflare token으로 read-only 조회한다. GitHub Actions를 실행하거나 결과를 artifact로 저장하지 않는다. `logs`는 현재 터미널에만 live stream하고 종료 시 별도 snapshot을 남기지 않는다. TTY에서는 사용자가 `Ctrl-C`로 끝낼 때까지 스트림을 유지하고, 비인터랙티브·CI·에이전트 환경에서는 `--duration`이 없으면 30초 뒤 정상 종료한다. 명시적인 `--duration`은 실행 환경과 관계없이 우선한다.

`doctor`는 현재 프로젝트의 로컬 준비 상태를 진단한다. Node.js·pnpm·Git·`gh` 버전과 실행 가능 여부, 의존성 설치, strict `config.toml`, lifecycle, Git branch·worktree·remote, 필요한 GitHub 인증과 Cloudflare credential의 존재·유효성을 확인한다. 아직 연결되지 않은 프로젝트에서는 원격 자격 증명이 없음을 정상 상태로 구분한다.

`auth` 그룹은 Cloudflare account credential의 명시적인 수명주기를 제공한다.

```bash
pnpm cli auth status
pnpm cli auth login
pnpm cli auth logout
```

`status`는 저장 여부, account ID와 token 유효성만 표시하고 token 값은 출력하지 않는다. `login`은 TTY에서 password prompt로 새 token을 입력받고 검증 뒤 기존 account credential과 기본 credential을 교체한다. machine mode는 shell argument 대신 `CLOUDFLARE_API_TOKEN`과 account option 또는 config를 사용한다. `logout`은 대상 account credential을 제거하며 machine mode에서는 `--yes`를 요구한다. 사용자 전역 owner/account 기본값은 auth 결과에 함께 표시하고 명시적인 reset option으로 제거할 수 있다.

`status`는 연결된 프로젝트의 실제 Cloudflare Worker, D1, Access와 route를 조회하고 `config.toml`·lifecycle과의 drift를 보여준다. 연결 정보나 token이 없으면 필요한 항목을 명시한 설정·인증 오류로 끝난다. 두 명령은 항목별 `ok`, `warning`, `error`, 안정적인 code와 해결 hint를 TTY와 JSON에서 동일하게 제공한다. JSON의 redirect location은 진단에 필요한 origin과 path만 제공하고 query, fragment와 Cloudflare Access challenge의 opaque path segment는 출력하지 않는다.

`doctor`는 파일, 의존성, credential 또는 원격 상태를 변경하지 않으며 `--fix`를 제공하지 않는다. 각 오류의 hint는 에이전트가 그대로 실행하거나 적용할 수 있는 구체적인 명령 또는 설정 변경을 포함한다.

machine mode의 `logs`는 단일 JSON document 대신 NDJSON을 사용한다. stdout에 각 log event를 한 줄씩 즉시 출력하고 마지막 줄에는 수신 개수, 실제 실행 시간과 종료 이유를 가진 `summary` event를 출력한다. 진행 메시지는 계속 stderr로 분리하며 각 줄은 독립적으로 parse 가능한 JSON이어야 한다.
Wrangler가 하나의 event를 여러 줄 JSON으로 출력하더라도 CLI는 완전한 event 하나를 단일 NDJSON `log` record로 재조립한다. `summary.received`는 Wrangler 출력 줄 수가 아니라 완전하게 수신한 Worker event 수다.

첫 배포 이후 `dev`는 로컬 Vite Worker에 canonical remote D1 binding을 연결한다. Cloudflare 계정 인증이 없고 TTY라면 Wrangler의 브라우저 로그인을 시작한다. machine mode에서는 브라우저를 열지 않고 `access_login_required` 설정 오류와 `pnpm cli dev --interactive` 실행 hint를 반환한다. 이 경로는 배포된 Worker나 실제 Access 역할 세션을 거치지 않으며 로컬 actor는 기본 Owner로 고정된다. 공통 기반은 remote development용 별도 service token을 만들거나 저장하지 않는다.

역할별 화면과 API를 확인할 때는 local database를 명시하고 인증 역할 또는 public 접근을 선택한다.

```bash
pnpm cli dev --database local --role owner
pnpm cli dev --database local --role admin
pnpm cli dev --database local --role member
pnpm cli dev --database local --public
```

`--role`과 `--public`은 local database에서만 허용하며 함께 사용할 수 없다. `owner`, `admin`, `member`는 Bootstrap Owner 이메일을 개발 actor로 사용하고 `--public`은 인증 정보 없이 요청한다. 자동 remote 개발이나 명시적인 `--database remote`와 함께 사용하면 운영 역할이나 접근 상태를 가장하지 않고 사용법 오류로 실패한다.

### Actions 전용 내부 명령

Cloudflare mutation은 같은 TypeScript CLI의 숨겨진 namespace에서 실행한다.

```bash
pnpm cli internal deploy
pnpm cli internal destroy
```

일반 `pnpm cli --help`에는 내부 명령을 표시하지 않는다. `pnpm cli help --all --json`에는 `visibility: "internal"`, GitHub Actions 전용 조건, 필요한 capability와 위험도를 포함해 에이전트가 전체 자동화 구조를 이해할 수 있게 한다.

내부 명령은 `GITHUB_ACTIONS`, `main` ref, 허용된 workflow event와 workflow가 부여한 작업별 capability를 모두 검증한다. Cloudflare credential은 process의 `CLOUDFLARE_API_TOKEN`만 허용하고 OS credential store를 읽지 않는다. 로컬에서 호출하거나 capability가 다른 작업을 요청하면 Cloudflare API 호출 전에 안전 정책 오류로 실패한다. 운영 migration은 `internal deploy` 단계에만 포함하고 별도 내부 범용 SQL 명령을 두지 않는다.

## 5. 실행 모드와 출력

### 인터랙티브

TTY에서 실행하고 `--json`을 지정하지 않으면 `@clack/prompts` 기반 UI를 사용한다.

- 방향키와 Enter로 owner, account, 배포 주소와 Zone을 선택
- 목록이 길면 검색 가능한 선택 사용
- 입력할 값에는 수정 가능한 기본값 제공
- 마지막에 GitHub, Cloudflare, 배포 주소와 변경 파일을 한 번에 요약
- 취소하면 아직 실행하지 않은 외부 변경 없이 종료

`--interactive`는 TTY에서 사람용 프롬프트와 필요한 브라우저 인증을 명시적으로 선택한다. TTY가 아니면 프롬프트를 흉내 내지 않고 사용법 오류로 실패한다.

### 비인터랙티브

비-TTY, CI 또는 감지된 코딩 에이전트 환경에서는 프롬프트를 열지 않는다.

- 모든 필수 값은 `config.toml`, 명시적 option, 환경변수 또는 전역 기본값에서 결정
- 값이 부족하면 필요한 key와 수정 예시를 포함한 구조화 오류로 실패
- 외부 변경에는 `--yes`가 필요
- stdout은 JSON, 진행 로그는 stderr
- 브라우저를 자동으로 열지 않음

명시적 `--json`은 어떤 환경에서도 JSON 모드를 강제한다. 명시적 인터랙티브 option이 없는 한 `--json`과 프롬프트는 함께 사용하지 않는다.

`--json`은 비인터랙티브 실행을 의미하며 `--interactive`와 함께 사용할 수 없다. 에이전트는 실행 환경이 TTY인지와 관계없이 `--json`으로 machine mode를 확정한다. CLI가 시작하는 모든 외부 mutation에는 별도의 `--yes`가 필요하다.
에이전트는 TTY를 사용할 수 있더라도 기본적으로 `--json`, `--yes`와 명령별 확인 option을 조합하고, 단지 TTY가 있다는 이유로 `--interactive`를 선택하지 않는다. 구조화된 필수 입력·설정 URL·브라우저 로그인 handoff만 사용자에게 전달한다.

### 구조화 출력

성공 결과는 명령별 데이터 구조를 유지하고 모든 응답을 보편적인 `data` envelope로 감싸지 않는다. 오류는 다음 형태를 사용한다.

```json
{
  "error": {
    "code": "missing_dependency",
    "message": "GitHub CLI is required.",
    "hint": "Install gh and run the command again."
  }
}
```

기준 종료 코드는 다음과 같다.

| 코드 | 의미 |
| ---: | --- |
| 0 | 성공 |
| 1 | 예상하지 못한 오류 |
| 2 | 사용법 또는 입력 오류 |
| 3 | 설정 또는 인증 오류 |
| 4 | 외부 API 또는 workflow 오류 |
| 5 | 안전 정책 위반 |

## 6. 프로젝트 생성

기준 명령:

```bash
pnpm create @finetension/admin-app my-company
pnpm create @finetension/admin-app -- my-company --name "My Company" --owner-email owner@example.com --json
pnpm create @finetension/admin-app -- my-company --public --deploy --yes --message "feat: deploy my-company" --json
```

옵션을 사용하지 않는 인터랙티브 생성은 첫 번째 형식으로 실행한다. 생성기 option을 전달할 때는 pnpm이 option을 가로채지 않도록 package 이름 뒤에 `--` 구분자를 두고 그 뒤에 project와 option을 작성한다.

프로젝트 인자는 디렉터리, package, GitHub repository, Worker와 기본 custom subdomain에 사용할 slug다. 표시 이름은 slug에서 자동 생성하고 인터랙티브에서 수정할 수 있다.
원격 저장소 visibility는 private가 기본이다. `--public`은 이후 `deploy`가 만들거나 연결할 public 저장소를 명시적으로 선택하며 public이라는 이유로 운영 배포를 제한하지 않는다.

생성 명령의 프로젝트 입력 계약:

| 입력 | 역할 | 비인터랙티브 동작 |
| --- | --- | --- |
| `<directory>` | project slug와 대상 디렉터리 | 필수 |
| `--name <name>` | 표시 이름 | 생략하면 slug에서 생성 |
| `--owner-email <email>` | 제거할 수 없는 초기 Owner 이메일 | 필수 |
| `--public` | 이후 GitHub visibility | 생략하면 private |
| `--skip-install` | 설치와 검증 생략 | 명시한 경우에만 |
| `--deploy` | 생성 뒤 project CLI 실행 | 명시한 경우에만 |
| `--message <message>` | deploy 자동 commit message | deploy가 변경을 만들면 필수 |
| `--yes` | deploy 외부 변경 승인 | `--deploy`와 함께 필수 |
| `--json` | machine mode와 JSON 출력 | 에이전트 실행의 기준 |

`bootstrap_owner_email`은 최초 운영 복구 경계이므로 에이전트가 Git author, 서비스 이름, 도메인 또는 예시 값으로 추론하면 안 된다. machine mode에서 `--owner-email`이 없으면 생성기는 `missing_required_input` 오류와 `field`, `option`, `may_infer: false`, `required_action: "ask_user"`를 반환하고, 다른 명령이나 소스 탐색 없이 실제 Owner 이메일을 사용자에게 물어본 뒤 같은 명령을 재실행하도록 안내한다.

### 시작 전 확인

생성 전에 Node.js, pnpm, Git과 대상 경로를 검사한다. 배포를 선택하기 전에는 `gh`나 Cloudflare token을 요구하지 않는다.

### 생성 단계

1. 대상 경로와 같은 파일 시스템의 임시 디렉터리에 템플릿 생성
2. `[project]`와 `[access].bootstrap_owner_email`이 채워진 `config.toml` 작성. `--public`이면 연결 전에도 `[github].visibility = "public"`을 기록
3. 생성 package에 포함된 독립 lockfile로 `pnpm install --frozen-lockfile`
4. `pnpm check`
5. `main` Git 저장소와 첫 commit 생성
6. 완성된 프로젝트를 대상 경로로 원자적으로 이동

대상 디렉터리가 비어 있지 않으면 시작 전에 실패하고 기존 파일을 덮어쓰지 않는다. 중간 실패 시 임시 생성물을 정리해 불완전한 프로젝트를 남기지 않는다.

생성물의 README, AGENTS, specs, handbook과 초기 화면은 기준 저장소의 npm publishing, generator 또는 Beestory 참조 제품 문맥을 포함하지 않는다. README는 프로젝트 이름, prerequisite, local development와 deploy/status 다음 단계를 안내한다. AGENTS는 실제 존재하는 명령과 `pnpm cli help --all --json`을 에이전트의 명령 기준으로 제시한다. 제품 PRD는 생성한 회사의 실제 문제를 기록하기 위한 빈 템플릿으로 시작하고, DX·개발·배포 문서는 생성된 독립 프로젝트의 명령과 운영 경계만 설명한다.

`--skip-install`은 네트워크가 제한된 고급 환경에서만 사용한다. 이 경우 설치와 검증을 건너뛴 사실을 결과에 명시한다.
검증되지 않은 프로젝트를 바로 배포하지 않도록 `--skip-install`과 `--deploy`는 함께 사용할 수 없고, 인터랙티브 생성에서도 `--skip-install`을 선택하면 배포 질문을 생략한다.

### 생성 후

인터랙티브에서는 로컬 생성이 끝난 뒤 배포를 계속할지 묻는다. 계속하면 새 프로젝트의 `pnpm cli deploy --interactive`를 실행해 create에서 선택한 사람용 실행 모드를 보존한다. 거절은 정상적인 성공이다.

비인터랙티브에서는 `--deploy`를 명시한 경우에만 배포를 이어간다.
생성 뒤 배포가 commit할 변경을 만들 수 있으므로 비인터랙티브 `--deploy`는 `--yes`와 `--message`를 함께 받아 프로젝트 CLI에 전달한다.

## 7. 배포

기준 명령:

```bash
pnpm cli deploy
pnpm cli deploy --dry-run --json
pnpm cli deploy --yes --json --message "feat: deploy sales dashboard"
pnpm cli deploy --reconfigure
```

첫 배포에서 option으로 대상을 제공할 때는 `--github-owner <owner>`, `--github-repository <name>`, `--public` 또는 `--private`, `--cloudflare-account-id <id>`, `--workers-dev` 또는 `--domain <zone> [--subdomain <prefix>]`를 사용한다. custom domain option이 없으면 `workers.dev`가 기본이다. 연결된 프로젝트에서는 이 option이 `config.toml`과 충돌할 경우 `--reconfigure` 없이는 실패한다.

### 사전 확인

원격 선택이나 mutation 전에 다음을 한 번에 확인한다.

- Node.js, pnpm, Git, `gh`
- 현재 branch가 `main`인지
- GitHub 인증과 사용 가능한 owner
- `config.toml`과 lifecycle
- Cloudflare token 자체, account, Workers, D1, KV, Access와 Zone 조회
- Zero Trust organization, One-time PIN과 선택된 Google identity provider
- `google_login = true`이면 Google OAuth client ID와 secret
- 자동 commit 대상의 secret

문제가 있으면 질문이나 파일 변경 전에 가능한 항목을 모두 보고한다.

### 첫 배포 대상 선택

GitHub repository와 Cloudflare 연결은 하나의 production 배포 단위다.

- repository 이름 기본값: project slug
- visibility 기본값: private
- `--public` 또는 확정된 `config.toml`: public 선택
- Cloudflare account: 프로젝트 설정, 전역 기본값 또는 키보드 선택
- 배포 주소: `workers.dev`가 기본 선택
- custom domain: 조회한 Zone에서 선택
- custom subdomain 기본값: project slug

인터랙티브에서는 `workers.dev`와 custom domain을 키보드로 선택한다. 비인터랙티브에서 route 설정이 없으면 `workers.dev`를 사용한다.

Cloudflare token이 없고 인터랙티브라면 Account API Tokens 페이지를 자동으로 열고 `Write all resources` token 입력을 기다린다. 비인터랙티브에서는 브라우저나 프롬프트 없이 실패한다.

선택한 account에 Zero Trust organization이 없으면 인터랙티브에서는 Dashboard 온보딩 URL을 열고 사용자가 team name과 plan 설정을 마친 뒤 재검사한다. machine mode에서는 `cloudflare_zero_trust_setup_required` 설정 오류, URL과 재실행 hint를 반환한다. organization이 존재하지만 OTP identity provider가 없으면 기존 IdP를 바꾸지 않고 Application Deploy workflow가 OTP를 멱등하게 추가한다. Google 로그인을 선택하면 Google OAuth 자격 증명의 완전한 쌍을 요구하고 기존 관리 대상 Google provider를 멱등하게 갱신한다.

### 최종 계획

모든 read-only 조회와 선택을 마친 뒤 다음을 한 번에 보여준다.

- GitHub owner, repository와 visibility
- Cloudflare account
- `workers.dev` 또는 custom hostname
- Bootstrap Owner 이메일
- Owner·Admin·Member 그룹과 Base·Admin·Owner application 및 명시적 Public 경로 정책
- 수정·commit할 파일
- 변경이 있을 때 사용할 commit message
- 생성하거나 갱신할 GitHub repository secret과 Worker `ACCESS_MANAGEMENT_TOKEN` secret 주입
- Zero Trust organization 상태와 OTP·선택형 Google 로그인 추가 여부
- 실행할 workflow

public 저장소이면 source, `config.toml`의 Bootstrap Owner 이메일, Actions run과 안전하게 제한된 배포 log가 공개된다는 사실도 표시한다. 동적으로 추가한 팀원 이메일은 Git이나 plan에 출력하지 않는다. `workers.dev`를 선택하면 Cloudflare가 business-critical production에는 custom domain이나 route를 권장한다는 점도 안내한다. TTY에서는 한 번 확인받고 비인터랙티브에서는 `--yes`를 요구한다. `--dry-run`은 같은 계획을 출력하고 mutation 없이 종료한다.

### 실행

승인 뒤 다음 순서로 실행한다.

1. `config.toml` 원자적 갱신
2. commit 전 secretlint
3. 현재 변경이 있으면 제공받은 message로 전체 자동 commit
4. 선택한 visibility의 GitHub repository 생성 또는 기존 `origin`과 visibility 검증
5. repository Actions secret `CLOUDFLARE_API_TOKEN`과 선택형 Google OAuth secret 설정
6. `main` push 또는 변경이 없을 때 `workflow_dispatch`
7. 해당 GitHub Actions run 발견 및 완료 대기
8. `git fetch origin main` 뒤 workflow의 lifecycle commit을 `git merge --ff-only origin/main`으로 동기화
9. 로컬 첫 배포이면 owner와 account를 사용자 전역 기본값으로 저장
10. 성공 여부, Actions URL, production URL과 저장한 기본값 출력

새 repository는 secret 설정이 끝난 뒤 처음 push해 첫 push deployment가 자격 증명 없이 실행되는 race를 피한다. 이후 `main` push는 자동으로 Application Deploy workflow를 실행한다.

기존 public `origin`은 정상 배포 대상이다. `config.toml`의 visibility와 실제 GitHub visibility가 다르면 자동으로 공개·비공개 전환하지 않고 `--reconfigure`를 요구한다.

commit할 변경이 있으면 TTY에서는 message를 입력받고, 비인터랙티브에서는 비어 있지 않은 `--message`를 요구한다. clean worktree를 그대로 재배포할 때는 message를 요구하거나 빈 commit을 만들지 않고 `workflow_dispatch`를 사용한다.

다른 branch에서는 자동 merge하지 않고 실패한다. 자동 commit 전에 `.env`류와 secretlint 결과를 검사하고 민감정보가 의심되면 push 전에 중단한다.

secretlint 오탐은 Git으로 추적하는 `.secretlintignore`에 가능한 가장 좁은 경로 패턴과 사유 주석을 함께 추가해 해결한다. ignore 파일 변경은 최종 배포 계획에서 별도로 강조하고 로컬과 Actions가 같은 규칙을 사용한다. `--skip-secret-check` 같은 실행 시점 우회 옵션은 제공하지 않는다.

### 배포 실패

push 뒤 Actions가 실패하면 생성한 commit과 push, 이미 완료된 원격 단계는 그대로 유지한다. CLI는 실패한 job·step, Actions URL, 확인된 오류와 다음 실행 명령을 구조화해 출력하고 외부 API 오류 종료 코드 `4`로 끝난다. 자동 workflow 재시도, Git revert 또는 Cloudflare rollback은 수행하지 않는다.
workflow 조회 중 GitHub API timeout이나 5xx처럼 안전하게 반복할 수 있는 일시 오류는 짧게 최대 3회 재시도한다. 그래도 실패하면 인증 오류와 네트워크·서비스 오류를 구분해, 사용자가 수동 `git push` 같은 우회 명령 대신 동일한 `pnpm cli` 명령을 다시 실행하도록 안내한다. repository 존재 확인 중 네트워크 실패를 존재하지 않는 repository로 취급하지 않는다.

원인을 수정한 변경이 있으면 새 message로 같은 `deploy`를 다시 실행한다. Git 변경이 없다면 같은 commit을 대상으로 `workflow_dispatch`를 다시 요청한다. 각 단계는 프로젝트 설정과 실제 원격 상태를 다시 조회해 완료된 작업을 재사용하고 남은 상태로 수렴해야 한다.

workflow는 성공했지만 lifecycle commit을 로컬 branch에 fast-forward할 수 없으면 배포된 원격 상태를 되돌리지 않는다. CLI는 `deployed: true`, `local_sync: "failed"`와 복구 명령을 출력하고 종료 코드 `4`로 끝낸다. 사용자가 branch를 정리하고 `git pull --ff-only origin main`을 완료하기 전에는 `pnpm cli dev`가 remote 전환 완료를 주장하지 않는다.

### 재설정

일반 `deploy`는 이미 확정된 `config.toml` 대상을 바꾸지 않는다. GitHub repository, visibility 또는 route를 바꾸려면 다음을 사용한다.

```bash
pnpm cli deploy --reconfigure
```

재설정도 read-only 조회, 전체 계획과 승인을 거쳐 `config.toml`을 갱신한다.

lifecycle이 `deployed` 또는 `destroyed`이면 Cloudflare account 변경은 새 기준 D1과 데이터 이전을 의미하므로 공통 CLI가 수행하지 않고 안전 정책 오류로 거부한다. 다른 account로 옮길 때는 새 프로젝트와 검토된 데이터 이전 계획을 사용한다.

## 8. 설정과 자격 증명 우선순위

이미 연결된 프로젝트는 `config.toml`이 배포 대상의 기준이다. 충돌하는 option은 조용히 덮어쓰지 않고 `--reconfigure`를 요구한다.

첫 배포의 비민감 값:

```text
명시적 option → 환경변수 → 사용자 전역 기본값 → 인터랙티브 입력
```

지원 환경변수는 `CREATE_ADMIN_APP_GITHUB_OWNER`와 `CREATE_ADMIN_APP_CLOUDFLARE_ACCOUNT_ID`다. 프로젝트 이름, Bootstrap Owner, repository, visibility와 route는 생성 option 또는 프로젝트 `config.toml`로 명시한다.

자격 증명:

```text
환경변수 → OS credential store → 인터랙티브 입력
```

token을 shell history에 남기는 option은 제공하지 않는다.

## 9. 배포 이후

Application CI는 PR만 검증한다. `main` push는 Application Deploy만 시작하며, 단일 job이 의존성을 한 번 설치하고 production credential 없이 `pnpm check`를 실행한다. 이 검증이 성공한 뒤에만 mutation step에 repository secret을 주입하고, 검증에서 만든 CLI를 재사용해 운영 전용 Vite build, D1 migration, Worker 배포, 기존 IdP를 보존한 OTP와 선택형 Google provider 보장, 역할 그룹과 경로별 Access application·policy 배포, Worker secret 주입, smoke check와 lifecycle commit을 수행한다. 두 로그인 공급자를 사용하면 application은 둘을 명시적으로 허용하고 자동 IdP redirect를 끈다. smoke check는 Cloudflare API에서 Worker deployment가 active인지 확인하고 인증되지 않은 private production URL이 Access 로그인 또는 거부 응답을 반환하며 public health 경로는 접근 가능한지 검사한다. 공통 기반은 CI용 Access service token이나 인증된 운영 데이터 요청을 사용하지 않는다.

첫 배포 뒤 local branch가 workflow의 lifecycle commit까지 동기화되면 `pnpm cli dev`는 기준 remote D1을 사용한다. 첫 remote 연결에 Cloudflare 계정 로그인이 필요하면 TTY에서 브라우저 인증을 수행하고 machine mode에서는 구조화 오류로 사용자 handoff를 요청한다. 운영 migration과 destroy는 계속 Actions capability 안에서만 실행한다.

철거 뒤 local branch가 `destroyed` lifecycle commit까지 동기화되면 자동 `dev`는 중단된다. 같은 프로젝트를 다시 운영하려면 `pnpm cli deploy`를 실행하며, 성공한 Application Deploy workflow가 기존 D1과 보존한 역할 그룹을 재사용한 뒤 lifecycle을 다시 `deployed`로 커밋한다.

## 10. 완료 조건

### Create

- GitHub와 Cloudflare 없이 생성된다.
- 의존성 설치, `pnpm check`와 첫 commit이 완료된다.
- 중간 실패 뒤 불완전한 대상 디렉터리가 남지 않는다.
- 생성 결과는 모노레포나 전역 CLI에 의존하지 않는다.
- machine mode는 `--owner-email`을 포함한 문서화된 option만으로 프롬프트 없이 완료된다.
- machine mode에서 빠진 Bootstrap Owner 이메일은 추론 금지 필수 입력으로 구조화되고 에이전트가 실제 사용자에게 질문할 수 있다.
- 같은 create package version은 독립 template lockfile과 frozen install로 같은 dependency graph를 만든다.
- 생성된 문서와 초기 UI에는 Create Admin App monorepo 또는 Beestory 전용 요구사항이 없다.

### Deploy

- 새 private 또는 public repository, 기존 private 또는 public `origin`, Zone이 없는 계정에서 성공한다.
- GitHub Free private repository가 repository Actions secret으로 배포된다.
- Zero Trust organization이 없으면 설정 URL로 중단하고 온보딩 뒤 같은 명령으로 재개된다.
- `workers.dev`가 기본이지만 인터랙티브에서 custom domain을 선택할 수 있다.
- 같은 명령을 재실행하면 일부 완료된 원격 상태에 수렴한다.
- 인프라와 D1 mutation은 같은 Application Deploy workflow의 전체 validation 성공 뒤에만 시작한다.
- 역할 그룹 구성원 변경은 Owner 경로에서만 실행되고 native session revoke와 D1 audit을 남긴다.
- token이 파일, process argument, stdout이나 Git 기록에 존재하지 않는다.
- Actions 완료와 local lifecycle fast-forward까지 기다린 뒤 production URL을 출력한다.
- destroy 완료 뒤 lifecycle이 `destroyed`로 동기화되고, 재배포하면 다시 `deployed`로 수렴한다.

### Agent

- `pnpm cli help --all --json`만으로 명령과 입력을 발견할 수 있다.
- 비-TTY에서 프롬프트나 브라우저를 열지 않는다.
- 모든 오류가 안정적인 code, exit code와 해결 hint를 가진다.
- CLI가 시작하는 위험한 외부 변경은 계획을 먼저 출력하고 `--yes` 없이 실행되지 않는다. 별도로 허용된 `main` 직접 push는 Application Deploy workflow 실행 자체에 대한 승인으로 취급한다.

### Package verification

- Package CI는 생성 CLI 단위 검증과 local tarball을 사용한 독립 프로젝트 생성 smoke를 수행한다.
- Package Publish는 npm publish와 GitHub Release 뒤 공개 registry의 정확한 package version으로 독립 프로젝트 생성과 `pnpm check`를 자동 실행한다.
- canonical 전용 Package CI와 Package Publish workflow는 생성 프로젝트에 포함되지 않는다.

## 11. 참고 모델

- 로컬 참조 프로젝트 `finetension/toss-openapi-cli`의 JSON-first·CLI-authoritative 설계
- [Supabase CLI 시작 흐름](https://supabase.com/docs/guides/local-development/cli/getting-started)
- [Supabase local/linked workflow](https://supabase.com/docs/guides/local-development/cli-workflows)
