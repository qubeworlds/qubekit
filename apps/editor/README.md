# qubekit-editor

The QubeKit **editor** — the deployable application **Qube**
(`qubeworlds.qubekit.editor`). A static-asset Qube: `web/index.html` runs
`@qubekit/solver` in the browser to render a physically-correct meshing gear
pair. (This is the first visibility slice; the full Build/Simulate editor chrome
+ quine 3D engine lands here next.)

- **Live:** <https://qubekit-editor.qubepod.app/>
- **Files:** `web/` (served as-is; `web/solver/` is `@qubekit/solver`'s compiled
  ESM), `qube.json5` (`static: { dir: "web" }`), `qubepod.jsonc` (deploy
  manifest — static, no component).
- **Refresh the bundled solver:** `./build.sh` (compiles `@qubekit/solver` and
  copies its `dist/*.js` into `web/solver/`).

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

`qube deploy` is component-only in the pre-alpha CLI, so a static Qube ships
via the direct `POST /api/deploy` in `deploy.sh` (the API accepts a
component-less bundle). The token lives in `~/.qube/pods.toml` (or
`$QUBEPODS_TOKEN`) — **never commit it**; this repo is public.
