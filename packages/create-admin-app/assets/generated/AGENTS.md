# Project guide

This repository is one company, one internal management system, one Cloudflare deployment, and one canonical D1 database.

## Source of truth

- Product goals and non-goals: `docs/specs/product-requirements.md`
- CLI journey and command contracts: `docs/specs/developer-experience.md`
- Local development and architecture: `docs/handbook/development.md`
- Database lifecycle and operations: `docs/handbook/deployment.md`

## Working rules

- Ask the user to define the real company problem in the product PRD before inventing business modules.
- Do not add tenancy, workspaces, custom roles, resource-level permissions, generic records, custom-field engines, or runtime module builders without an explicit product decision.
- Cloudflare Access groups and path applications are the authorization boundary for Owner, Admin, and Member roles plus explicit public routes. D1 stores audit actors and changes, not role state.
- Add business capabilities as explicit FSD slices, contracts, Worker routes, tests, and D1 migrations.
- Web product layers import UI only through `src/web/shared/ui`. Prefer HeroUI defaults and composition; use Tailwind utilities for layout only.
- Remote D1 mutation, Worker deployment, Access infrastructure changes, and infrastructure destruction run only in guarded GitHub Actions. The audited Owner API may change only project Access group membership and revoke user sessions at runtime.
- Never rewrite or drop deployed data without a reviewed retention and transformation plan.
- Treat `config.toml` as the Git-tracked source for non-secret targets. Keep tokens in the OS credential store and GitHub repository Actions secrets.
- Keep secret-scan exceptions precise, justified, and Git-tracked. Never bypass secret scanning at runtime.
- Use `--json` and documented approval flags for agent-run commands. Use `--interactive` only when a person explicitly asks to operate the keyboard-driven journey or a structured machine error requires user handoff.

## Commands

```bash
pnpm dev
pnpm check
pnpm cli doctor
pnpm cli status
pnpm cli help --all --json
```

Read the machine-readable help before choosing deployment, destruction, authentication, database, or log options.

### Product work

Update `docs/specs/product-requirements.md` before implementing a decision that changes the product boundary.

### Web work

Read `docs/handbook/development.md`. Keep domain code out of `shared`; shared UI must not encode product-specific behavior.

### Data and deployment work

Read `docs/handbook/deployment.md`. Do not bypass the documented CI guards from a local shell.
