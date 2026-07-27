# 배포와 데이터 핸드북

> `config.toml`, 로컬 deploy orchestration과 `main` 자동 배포 계약은 [Developer Experience](../specs/developer-experience.md)가 기준이며 이 저장소의 CLI와 workflow가 해당 계약을 구현한다.

## 불변 조건

- 배포 하나에는 기준 D1 하나만 둔다.
- 첫 배포 전에는 local D1으로 개발한다.
- 배포 후 앱 개발은 원격 D1을 사용한다.
- 원격 migration과 Worker 배포는 CI/CD에서만 수행한다.
- 인프라 철거도 CI/CD에서만 수행한다.
- 테스트는 임시 local D1만 사용하고 운영 DB를 사용하지 않는다.
- 실제 인프라 상태는 Cloudflare가 기준이고 Git은 민감정보 없는 프로젝트 대상과 생명주기만 추적한다.

## GitHub 설정

운영 저장소는 private를 기본으로 하고 `--public`을 명시한 경우 public도 지원한다. 두 visibility 모두 repository Actions secret과 같은 Application Deploy·Application Destroy job을 사용하므로 GitHub Free private 저장소도 지원한다. 공개 Create Admin App 기준 모노레포 자체는 소스·CI·npm 배포용이며 production 자격 증명을 등록하지 않는다.

`application-deploy.yml`이 첫 성공 배포 뒤 `infra/lifecycle.json`을 자동 커밋할 수 있도록 workflow의 `contents: write`를 허용한다. `main` ruleset을 별도로 사용하는 저장소는 GitHub Actions bot의 해당 커밋을 허용해야 한다. 그 push는 `GITHUB_TOKEN` 특성상 새 CI 실행을 만들지 않으므로 lifecycle 변경은 테스트된 CLI가 한 필드만 갱신한다.

Git 추적 루트 `config.toml`:

- `[project]`: 표시 이름과 slug
- `[access]`: 제거할 수 없는 Bootstrap Owner 이메일
- `[github]`: owner, repository, visibility
- `[cloudflare]`: account ID와 `workers.dev` 또는 custom domain route

GitHub Actions는 이 파일을 읽어 배포 대상을 결정한다. 같은 값을 GitHub Actions variable로 복제하지 않는다.

Secrets:

- `CLOUDFLARE_API_TOKEN`

첫 배포 경험은 계정 선택과 Zone 조회를 단순화하기 위해 계정 소유 Cloudflare Account API Token 하나를 계정 단위 OS credential store와 GitHub repository Actions secret에 등록한다. 저장소 파일이나 로그에는 token을 기록하지 않는다. `pull_request`와 fork job은 이 secret을 참조하지 않고 `main` Application Deploy·Application Destroy job만 process environment로 전달한다. Deploy는 같은 값을 Worker의 `ACCESS_MANAGEMENT_TOKEN` secret으로 주입한다. GitHub secret은 Worker에서 자동으로 보이지 않으므로 이 주입은 배포 단계의 명시적인 책임이다.

Token은 다음 순서로 만든다.

