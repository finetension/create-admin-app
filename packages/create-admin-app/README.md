# Create Admin App

Create a Cloudflare-native React, Hono, HeroUI, and D1 admin app for a small trusted team.

```bash
pnpm create @finetension/admin-app my-company
```

The generator installs dependencies, initializes the app, creates the first Git commit, and can optionally create a GitHub repository and configure Cloudflare deployment.

Cloudflare connection is optional. When connected, the generator stores the API token in the OS credential store, lets you choose an account and either `workers.dev` or a Zone, and configures the GitHub `production` Environment after private repository creation. Repository creation and the first deployment always require confirmation. `--public` creates a source-only repository without Cloudflare production setup.

```text
--github / --no-github
--cloudflare / --no-cloudflare
--domain <zone> --subdomain <prefix>
--public
--deploy
--skip-install
--yes --emails <email,...>
```

## License

[MIT](./LICENSE) © Fine Tension
