# Project guide

This repository is the Create Admin App monorepo and canonical Cloudflare-native scaffold for small, trusted teams that build an internal management system with AI assistance.

## Source of truth

- Product scope and non-goals: `docs/specs/product-requirements.md`
- End-to-end developer journey and command boundaries: `docs/specs/developer-experience.md`
- Local development and architecture: `docs/handbook/development.md`
- Database lifecycle and operations: `docs/handbook/deployment.md`
- npm package publishing: `docs/handbook/publishing.md`

## Working rules

- One repository, company, deployment, and D1 database form one system. Do not add tenancy, workspaces, or `workspace_id` without a new product decision.
- Cloudflare Access groups and path applications are the authorization boundary for Owner, Admin, and Member roles plus explicit public routes. D1 stores audit actors and changes, not role state.
- Add business capabilities as explicit FSD slices, API routes, contracts, and D1 migrations. Do not create generic record/custom-field/module-builder abstractions.
- Web product layers import UI only through `src/web/shared/ui`. Prefer HeroUI defaults and composition; Tailwind utilities are for layout only.
- Product CLI remote D1 mutation, Worker deployment, and Access infrastructure changes run only in guarded GitHub Actions. The only runtime Cloudflare mutation is the audited Owner API for project group membership and native session revoke. Tests use an ephemeral local D1.
- Never rewrite or drop deployed data in a migration without a reviewed data-retention and transformation plan.
- Keep the repository root independently usable as the canonical generated project. Code under `packages/create-admin-app` may consume a snapshot of the root, but generated projects must not depend on workspace packages.
- Project creation completes and verifies a local project first. GitHub and Cloudflare connection are delegated to the generated project's `pnpm cli deploy`; local code may orchestrate GitHub, but the product CLI performs Cloudflare production mutation only in guarded GitHub Actions.
- Treat `config.toml` as the Git-tracked source for non-secret project and deployment targets. Keep tokens in the OS credential store and GitHub repository Actions secrets.
- Keep secret-scan exceptions precise, justified, and Git-tracked. Do not add a runtime flag that skips secret scanning.

## Commands

```bash
pnpm dev
pnpm check
pnpm cli doctor
pnpm cli status
pnpm run create --help
```

### Generator work

Read `docs/specs/product-requirements.md`, `docs/specs/developer-experience.md`, and `docs/handbook/development.md` before changing `packages/create-admin-app`, the template snapshot rules, prompts, credential handling, or generated project defaults. Verify changes by generating into a temporary directory outside this workspace.

### Product work

Read `docs/specs/product-requirements.md` when changing product boundaries, authentication, common-core scope, or the Beestory reference implementation.
Update the PRD before implementing a decision that changes those boundaries.

### Web work

Read `docs/handbook/development.md` when adding React pages, FSD slices, HeroUI wrappers, API contracts, or Worker routes.
Keep domain code out of `shared`; shared UI must not encode product-specific behavior.

### Data and deployment work

Read `docs/handbook/deployment.md` before changing D1 migrations, deployment state, Wrangler configuration, or GitHub Actions.
Remote mutations require the documented CI guards; do not bypass them from a local shell.

### Package publishing work

Read `docs/handbook/publishing.md` before changing package versions, npm release tags, trusted publishing, or `.github/workflows/package-publish.yml`. Do not run `npm publish` from a local shell.