1. [Cloudflare Account API Tokens](https://dash.cloudflare.com/?to=/:account/api-tokens)를 열고 배포할 계정을 선택한다.
2. `Create Token`에서 기본 `Write all resources` 템플릿을 선택한다.
3. 템플릿의 권한과 전체 계정·Zone 리소스 범위를 수정하지 않는다.
4. 이 프로젝트의 지속적인 CI/CD 자격 증명이므로 만료일과 IP 제한은 비워 둔다.
5. 생성 직후 한 번만 표시되는 `cfat_` token을 프로젝트 CLI에 붙여 넣는다.

저장 credential은 `pnpm cli auth status`로 값 노출 없이 확인하고 `pnpm cli auth login`으로 검증 후 교체한다. 더 이상 로컬 read-only 조회나 배포 orchestration에 사용하지 않으면 `pnpm cli auth logout`으로 OS credential store에서 제거한다. GitHub repository secret은 다음 deploy가 현재 local credential로 다시 설정하며 Cloudflare Dashboard token 폐기는 별도로 수행한다.

이 템플릿은 Workers Scripts, D1, Workers KV, Access와 Zone·route를 포함해 계정과 Zone 전반을 생성·변경·삭제할 수 있다. 개별 권한을 매번 찾지 않는 대신 유출 시 영향 범위가 큰 의도적인 운영 선택이다. 다른 Account API Token의 목록·변경은 별도 권한이며 이 프로젝트의 배포에는 필요하지 않다. 프로젝트 CLI는 token을 보관하기 전에 필요한 API를 읽기 전용으로 확인하고 로컬 파일에는 남기지 않는다. 의심스러운 노출이나 팀 운영 변경이 있으면 Cloudflare에서 token을 교체하고 OS credential store와 GitHub repository secret을 함께 갱신한다.

Access 로그인은 별도 OAuth secret이 필요 없는 [One-time PIN](https://developers.cloudflare.com/cloudflare-one/integrations/identity-providers/one-time-pin/)을 기본으로 한다. 로그인 허용 대상은 Owner·Admin·Member Access 그룹의 구성원이다. 신규 Zero Trust organization은 OTP를 자동으로 만들지 않으므로 Application Deploy workflow가 기존 identity provider를 보존하면서 OTP를 멱등하게 추가한다. 공통 기반은 R2를 사용하지 않는다.

Zero Trust organization 자체가 없는 account는 Dashboard에서 [team name과 plan을 한 번 설정](https://developers.cloudflare.com/learning-paths/clientless-access/initial-setup/create-zero-trust-org/)해야 한다. 인터랙티브 deploy는 onboarding URL을 열고 완료 뒤 read-only로 재검사한다. machine mode는 `cloudflare_zero_trust_setup_required`, URL과 재실행 hint를 출력하고 외부 변경 전에 종료한다.

Cloudflare Access가 운영 인증·인가 게이트웨이다. 배포는 Bootstrap Owner를 Owner 그룹에 보장하고 동적 구성원은 보존한다. Base application은 Owner·Admin·Member, Admin application은 Owner·Admin, Owner application은 Owner 그룹을 허용한다. Public application은 역할이 아니라 데이터가 없는 빌드 산출물 `/assets/*`와 명시적 공개 경로 `/public/*`, `/api/public/*`만 bypass하는 접근 범위다. 역할별 HTML 경로와 API는 계속 해당 Access application이 보호한다. Access API는 빈 `include` 그룹을 허용하지 않으므로 멤버가 없는 역할에는 로그인할 수 없는 예약된 `example.com` placeholder 이메일 하나를 둔다. 배포와 Owner API는 이 규칙을 자동으로 정규화하고 멤버 목록·역할 판정·상태의 인원수에서는 제외한다. Worker 런타임에는 assertion 검증에 필요한 Access team domain과 Base·Admin·Owner audience를 전달하고 이메일이나 역할 목록은 전달하지 않는다. Worker는 검증된 이메일을 사용자 식별과 audit에 사용한다.

Owner 전용 API는 `ACCESS_MANAGEMENT_TOKEN`으로 서버에 고정된 세 그룹만 조회·수정하고 대상 사용자의 Access 세션을 native revoke한다. Cloudflare의 per-user revoke는 같은 account의 Access application 전체에 적용되므로 UI가 이 범위를 명시한다. account ID와 group ID를 클라이언트 입력으로 받지 않는다. 이 런타임 mutation은 D1 감사 로그를 남기는 좁은 제품 행위이며 D1 migration, Worker·Access application 배포와 철거의 Actions-only 원칙을 완화하지 않는다.

public 저장소의 source, `config.toml`에 기록된 Bootstrap Owner 이메일과 Actions 실행 기록은 공개 범위다. 동적으로 추가한 역할 멤버 이메일은 Git이나 배포 plan에 출력하지 않는다. Application Deploy와 Application Destroy는 D1 데이터, Worker 요청·응답 또는 live log를 Actions log와 artifact에 기록하지 않는다. GitHub가 secret 값을 마스킹하더라도 명령 인자, 파일 또는 별도 변형값으로 노출되지 않도록 사전 검사한다.

## 워크플로

- `application-ci.yml`: 모든 PR과 `main` push를 검증하고 임시 local D1에 전체 migration을 적용
- `application-deploy.yml`: `main` push 또는 수동 dispatch로 실행. Cloudflare secret 없는 validation job이 `pnpm check`를 통과해야 mutation job이 설정과 자격 증명 진단, D1 migration, Worker·OTP·Access 배포와 검증, lifecycle 자동 commit을 수행
- `application-destroy.yml`: guarded 인프라 destroy. `main`, 허용 event, 작업별 capability와 정확한 서비스명 확인을 강제

GitHub Actions가 제품이 지원하고 감사하는 Cloudflare 운영 mutation 실행 환경이다. 로컬 `pnpm cli deploy`는 전체 계획을 확인한 뒤 `config.toml` 갱신, 검증, secret 검사, Git commit·push, GitHub repository secret 설정, workflow 결과 대기와 lifecycle fast-forward를 orchestration한다. Cloudflare API를 변경하는 단계는 실행하지 않는다. Application Deploy 안에서도 validation과 mutation을 별도 job으로 분리하고 mutation은 validation을 `needs`로 요구해, 같은 push의 별도 Application CI 완료 시점과 관계없이 실패한 변경이 운영에 반영되지 않게 한다.
GitHub API의 안전한 read 요청이 timeout 또는 5xx로 실패하면 CLI가 짧게 최대 3회 재시도한다. 반복 실패 시에는 완료된 commit·push·workflow 상태를 유지하고 같은 제품 CLI 명령의 재실행을 안내한다. repository 조회 실패를 곧바로 repository 부재로 간주하지 않는다.
workflow의 Cloudflare 단계는 숨겨진 `pnpm cli internal deploy` 또는 `pnpm cli internal destroy`를 호출한다. 내부 명령은 GitHub Actions 환경, `main` ref, 허용 event와 작업별 capability가 모두 일치할 때만 실행하고 process의 `CLOUDFLARE_API_TOKEN`만 사용한다. OS credential store의 같은 write token 때문에 Actions는 token 자체의 보안 경계가 아니며, CLI가 지원하는 mutation·감사 경계다.

새 GitHub repository는 repository token secret을 먼저 설정한 뒤 첫 `main` push를 실행해 자격 증명 없는 첫 deploy가 시작되는 race를 피한다. 임의 shell 문자열을 받는 범용 workflow를 만들지 않고 각 operation과 입력을 명시한다.

Deploy smoke check는 Cloudflare API에서 Worker deployment가 active인지 확인하고, 인증되지 않은 private production URL이 앱 응답 대신 Access 로그인 또는 거부 응답을 반환하며 public health 경로는 접근 가능한지 확인한다. 인증된 운영 데이터 요청이나 CI용 Access service token은 공통 기반에 두지 않는다.

### Read-only 조회

`pnpm cli doctor`는 로컬 도구, 설정, lifecycle, Git과 인증 준비 상태를 진단한다. `pnpm cli status`는 Worker, D1, Access와 custom domain 상태를 Cloudflare에서 직접 조회하고 Git 추적 설정과의 drift를 표시한다. JSON 결과의 redirect location은 query와 fragment를 제거하며 Cloudflare Access challenge 경로는 opaque segment를 `[redacted]`로 바꾼다. `pnpm cli logs`는 현재 터미널에만 Worker live log를 표시한다. TTY에서는 `Ctrl-C`까지 유지하고 비인터랙티브·에이전트 환경에서는 기본 30초 뒤 종료하며 `--duration`으로 재정의할 수 있다. 세 명령은 원격 상태를 변경하지 않고 GitHub Actions나 artifact를 만들지 않는다.

machine mode의 `logs`는 완전한 Worker 이벤트마다 stdout에 NDJSON 한 줄을 즉시 출력하고 마지막에 실행 시간, 이벤트 수와 종료 이유를 담은 summary event를 출력한다. Wrangler의 여러 줄 JSON은 한 이벤트로 재조립하며 진행 상태는 stderr로 분리한다.

배포 후 local Vite Worker는 canonical remote D1 binding을 사용하므로 첫 local development에 Cloudflare 계정 로그인이 필요할 수 있다. TTY의 `pnpm cli dev`는 Wrangler의 브라우저 로그인을 시작한다. machine mode는 브라우저를 열지 않고 `access_login_required`와 `pnpm cli dev --interactive` hint를 반환한다. 이 경로는 실제 Access 역할 세션을 통과하지 않고 기본 Owner actor를 사용하며, 별도 remote-development service token은 만들지 않는다.

### 철거

`application-destroy.yml`에서 `destroy`를 선택하고 정규화된 서비스 이름을 정확히 입력한다. 기본값은 경로별 Access application·policy와 Worker만 삭제하고 D1과 Owner·Admin·Member 그룹 구성원을 보존한다. `include_data`를 명시적으로 선택하면 D1과 역할 그룹도 복구 보장 없이 삭제한다. 성공한 workflow는 lifecycle을 `destroyed`로 커밋하고 로컬 명령은 이 commit을 fast-forward한다. 철거 후 다시 운영하면 Application Deploy가 보존한 역할 그룹을 재사용한다.

## 인프라 상태 원칙

- `infra/lifecycle.json`은 `predeploy`, `deployed` 또는 `destroyed`만 저장한다.
- Cloudflare account ID와 route는 비민감 배포 대상으로 `config.toml`에 저장한다.
- D1 ID, Access AUD와 검증 응답은 Git과 로컬 state 파일에 저장하지 않는다.
- CI는 배포할 때 이름 기준으로 실제 Cloudflare 리소스를 다시 조회한다.
- 생성된 운영 Wrangler config는 CI의 `.wrangler/runtime`에만 잠시 존재하고 배포 명령 종료 시 제거한다.
- 배포 전체가 성공하면 workflow가 lifecycle을 `deployed`로 바꾸고 필요할 때 `chore(infra): mark production deployed`를 `main`에 push한다.
- 철거 전체가 성공하면 workflow가 lifecycle을 `destroyed`로 바꾸고 필요할 때 `chore(infra): mark production destroyed`를 `main`에 push한다. D1 보존 여부는 이 상태와 별개이며 둘 다 정상이다.
- 자동 커밋 push가 보호 규칙이나 동시 변경으로 거부되면 workflow는 실패한다. 인프라는 이미 배포됐을 수 있으므로 원인을 해결하고 workflow를 다시 실행해 Git 상태를 맞춘다.
- 로컬 `pnpm cli deploy`는 성공한 workflow 뒤 `origin/main`을 fetch하고 lifecycle commit을 `git merge --ff-only origin/main`으로 반영한다. fast-forward가 불가능하면 원격 배포를 유지한 채 partial success, 복구 명령과 종료 코드 `4`를 반환한다.
- 리소스를 의도적으로 철거하거나 새 시스템으로 되돌리는 lifecycle 변경은 자동화하지 않고 별도 리뷰한다.

## 로컬 명령

일상적으로 안전한 명령:

```bash
pnpm dev
pnpm check
pnpm cli doctor
pnpm cli status
pnpm cli logs
```

배포를 요청하고 완료를 기다리는 명령:

```bash
pnpm cli deploy
pnpm cli deploy --dry-run --json
pnpm cli deploy --yes --message "feat: deploy sales dashboard"
```

이 명령의 로컬 단계는 Git과 GitHub만 변경한다. 운영 D1 migration, Worker·Access application·policy mutation과 인프라 철거는 제품 CLI에서 GitHub Actions 밖에 노출하지 않는다. CLI의 Cloudflare mutation capability 환경변수는 GitHub workflow만 설정한다. Owner 전용 런타임 구성원 변경은 이 CLI 표면과 분리한다.
commit할 변경이 있으면 TTY에서 message를 입력받고 비인터랙티브에서는 `--message`를 요구한다. clean worktree 재배포는 새 commit 없이 workflow를 요청한다.
secretlint 예외는 `.secretlintignore`에 좁은 경로 패턴과 사유 주석을 함께 기록한다. ignore 변경은 배포 계획에 표시하며 로컬과 Actions가 같은 규칙을 실행한다. secret 검사를 건너뛰는 CLI option은 두지 않는다.
Actions가 실패하면 commit·push와 이미 완료된 원격 상태를 유지한다. CLI는 실패한 job·step, run URL과 재실행 방법을 출력하며 자동 retry나 revert를 수행하지 않는다. 수정 후 같은 명령을 실행하면 실제 원격 상태를 다시 조회해 남은 단계로 수렴한다. Actions는 성공했지만 local lifecycle fast-forward가 실패하면 `deployed: true`, `local_sync: "failed"`를 구분해 보고한다.

운영 리소스 철거를 요청하는 공개 명령은 `pnpm cli destroy`다. 별도 `infra` 명령 그룹은 두지 않는다. 이 명령은 삭제 대상과 데이터 보존 계획을 먼저 표시한 뒤 guarded Application Destroy workflow를 요청하고 완료와 lifecycle commit의 local fast-forward를 기다리며, 로컬에서 Cloudflare 리소스를 직접 삭제하지 않는다.

TTY에서는 최종 확인으로 project slug를 직접 입력한다. 비인터랙티브에서는 `pnpm cli destroy --yes --confirm <slug>`를 사용하고 D1과 역할 그룹까지 삭제할 때만 `--include-data`를 추가한다. slug가 `config.toml`과 일치하지 않으면 workflow를 요청하지 않는다.

첫 배포 전 local D1에서만 사용하는 명령:

```bash
pnpm cli db migrate
pnpm cli db seed
pnpm cli db reset
```

CI guard 환경변수를 로컬에서 설정해 우회하지 않는다. 이 변수들은 사용자 옵션이 아니라 워크플로 capability다.

lifecycle이 `deployed` 또는 `destroyed`인 프로젝트의 Cloudflare account는 `--reconfigure`로 바꾸지 않는다. account 이동은 새 기준 D1과 데이터 이전을 뜻하므로 새 프로젝트와 검토된 이전 계획으로만 수행한다. 같은 account의 GitHub repository, visibility 또는 route 변경만 일반 reconfigure 범위다.

## Migration 규칙

- 배포 이후 migration은 append-only다.
- 실제 도메인을 나타내는 명시적인 테이블과 컬럼을 사용한다.
- 파괴적인 migration에는 보존 결정, 데이터 변환 계획과 리뷰가 필요하다.
- 이번 기반 재정리는 이미 배포된 DB의 레거시 테이블을 삭제하지 않는다. 새 프로젝트만 현재의 작은 기반 schema로 시작하며 레거시 정리는 별도 migration으로 검토한다.
- schema 변경과 이를 사용하는 코드는 함께 배포한다.

## 운영 기록

배포 state와 Worker log artifact는 만들지 않는다. GitHub Actions run이 배포와 철거를 누가 언제 실행했는지에 대한 운영 이력이다.
