# Create Admin App

An opinionated Cloudflare-native full-stack admin application scaffold for trusted teams building one company's internal management system with AI assistance.

It intentionally includes identity, an authenticated HeroUI shell, D1 lifecycle rules, and CI/CD safety—not generic business modules, RBAC, multi-tenancy, or a no-code record engine. The first real reference product will be Beestory sales management.

## Create a project

```bash
pnpm create @finetension/admin-app my-company
```

The generator installs dependencies, delegates application configuration to the built-in project CLI, initializes Git, and optionally creates a private GitHub repository and configures Cloudflare after explicit confirmation. Public repositories are supported for source-only, local development; production repositories remain private because operational backups and logs can contain company data.

To exercise the workspace package directly while developing this repository:

```bash
pnpm run create -- --help
```

## Develop this template

```bash
pnpm install --frozen-lockfile
pnpm dev
```

Before the first deployment, development uses local D1. After the first successful production workflow records `infra/lifecycle.json` as deployed, development binds to the canonical remote D1 and blocks local migration/seed behavior. Cloudflare remains the source of truth for actual resources; no resource IDs or deployment state are persisted locally.

```bash
pnpm check
pnpm cli doctor
pnpm cli status
```

Remote D1 migrations and Worker deployments are accepted only from protected GitHub Actions workflows in private generated repositories. This public source repository runs CI, generator verification, and npm publishing only.

The TypeScript CLI remains the shared automation engine, but production operations are invoked through GitHub Actions rather than from developer shells:

- `Deploy production`: backup, migrate, deploy, and smoke-check
- `Safe production operation`: status, export, and bounded Worker log capture
- `Protected production maintenance`: artifact-based D1 restore and confirmed infrastructure destroy

## Documentation

- [Product requirements](./docs/specs/product-requirements.md)
- [Development handbook](./docs/handbook/development.md)
- [Deployment and data handbook](./docs/handbook/deployment.md)
- [npm publishing handbook](./docs/handbook/publishing.md)

The repository uses React 19, Hono, HeroUI 3, Cloudflare Workers/D1/Access, TypeScript, Vite, Vitest, Biome, ESLint, and Steiger.

## License

[MIT](./LICENSE) © Fine Tension
