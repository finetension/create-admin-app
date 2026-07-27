# Create Admin App

Create a Cloudflare-native internal management app for a small trusted team.

```bash
pnpm create @finetension/admin-app my-company
```

For non-interactive use or any generator option, place pnpm's `--` separator before the project directory:

```bash
pnpm create @finetension/admin-app -- my-company --owner-email owner@example.com --json
```

The generator produces a complete local project first. The generated project's built-in `pnpm cli deploy` command handles optional GitHub and Cloudflare connection after explicit approval.

See the [product requirements](https://github.com/finetension/create-admin-app/blob/main/docs/specs/product-requirements.md) and [developer experience specification](https://github.com/finetension/create-admin-app/blob/main/docs/specs/developer-experience.md) for the current product and command contracts.

## License

[MIT](./LICENSE) © Fine Tension
