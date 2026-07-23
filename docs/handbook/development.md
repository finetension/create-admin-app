# 개발 핸드북

## 저장소 구성

공개 저장소 루트는 Create Admin App이 복사하는 기준 템플릿이자 로컬·CI 검증 앱이다. `packages/create-admin-app`은 npm에 공개할 생성 CLI다. 생성 패키지는 배포 전에 루트의 Git 추적 파일 중 프로젝트에 필요한 파일만 snapshot으로 포함하며 `packages` 자체는 생성 결과에 복사하지 않는다. 실제 Cloudflare 운영 배포는 생성한 private 저장소에서 검증한다.

생성 CLI와 템플릿 변경은 같은 커밋에서 검토한다. CI는 생성 패키지 자체 테스트뿐 아니라 임시 디렉터리에 독립 프로젝트를 만든 뒤 그 프로젝트의 install과 check를 실행한다. 생성된 프로젝트는 이 모노레포나 상위 workspace package에 의존하면 안 된다.

생성 CLI는 Cloudflare의 Create Cloudflare 패턴을 이 제품 범위에 맞게 축소한 구조를 따른다.

- `src/cli`: 인자 해석, 대화형 입력과 `CreateContext` 생성
- `src/core`: 생성 상태와 `scaffold → configure → connect → finalize` phase orchestration
- `src/phases`: 템플릿 복사, 앱 초기화, Git·원격 연결, 완료 안내
- `src/integrations`: Cloudflare, GitHub, OS credential store 경계
- `src/template`: canonical root snapshot 복사와 프로젝트별 변환

phase는 하나의 `CreateContext`를 순서대로 전달하며 앞 단계가 실패하면 이후 외부 변경을 실행하지 않는다. 단일 canonical template을 유지하므로 다중 template registry나 선택형 업무 installer는 두지 않는다. `packages/create-admin-app/template`은 Git으로 추적하지 않는 build artifact다. `pnpm run generator:check`, 로컬 생성 명령과 npm `prepack`은 항상 canonical root에서 snapshot을 새로 만들므로 복사본을 별도 source of truth로 관리하거나 커밋하지 않는다.

생성 CLI의 기반 경계는 검증된 전용 라이브러리로 유지한다. 명령 정의와 인자 해석은 `citty`, 대화형 입력은 `@clack/prompts`, 외부 프로세스 실행은 `execa`, HTTP 요청과 응답 검증은 `ofetch`와 `zod`, OS credential store 접근은 `@napi-rs/keyring`을 사용한다. 프로젝트 파일 복사와 변환은 Node.js 표준 파일 API를 사용한다.

## 시작

```bash
pnpm install --frozen-lockfile
pnpm dev
```

새 독립 프로젝트를 만드는 공개 명령은 다음과 같다.

```bash
pnpm create @finetension/admin-app my-company
```

일상 개발자는 `pnpm dev`와 `pnpm check`만 알면 된다. TypeScript CLI는 로컬 개발 orchestration과 GitHub Actions가 함께 사용하는 내부 자동화 엔진으로 유지한다. 운영 변경은 CLI를 로컬에서 호출하지 않고 저장소의 보호된 Actions에서 실행한다.

`pnpm dev`는 DB 모드를 자동 선택한다.

- `infra/lifecycle.json`의 production이 `predeploy`이면 `local`
- 첫 성공 배포 뒤 production이 `deployed`이면 `remote`

이 파일은 민감정보나 Cloudflare 리소스 ID를 담지 않는 Git 추적 정책 상태다. 실제 Worker·D1 존재 여부는 Cloudflare가 기준이며 `pnpm cli status`로 조회한다. 생명주기 파일이 없거나 잘못되면 로컬 DB를 임의로 선택하지 않고 개발 시작을 실패시킨다.

`pnpm cli dev --database local` 또는 `--database remote`는 진단과 복구에만 사용한다. 원격 모드는 migration과 seed를 실행하지 않으며, 로컬 데이터가 조용히 분기되지 않도록 persistent local D1을 제거한다. `.wrangler`에는 로컬 에뮬레이터와 빌드의 임시 파일만 생성되며 배포 상태는 저장하지 않는다.

원격 개발 모드는 시작할 때 Cloudflare에서 서비스 이름으로 D1 ID를 조회해 `.wrangler/dev-config.jsonc`에 임시 binding을 만들고, 개발 서버가 종료되거나 시작에 실패하면 해당 파일을 제거한다. D1 ID는 Git이나 배포 상태 파일에 저장하지 않는다.

생성 CLI로 Cloudflare를 연결하면 account-wide API token 하나를 저장소 파일이 아닌 OS credential store에 보관하고 private GitHub 저장소의 `production` Environment에도 등록한다. 로컬 원격 변경은 CLI guard가 거부하며 배포·Access 변경·인프라 삭제는 보호된 Actions만 수행한다. 명시적 `--public`은 Cloudflare 연결 없는 로컬 개발용 저장소를 만든다.

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

개발 환경에서는 `allowedEmails`의 첫 이메일을 기본 사용자로 사용한다. 다른 팀원을 확인할 때는 설정에 포함된 이메일을 `X-Dev-User`로 전달한다. `X-Dev-Role`은 존재하지 않는다.
