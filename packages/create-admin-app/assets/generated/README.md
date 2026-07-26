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

Run the interactive deployment:

```bash
pnpm cli deploy --interactive
```

After deployment:

```bash
pnpm cli status
pnpm cli logs
```

Production D1 migrations, Worker deployment, Access configuration, and infrastructure destruction run only in guarded GitHub Actions. Project targets live in the Git-tracked `config.toml`; credentials stay in the OS credential store and GitHub repository secret.

## Documentation

- [Product requirements](./docs/specs/product-requirements.md)
- [Developer experience](./docs/specs/developer-experience.md)
- [Development handbook](./docs/handbook/development.md)
- [Deployment and data handbook](./docs/handbook/deployment.md)

## License

[MIT](./LICENSE) © Fine Tension
