# qubekit-preview

The QubeKit **editor shell** — a static-asset qube and the fast-iterate
visibility surface. `web/index.html` loads the shared quine 3D engine from the
CDN (reusing `world`'s `/scene` loader) and shows the QubeKit chrome (parts
palette + Build/Simulate toggle + boot log), touch-first for the iPad floor.

- **Live:** <https://qubekit-preview.qubepod.app/>
- **Files:** `web/` (served as-is), `qube.json5` (`static: { dir: "web" }`),
  `qubepod.jsonc` (deploy manifest — static, no component).

## Deploy

One-time, after minting a **deploy-scoped** token in the qubepods console
(app.qubepods.com, project `qubekit`):

```sh
qube pod login --url https://api.qubepods.com --token <deploy-token>
```

Then, after any change:

```sh
./deploy.sh          # zips web/ + qubepod.jsonc → POST /api/deploy → *.qubepod.app
```

The token lives in `~/.qube/pods.toml` (or `$QUBEPODS_TOKEN`) — **never commit
it**; this repo is public.
