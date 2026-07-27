# {{PROJECT_NAME}}

Cloudflare-native internal management system generated with Create Admin App.

## Prerequisites

- Node.js 22.13 or newer
- pnpm 11
- Git
- GitHub CLI (`gh`) for deployment
- A Cloudflare Account API Token created from the `Write all resources` template

The project is already installed, checked, and committed when generation finishes.

## Local development

```bash
pnpm dev
```

Before the first production deployment this uses persistent local D1. After the first successful deployment, development uses the single canonical remote D1.

To verify role boundaries before deployment:

```bash
pnpm cli dev --database local --role owner
pnpm cli dev --database local --role admin
pnpm cli dev --database local --role user
pnpm cli dev --database local --role public
```

## Verify the project

```bash
pnpm check
pnpm cli doctor
pnpm cli help --all --json
```

## Deploy

Preview the resolved GitHub and Cloudflare plan without changing anything:

```bash
pnpm cli deploy --dry-run --json
```

For coding agents, run the non-interactive deployment and wait for its structured result:

```bash
pnpm cli deploy --yes --message "chore: deploy {{PROJECT_SLUG}}" --json
```

For a person operating the terminal directly, use the keyboard-driven journey:

```bash
pnpm cli deploy --interactive
```

After deployment:

```bash
pnpm cli status
pnpm cli logs
```

Production D1 migrations, Worker deployment, Access infrastructure, and infrastructure destruction run only in guarded GitHub Actions. The Owner screen is the narrow runtime exception for audited Access membership changes and native session revocation. Project targets live in the Git-tracked `config.toml`; credentials stay in the OS credential store, GitHub repository secret, and the deployed Worker secret binding.

## Documentation

- [Product requirements](./docs/specs/product-requirements.md)
- [Developer experience](./docs/specs/developer-experience.md)
- [Development handbook](./docs/handbook/development.md)
- [Deployment and data handbook](./docs/handbook/deployment.md)

## License

[MIT](./LICENSE) © Fine Tension
