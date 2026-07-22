# 배포와 데이터 핸드북

## 불변 조건

- 배포 하나에는 기준 D1 하나만 둔다.
- 첫 배포 전에는 local D1으로 개발한다.
- 배포 후 앱 개발은 원격 D1을 사용한다.
- 원격 migration과 Worker 배포는 CI/CD에서만 수행한다.
- 운영 복구와 인프라 철거도 CI/CD에서만 수행한다.
- 모든 운영 migration 전에 배포 워크플로가 D1을 export한다.
- 테스트는 임시 local D1만 사용하고 운영 DB를 사용하지 않는다.
- 실제 인프라 상태는 Cloudflare가 기준이고 Git은 민감정보 없는 생명주기만 추적한다.

## GitHub 설정

운영 저장소는 private로 유지하고 보호된 `production` Environment를 만든다. Deploy, Operations, Maintenance job은 repository visibility가 private일 때만 실행된다. 공개 Create Admin App 모노레포는 소스·CI·npm 배포용이며 production 자격 증명을 등록하지 않는다.

`deploy.yml`이 첫 성공 배포 뒤 `infra/lifecycle.json`을 자동 커밋할 수 있도록 workflow의 `contents: write`를 허용하고 `main` 보호 규칙에서 GitHub Actions bot의 해당 커밋을 허용한다. 그 push는 `GITHUB_TOKEN` 특성상 새 CI 실행을 만들지 않으므로 lifecycle 변경은 테스트된 CLI가 한 필드만 갱신한다.

Variables:

- `PLATFORM_NAME`
- `PLATFORM_DOMAIN`: 비워두면 `<service>.<account>.workers.dev` 사용
- `PLATFORM_SUBDOMAIN`: 커스텀 도메인의 prefix; 비우면 정규화된 서비스명 사용
- `PLATFORM_ALLOWED_EMAILS`: 쉼표로 구분한 이메일
- `CLOUDFLARE_ACCOUNT_ID`

Secrets:

- `CLOUDFLARE_API_TOKEN`
- 메인 token과 분리할 때만 `CLOUDFLARE_ACCESS_API_TOKEN`

생성 경험은 계정 선택과 Zone 조회를 단순화하기 위해 사용자가 제공한 account-wide Cloudflare API token 하나를 로컬 OS credential store와 GitHub `production` Environment에 등록한다. 저장소 파일에는 token을 기록하지 않는다. token에는 Workers Scripts, D1, Access Apps and Policies와 커스텀 도메인을 선택한 경우 Zone·route 권한이 필요하다. Access 로그인은 별도 OAuth secret이 필요 없는 One-time PIN을 기본으로 하고 `allowedEmails` 정책에 포함된 주소에만 코드를 보낸다. 공통 기반은 R2를 사용하지 않는다.

공개 저장소로 변경하면 기존 Actions run, D1 backup/export, Worker log artifact가 읽기 권한을 가진 사용자에게 노출될 수 있다. 이 데이터를 보존하는 다른 private 저장소 또는 비공개 storage를 준비하지 않았다면 운영 저장소를 public으로 변경하지 않는다.

## 워크플로

- `ci.yml`: 모든 PR과 `main` push를 검증하고 임시 local D1에 전체 migration을 적용
- `deploy.yml`: 보호된 수동 배포. 설정 생성, 자격 증명 진단, D1 백업·migration, Worker 배포·검증, lifecycle 자동 커밋, backup artifact 업로드
- `operations.yml`: 보호된 수동 상태 조회, D1 export 또는 30·60·120초 Worker 로그 수집. schema와 앱 데이터를 변경하지 않음
- `maintenance.yml`: 보호된 D1 restore 또는 인프라 destroy. `main`, production Environment, 정확한 서비스명 확인과 사전 D1 backup을 강제

제품 책임자가 자동 `main` 배포를 명시적으로 승인하기 전까지 배포는 수동으로 유지한다.

