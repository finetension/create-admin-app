# Deployment and Data Handbook

> The command and execution contract is defined in [Developer Experience](../specs/developer-experience.md).

## Invariants

- One repository, company, deployment, and canonical D1 database form one system.
- Development uses local D1 before first deployment and the remote canonical D1 afterwards.
- Tests use an ephemeral local D1.
- Production D1 migration, Worker deployment, Access infrastructure mutation, and infrastructure destruction run only in guarded GitHub Actions. Audited Owner membership changes are the narrow runtime exception.
- `config.toml` is the Git-tracked source for non-secret targets.
- Cloudflare is the source of truth for live resource existence.

## Configuration

`config.toml` contains:

- `[project]`: display name and slug;
- `[access]`: the protected bootstrap Owner email;
- `[github]`: owner, repository, and visibility after connection;
- `[cloudflare]`: account ID and either `workers.dev` or custom-domain route.

Unknown sections and keys are errors. The CLI rewrites valid configuration in canonical form.

`infra/lifecycle.json` stores only `predeploy`, `deployed`, or `destroyed`. It contains no resource IDs or credentials.

## Credentials

GitHub authentication is managed by `gh auth`. The Cloudflare Account API Token is stored per account in the OS credential store and as the target GitHub repository Actions secret named `CLOUDFLARE_API_TOKEN`.

Create the Cloudflare token from the Dashboard `Write all resources` Account API Token template, leave its account and Zone scope unchanged, and use no expiration or IP restriction for this persistent CI credential. This is intentionally broad and must be rotated immediately after suspected exposure.

```bash
pnpm cli auth login
pnpm cli auth status
pnpm cli auth logout
```

`auth logout` removes only the local credential. Revoke the Dashboard token and replace or delete the GitHub repository secret separately.

Never store a token in `.env`, `config.toml`, a command argument, Git, or an Actions artifact. `CLOUDFLARE_API_TOKEN` may be supplied as process environment for machine commands; only explicit `auth login` persists it.

## First deployment

Inspect the plan first:

```bash
pnpm cli deploy --dry-run --json
```

For a coding agent, use the non-interactive path and wait for its structured result:

```bash
pnpm cli deploy --yes --message "chore: deploy this project" --json
```

For a person operating the terminal directly, use the keyboard-driven journey:

```bash
pnpm cli deploy --interactive
```

Private GitHub visibility and `workers.dev` are the defaults. A project without a custom domain deploys normally to the project-slug Worker subdomain. Custom domains are optional and selected only when explicitly requested.

The local command may update files, commit, create or converge the GitHub repository, set the repository Actions secret, push `main`, request the Application Deploy workflow, wait for completion, and fast-forward the lifecycle commit. It does not mutate Cloudflare production resources.

The Application Deploy workflow runs `pnpm check` in a credential-free validation job. Only after that job passes does its mutation job validate the Actions/main capability, apply append-only migrations, converge Worker, One-time PIN, role groups and path-specific Access applications, copy the same repository token into the Worker `ACCESS_MANAGEMENT_TOKEN` secret binding, verify the private gate and public health path, and commit the deployed lifecycle state. The Public application bypasses only data-free `/assets/*` build output and the explicit `/public/*` and `/api/public/*` paths, so role-specific HTML and APIs remain protected while a protected page can load its JS and CSS without crossing Access application sessions. Because the Access API rejects an empty group `include`, an empty role group contains one reserved, non-login `example.com` placeholder email. Deploy and the Owner API normalize this rule and exclude it from member lists, role resolution, and status counts.

If the Cloudflare account has no Zero Trust organization, interactive deploy opens onboarding and verifies it after completion. Machine mode fails with an actionable setup URL.

## Re-deployment and failure

A clean re-deploy requests the workflow without manufacturing an empty commit. Resource operations are idempotent and look up live resources by stable project names.

Actions failure does not trigger automatic rollback or retry. The CLI reports the failed job or step, run URL, and next command. Fix the cause and run deploy again.

Safe GitHub API reads retry short timeouts and 5xx responses up to three times. Repeated transport failure tells the operator to rerun the same product CLI command and is not mistaken for missing authentication or a missing repository.

If Actions succeeds but the local lifecycle fast-forward fails, production remains deployed and the command reports partial success with exit code `4`. Resolve the local Git divergence and fast-forward `origin/main`.

## Status and logs

```bash
pnpm cli doctor
pnpm cli status
pnpm cli status --strict
pnpm cli logs
```

These commands do not mutate production. Status checks Worker and its runtime secret, D1, role groups, path applications, policies, bootstrap Owner, unique membership, route, and lifecycle drift without printing member emails. Status JSON omits redirect query strings and fragments and replaces the opaque Cloudflare Access challenge path segment with `[redacted]`. Logs remain in the current terminal and are not uploaded as artifacts.

## Destruction

```bash
pnpm cli destroy
```

The command requests the guarded Application Destroy workflow. It deletes path-specific Access applications and Worker while preserving D1 and role groups by default. Add `--include-data` only when irreversible D1 and Access membership deletion is intended. A successful workflow commits the `destroyed` lifecycle state, and the local command fast-forwards that commit before reporting complete success. Machine execution requires:

```bash
pnpm cli destroy --yes --confirm <project-slug>
```

There is no backup or restore command in the common scaffold.

In the `destroyed` state, strict status treats an absent Worker and Access application as healthy whether D1 was preserved or deleted. Automatic development and persistent local D1 commands remain disabled until `pnpm cli deploy` restores the `deployed` state.

## Migration rules

- Add migrations; do not edit an already-deployed migration.
- Use explicit domain tables and columns.
- Ship schema changes and consuming code together.
- Never rewrite or drop deployed data without a reviewed retention and transformation plan.
- Local migration, seed, and reset commands are available only while lifecycle is `predeploy`.

## Operational record

GitHub Actions runs are the deployment and destruction audit trail. Do not create local deployment-state files, backup artifacts, or Worker log artifacts. D1 IDs, Access audience values, and runtime Wrangler configuration remain ephemeral and untracked.
