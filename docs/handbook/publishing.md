# npm 배포 핸드북

`@finetension/create-admin-app`은 로컬에서 publish하지 않는다. GitHub의 `Package Publish` workflow가 검증, 버전 커밋, tag, npm publish와 GitHub Release를 한 번에 수행한다.

## Trusted Publishing

패키지는 npm에 공개되어 있고 GitHub Actions OIDC Trusted Publisher를 사용한다. 장기 npm access token이나 `NPM_TOKEN` repository secret을 만들지 않는다.

npm package의 Trusted Publisher 설정은 다음과 같다.

- Provider: GitHub Actions
- Organization: `finetension`
- Repository: `create-admin-app`
- Workflow filename: `package-publish.yml`
- Environment: `npm`
- Allowed action: `npm publish`

GitHub의 보호된 `npm` Environment는 사람의 release 승인에 사용한다. workflow가 release commit과 tag를 push할 수 있도록 `main` 보호 규칙에서 GitHub Actions bot의 해당 push를 허용한다.

Trusted Publisher는 npm CLI 11.5.1 이상, Node.js 22.14 이상, GitHub-hosted runner와 `id-token: write` 권한을 요구한다. workflow는 이 조건을 검사하고 OIDC로 publish한다.

GitHub 저장소가 public이면 npm이 provenance attestation을 자동으로 추가한다. private 저장소에서도 Trusted Publishing은 동작하지만 provenance는 생성되지 않고 npm 사용자가 repository source를 열람할 수 없다.

## 배포

`Package Publish` workflow에서 변경 성격에 따라 하나를 선택한다.

- `patch`: 호환되는 오류 수정
- `minor`: 호환되는 기능 추가
- `major`: 호환되지 않는 변경
- `initial`: 현재 `package.json` 버전의 publish가 아직 완료되지 않았을 때만 재시도

workflow는 이미 npm에 존재하는 버전을 거부한다. publish 전에 루트 `pnpm check`와 실제 tarball 구성을 검증하며, release commit과 `create-admin-app-v<version>` tag를 `main`에 push한 뒤 검증한 동일 tarball을 npm에 publish한다.

publish와 GitHub Release 생성이 끝나면 별도 `registry-smoke` job이 공개 registry에서 정확한 새 버전을 기다린다. workspace archive가 아니라 `pnpm create @finetension/admin-app@<version>`으로 독립 프로젝트를 생성하고 package provenance version, 단일 초기 commit, clean worktree와 `pnpm check`를 검증한다. 공개 직후의 의도된 package만 pnpm `minimumReleaseAgeExclude` option으로 정확한 버전까지 좁혀 허용하며 생성 프로젝트의 dependency lockfile 검사는 그대로 유지한다.

## 실패 복구

- 버전 커밋이나 tag 전에 실패하면 같은 선택으로 다시 실행한다.
- commit과 tag push 뒤 npm publish가 실패했다면 원인을 해결하고 `initial`로 다시 실행한다. 기존 tag가 현재 `main` commit을 가리킬 때만 재사용한다.
- npm publish는 성공했지만 GitHub Release 생성만 실패했다면 같은 workflow를 다시 publish하지 말고 해당 tag에서 GitHub Release만 수동 생성한다.
- npm publish와 GitHub Release는 성공했지만 `registry-smoke`가 실패하면 기존 버전을 다시 publish하지 않는다. 공개 package의 실패 원인을 확인하고 수정한 다음 patch release를 만든다.
- npm에 이미 존재하는 버전은 삭제하거나 덮어쓰지 않고 다음 patch 버전을 배포한다.