GitHub Actions가 운영 작업의 사용자 인터페이스다. TypeScript CLI는 모든 workflow가 공유하는 자동화 엔진으로 유지하지만 팀원이 로컬에서 원격 변경 명령을 실행하지 않는다. 임의 shell 문자열을 받는 범용 workflow를 만들지 않고 각 operation과 입력을 명시한다.

### 안전 운영

`Safe production operation` workflow에서 실행한다.

- `status`: Worker, D1, Access와 custom domain 상태 조회
- `export`: 전체 운영 D1 SQL을 artifact로 생성하고 30일 보관
- `logs`: 선택한 상태와 검색어로 Worker tail을 제한시간 수집하고 artifact로 7일 보관

### 복구

1. `Safe production operation`의 `export` 또는 배포 전 backup이 성공한 Actions run ID와 artifact 이름을 확인한다.
2. `Protected production maintenance`에서 `restore`를 선택한다.
3. `confirmation`에 정규화된 서비스 이름을 정확히 입력하고 `backup_run_id`, `backup_artifact`를 지정한다.
4. workflow는 artifact 안에 SQL 파일이 정확히 하나인지 확인하고, 현재 D1을 다시 backup한 뒤 교체 복원한다.

### 철거

`Protected production maintenance`에서 `destroy`를 선택하고 정규화된 서비스 이름을 정확히 입력한다. 기본값은 Access와 Worker만 삭제하고 D1은 보존한다. `include_data`를 명시적으로 선택한 경우에만 사전 export 뒤 D1까지 삭제한다. 철거 후 다시 운영하려면 `Deploy production`을 실행한다.

## 인프라 상태 원칙

- `infra/lifecycle.json`은 `predeploy` 또는 `deployed`만 저장한다.
- Cloudflare 계정 ID, D1 ID, Access AUD, 검증 응답은 Git과 로컬 state 파일에 저장하지 않는다.
- CI는 배포할 때 이름 기준으로 실제 Cloudflare 리소스를 다시 조회한다.
- 생성된 운영 Wrangler config는 CI의 `.wrangler/runtime`에만 잠시 존재하고 배포 명령 종료 시 제거한다.
- 첫 배포 전체가 성공하면 workflow가 lifecycle을 `deployed`로 바꾸고 `chore(infra): mark production deployed`를 `main`에 push한다.
- 자동 커밋 push가 보호 규칙이나 동시 변경으로 거부되면 workflow는 실패한다. 인프라는 이미 배포됐을 수 있으므로 원인을 해결하고 workflow를 다시 실행해 Git 상태를 맞춘다.
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

위 명령은 개발, 진단과 read-only 조회를 위한 표면이다. 배포, 운영 D1 import·migration, 인프라 철거는 로컬에서 실행하지 않는다. CLI의 capability 환경변수는 GitHub workflow만 설정한다.

첫 배포 전 local D1에서만 사용하는 명령:

```bash
pnpm cli db migrate
pnpm cli db seed
pnpm cli db reset
```

CI guard 환경변수를 로컬에서 설정해 우회하지 않는다. 이 변수들은 사용자 옵션이 아니라 워크플로 capability다.

## Migration 규칙

- 배포 이후 migration은 append-only다.
- 실제 도메인을 나타내는 명시적인 테이블과 컬럼을 사용한다.
- 파괴적인 migration에는 백업, 보존 결정, 데이터 변환 계획, 리뷰가 필요하다.
- 이번 기반 재정리는 이미 배포된 DB의 레거시 테이블을 삭제하지 않는다. 새 프로젝트만 현재의 작은 기반 schema로 시작하며 레거시 정리는 별도 migration으로 검토한다.
- schema 변경과 이를 사용하는 코드는 함께 배포한다.

## 백업 보관

배포 전, 운영 export, restore 전, destroy 전 SQL export는 private 운영 저장소의 artifact로 30일간 보관한다. Worker 로그 snapshot은 7일간 보관한다. 배포 state artifact는 만들지 않는다. GitHub Actions run과 artifact가 누가 언제 실행했는지에 대한 운영 이력이다.
