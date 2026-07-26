# Create Admin App

An opinionated Cloudflare-native full-stack admin application scaffold for trusted teams building one company's internal management system with AI assistance.

It intentionally includes identity, an authenticated HeroUI shell, D1 lifecycle rules, and CI/CD safety—not generic business modules, RBAC, multi-tenancy, or a no-code record engine. The first real reference product will be Beestory sales management.

## Create a project

```bash
pnpm create @finetension/admin-app my-company
```

Pass generator options after pnpm's `--` separator:

```bash
pnpm create @finetension/admin-app -- my-company --emails owner@example.com --json
```

The generator installs dependencies, verifies the local project, and initializes Git. If deployment is explicitly selected, it delegates GitHub and Cloudflare connection to the generated project's built-in CLI. Repositories are private by default; `--public` explicitly selects a public repository and remains deployable.

To exercise the workspace package directly while developing this repository:

```bash
pnpm run create --help
```

## Develop this template

```bash
pnpm install --frozen-lockfile
pnpm dev
```

Before the first deployment, development uses local D1. After the first successful production workflow records `infra/lifecycle.json` as deployed, development binds to the canonical remote D1 and blocks local migration/seed behavior. A successful destroy workflow records the lifecycle as destroyed, keeps local D1 disabled, and requires deploy before development resumes. Cloudflare remains the source of truth for actual resources; no resource IDs or untracked deployment progress state are persisted locally.

```bash
pnpm check
pnpm cli doctor
pnpm cli status
```

The product CLI accepts remote D1 migrations and Worker deployments only from guarded GitHub Actions workflows in generated repositories. Generated repositories keep the account token in a repository Actions secret so GitHub Free private repositories remain supported. The canonical repository separates application workflows from package validation and publishing.

The TypeScript CLI remains the shared automation engine. Production mutations are executed through GitHub Actions, while status and live logs are read directly without creating GitHub artifacts:

- `Application CI`: validate the application and ephemeral D1 migrations
- `Application Deploy`: migrate, deploy, and smoke-check
- `Application Destroy`: confirmed infrastructure destruction
- `Package CI`: validate the generator and create one independent project
- `Package Publish`: publish to npm and verify the public package

## Documentation

- [Product requirements](./docs/specs/product-requirements.md)
- [Developer experience](./docs/specs/developer-experience.md)
- [Development handbook](./docs/handbook/development.md)
- [Deployment and data handbook](./docs/handbook/deployment.md)
- [npm publishing handbook](./docs/handbook/publishing.md)

The repository uses React 19, Hono, HeroUI 3, Cloudflare Workers/D1/Access, TypeScript, Vite, Vitest, Biome, ESLint, and Steiger.

## License

[MIT](./LICENSE) © Fine Tension
