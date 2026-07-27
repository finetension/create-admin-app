# Developer Experience

This document defines the public command contract and end-to-end developer journey for this generated project.

## Principles

- The repository remains independently understandable and runnable.
- `pnpm cli help --all --json` is the machine-readable command authority.
- Interactive commands guide a person with keyboard-selectable prompts.
- Coding agents use non-interactive commands with `--json` and explicit approval flags by default.
- Non-interactive commands never open a browser or wait for input.
- `config.toml` stores non-secret project and deployment targets in Git.
- Cloudflare credentials stay in the OS credential store and the GitHub repository Actions secret.
- Cloudflare production mutation runs only in guarded GitHub Actions.
- Audited Owner membership changes are the narrow runtime exception to infrastructure-only Access mutation.
- Re-running a command converges on the declared state instead of duplicating resources.

## Command surface

Every public command supports `--json` for explicit machine mode and `--interactive` for explicit human-oriented TTY mode.

```text
pnpm cli dev
pnpm cli build
pnpm cli check
pnpm cli doctor
pnpm cli status [--strict]
pnpm cli logs [--duration <seconds>]
pnpm cli auth status
pnpm cli auth login
pnpm cli auth logout
pnpm cli deploy
pnpm cli destroy
pnpm cli db migrate
pnpm cli db seed
pnpm cli db reset
pnpm cli help [--all] [--json]
```

Use `pnpm cli <command> --help` for human-readable options and `pnpm cli help --all --json` before an agent chooses options or an Actions-only internal command.

## Execution modes

### Interactive

TTY execution may open authentication or setup pages and may ask for missing choices. Defaults are visible and keyboard-selectable. A destructive confirmation defaults to no.

### Non-interactive

CI, redirected I/O, agent execution, or `--json` is machine mode. It must:

- emit exactly one JSON result or structured error on stdout, except `logs`, which emits NDJSON;
- send progress to stderr;
- fail immediately when a required choice, environment value, or approval is missing;
- require `--yes` and any command-specific confirmation for mutations;
- never open a browser.

Exit codes are stable: `0` success, `1` unexpected, `2` usage, `3` configuration or unhealthy status, `4` external or partial success, and `5` safety refusal.

A coding agent must not select `--interactive` merely because it has a TTY. It uses machine mode and hands only a structured missing input, setup URL, or browser-login requirement back to the user.

## Project creation outcome

The generator completes before this repository is shown to the user. A completed generated project has:

- an immutable dependency graph installed with `pnpm install --frozen-lockfile`;
- a passing `pnpm check`;
- initialized Git on `main` with a first commit;
- no GitHub repository or Cloudflare production resource unless deploy was explicitly selected.

## Local development

`pnpm dev` delegates to `pnpm cli dev`.

- Before the first successful deployment, it uses persistent local D1.
- After deployment, it uses the canonical remote D1 and removes stale persistent local D1 data.
- An explicit `--database local|remote` override is diagnostic, not a second production mode.
- Machine mode never starts browser-based Cloudflare Access login; it returns an actionable error instead.
- `--database local --role owner|admin|member` verifies fixed authenticated role boundaries without request-header impersonation.
- `--database local --public` verifies unauthenticated access; public is an access scope, not a role.
- An explicit local role or public access mode is rejected with remote D1 development.

Tests always use an ephemeral local D1 and never production data.

## Authentication

`pnpm cli auth login` verifies the Cloudflare Account API Token and selected account before storing it. Interactive mode opens the Account API Token page; machine mode requires `CLOUDFLARE_API_TOKEN` and stores it only because login is an explicit persistence command.

`pnpm cli auth status` verifies the stored credential without printing the token. `pnpm cli auth logout` removes it from the OS credential store; machine mode requires `--yes`. Cloudflare Dashboard revocation and the GitHub repository secret remain separate lifecycle operations.

If an interactive deploy finds an invalid or insufficient stored token, it offers to replace the token and re-runs verification. Machine mode fails without prompting.

## Deployment

`pnpm cli deploy --dry-run --json` resolves and prints the plan without changing Git, GitHub, or Cloudflare.

Agent-driven deployment uses the same resolved defaults without prompts:

```bash
pnpm cli deploy --yes --message "chore: deploy this project" --json
```

Interactive first deploy collects or confirms:

1. GitHub owner, repository name, and private/public visibility.
2. Cloudflare account.
3. `workers.dev` by default, using the project slug as the Worker subdomain, or an explicitly selected custom domain.
4. The final Git, GitHub, Worker, D1, Access, and route plan.

The local command then validates the project, scans secrets, prepares a commit, creates or converges the GitHub repository, stores the repository secret, pushes `main`, requests the guarded Application Deploy workflow, waits for it, and fast-forwards the lifecycle commit. It never mutates Worker, D1, Access, or routes from the local process.

The Actions workflow first runs `pnpm check` in a validation job without Cloudflare credentials. Its mutation job requires that validation to pass before it applies append-only D1 migrations, deploys Worker, role groups, path-specific Access applications and policies, injects the repository token as the Worker `ACCESS_MANAGEMENT_TOKEN` secret, verifies the private gate and public health path, and commits `infra/lifecycle.json` as deployed. A failed or interrupted run is safe to diagnose and re-run.

Safe GitHub API reads retry short timeouts and 5xx responses up to three times. A repeated failure distinguishes authentication from network or service errors and tells the agent to rerun the same product CLI command. A repository lookup transport failure is never treated as a missing repository.

## Status, logs, and destruction

`pnpm cli doctor` checks local dependencies, strict configuration, Git state, Git identity/protocol, lifecycle, and connection readiness without mutation.

`pnpm cli status` reads Worker and runtime-secret health, D1, Access roles and path policies, route, and lifecycle state. It returns a non-zero configuration status when an error is present; `--strict` also treats warnings as failure. Status reports only role counts, never the member email list, and redacts opaque Access redirect details.

`pnpm cli logs` streams live Worker logs without creating artifacts. Machine mode has a bounded duration unless overridden, reassembles Wrangler multi-line JSON into one NDJSON record per complete Worker event, and counts events rather than output lines.

`pnpm cli destroy` requests the guarded Application Destroy workflow. It deletes path applications and Worker by default while preserving D1 and Access role memberships. `--include-data` explicitly adds irreversible D1 and role-group deletion. Machine mode requires `--yes --confirm <project-slug>`. Success commits and locally fast-forwards the `destroyed` lifecycle state; development resumes only after deploy returns it to `deployed`.

## Configuration priority

For a supported value, precedence is:

1. explicit command option;
2. process environment;
3. Git-tracked `config.toml`;
4. user defaults;
5. interactive prompt.

Unknown `config.toml` sections or keys are rejected. CLI writes canonical TOML and does not preserve comments or manual formatting.

## Completion checks

- `pnpm check` succeeds.
- `pnpm cli doctor --json` is structured and actionable.
- `pnpm cli help --all --json` lists every public and Actions-only command with risk and guards.
- A clean deploy can be re-run without creating duplicate resources.
- A failed deploy reports the failed job, run URL, current state, and next command.
- Credentials never appear in source, Git history, structured output, or logs.
