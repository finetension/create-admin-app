# Development Handbook

> The command and execution contract is defined in [Developer Experience](../specs/developer-experience.md).

## Start

The generated project already contains a pinned lockfile and installed dependencies.

```bash
pnpm dev
```

Run the full local quality gate before committing:

```bash
pnpm check
```

Use `pnpm cli doctor` for environment and connection diagnostics. Use `pnpm cli help --all --json` as the command source of truth for an agent.

## Architecture

- `src/web/app`: providers and routing
- `src/web/pages`: route-level FSD slices
- `src/web/widgets`: page composition such as the application shell
- `src/web/features`: user actions spanning entities
- `src/web/entities`: stable business entities
- `src/web/shared/ui`: the only public web UI API and HeroUI adapter
- `src/shared/contracts`: transport contracts shared by Worker and web
- `src/worker`: Hono API, middleware, and explicit domain routes
- `src/cli`: local and GitHub Actions orchestration
- `db/migrations`: explicit append-only D1 migrations
- `infra`: lifecycle policy and generated runtime configuration

Do not create placeholder slices. Add a real business capability as one reviewable vertical change: D1 migration, transport contract, Worker route and tests, then the minimum page/feature/entity UI slices.

## Product boundary

Define the first real company workflow in `docs/specs/product-requirements.md`. Do not add tenancy, workspaces, role systems, generic records, custom fields, workflow builders, or runtime schema engines without an explicit product decision.

Existing platforms remain authoritative where they already present the needed information. Build the missing aggregation, calculation, decision, or operation instead of cloning a source platform.

## HeroUI boundary

Product code imports UI only from `src/web/shared/ui`.

- Preserve HeroUI compound component structure, semantics, and default styles.
- Use Tailwind utilities for layout.
- Add custom CSS or variants only for a confirmed product requirement.
- Import Lucide icons through the shared UI public API.
- Do not place product-specific behavior in `shared`.

ESLint rejects direct HeroUI and Lucide imports outside the adapter and raw interactive HTML in product layers. Steiger checks FSD import direction. UI contract tests cover the wrapper surface and single CSS entry point.

## Local identity and data

Production authentication and authorization are enforced by Cloudflare Access. The Worker verifies the Access assertion and uses the verified email for identity and audit; it does not re-evaluate `allowedEmails`.

Local development has no Access gateway. `DEV_ALLOWED_EMAILS` is derived from project configuration, the first address is the default local identity, and `X-Dev-User` may select another configured address for testing. Production never receives `DEV_ALLOWED_EMAILS`.

Before deployment, development uses persistent local D1. After deployment, development uses the canonical remote D1. Tests always use a temporary local D1.

## Business capability workflow

1. Confirm the workflow and acceptance criteria in the product PRD.
2. Add an explicit append-only migration.
3. Define a narrow shared transport contract.
4. Implement and test the Hono route.
5. Add the minimum FSD slices.
6. Compose the UI from `src/web/shared/ui`.
7. Run `pnpm check`.

Do not generalize until repeated product implementations demonstrate the same stable abstraction.
