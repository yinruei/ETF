# Public deployment

Codex Sites requires workspace login, so use Cloudflare Pages for a public URL.

## Fast path

Upload the generated `public-site.zip` to Cloudflare Pages with Direct Upload.

Cloudflare Dashboard path:

```text
Workers & Pages -> Create application -> Pages -> Upload assets
```

Project name:

```text
littleblacker-00981a
```

After deployment, Cloudflare will provide a public URL like:

```text
https://littleblacker-00981a.pages.dev
```

## CLI path

If Wrangler is logged in on this computer:

```bash
npm run deploy:cloudflare
```

This deploys the `public` folder directly to Cloudflare Pages.
