# npm 배포 핸드북

`@finetension/create-admin-app`은 로컬에서 publish하지 않는다. GitHub의 `Publish npm package` workflow가 검증, 버전 커밋, tag, npm publish와 GitHub Release를 한 번에 수행한다.

## 최초 0.1.0 배포

npm Trusted Publisher는 registry에 이미 존재하는 패키지에만 연결할 수 있으므로 최초 배포에만 bootstrap token이 필요하다.

1. npm에서 `@finetension/create-admin-app`을 publish할 수 있는 granular access token을 발급한다. 최초 publish가 2FA로 막히지 않도록 publish 권한과 bypass 2FA 조건을 확인한다.
2. GitHub에 보호된 `npm` Environment를 만들고 `NPM_TOKEN` secret을 등록한다.
3. `Publish npm package` workflow를 `initial`로 실행한다.
4. npm에서 `@finetension/create-admin-app` 패키지 설정의 Trusted Publisher를 다음 값으로 등록한다.

   - Provider: GitHub Actions
   - Organization: `finetension`
   - Repository: `create-admin-app`
   - Workflow filename: `publish-npm.yml`
   - Environment: `npm`
   - Allowed action: `npm publish`

5. Trusted Publisher 등록 뒤 GitHub `npm` Environment에서 `NPM_TOKEN`을 삭제한다.
6. npm package의 Publishing access를 `Require two-factor authentication and disallow tokens`로 바꾼다.

`Publish npm package` workflow가 release commit과 tag를 push할 수 있도록 `main` 보호 규칙에서 GitHub Actions bot의 해당 push를 허용한다.

Trusted Publisher는 npm CLI 11.5.1 이상, Node.js 22.14 이상, GitHub-hosted runner와 `id-token: write` 권한을 요구한다. workflow는 이 조건을 검사하고 장기 token이 없으면 OIDC로 publish한다.

GitHub 저장소가 public이면 npm이 OIDC publish에 provenance attestation을 자동으로 추가한다. private 저장소에서도 Trusted Publishing은 동작하지만 provenance는 생성되지 않고 npm 사용자가 repository source를 열람할 수 없다.

## 이후 배포

`Publish npm package` workflow에서 변경 성격에 따라 하나를 선택한다.

- `patch`: 호환되는 오류 수정
- `minor`: 호환되는 기능 추가
- `major`: 호환되지 않는 변경
- `initial`: 현재 `package.json` 버전을 그대로 재시도할 때만 사용

workflow는 이미 npm에 존재하는 버전을 거부한다. publish 전에 루트 `pnpm check`와 실제 tarball 구성을 검증하며, release commit과 `create-admin-app-v<version>` tag를 `main`에 push한 뒤 npm에 publish한다. publish 이후에는 같은 버전을 다시 사용할 수 없다.

## 실패 복구

- 버전 커밋이나 tag 전에 실패하면 같은 선택으로 다시 실행한다.
- commit과 tag push 뒤 npm publish가 실패했다면 원인을 해결하고 `initial`로 다시 실행한다. 기존 tag가 현재 `main` commit을 가리킬 때만 재사용한다.
- npm publish는 성공했지만 GitHub Release 생성만 실패했다면 같은 workflow를 다시 publish하지 말고 해당 tag에서 GitHub Release만 수동 생성한다.
- npm에 이미 존재하는 버전은 삭제하거나 덮어쓰지 않고 다음 patch 버전을 배포한다.
