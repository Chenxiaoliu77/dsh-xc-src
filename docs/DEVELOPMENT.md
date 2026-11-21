# Development Guide

How to bootstrap, run, test and release the DSH XC desktop workspace. For installation and end-user usage, see the [README](../README.md); for the Chinese edition of this guide, see [DEVELOPMENT.zh.md](./DEVELOPMENT.zh.md).

## 1. Prerequisites

| Tool | Version | Notes |
| --- | --- | --- |
| Node.js | 22 | The value used by CI (`actions/setup-node` default in `.github/actions/setup-node-pnpm`). |
| pnpm | 11.7.0 | Pinned by the `packageManager` field. Enable via `corepack enable`. |
| Rust | 1.98.1 | Pinned by every workflow. Do not float this: other toolchains change the Cargo `OUT_DIR` layout that `crates/tauri-runtime-electron` relies on. |
| Git | > 2.53.0.2 | Needed for submodules; the app also shells out to Git at runtime. |
| Platform SDK | — | Windows: MSVC toolchain, WebView2 runtime, NSIS (installer bundling). macOS: Xcode command line tools. Linux: the WebKitGTK stack Tauri 2 requires. |

`apps/native` (Expo / React Native) additionally needs the Android SDK or Xcode; it is only required when you touch the mobile target.

## 2. Repository layout

| Path | Contents |
| --- | --- |
| `apps/desktop` | The desktop application: React 19 renderer (`src/`) plus the Tauri 2 / Electron Rust host (`src-tauri/`). |
| `apps/native` | Expo-based mobile target. |
| `packages/builtin-plugin-*` | Nine first-party plugins (`archive`, `bundle`, `config`, `extension`, `model`, `notification`, `remote`, `tauri`, `ui`). |
| `crates/` | Rust building blocks — `electron-rs`, `tauri-runtime-electron`, `tauri-plugin-notifications`. All three are **git submodules**. |
| `source/deepseek-harness` | Upstream harness checkout, pinned to a commit. Read-only reference; do not edit it to change runtime behaviour. |
| `scripts/` | Build, version-stamping, release-identity and bundling helpers. |
| `config/` | Vitest projects (`unit`, `desktop`, `native`) and the shared unit setup file. |
| `docs/specs` | The normative specs routed by `AGENTS.md` (desktop, plugin, testing, upstream sync). |

The submodules under `crates/` are treated as one unit with this repository: commit and push them first, then update the pointer here and commit that. A fresh clone must use `--recurse-submodules`; `pnpm install` also re-runs `git submodule update --init --recursive` through the `preinstall` hook.

## 3. Bootstrap

```bash
git clone --recurse-submodules <repo>
cd <repo>
corepack enable
pnpm install
```

`pnpm install` needs network access on first run (submodule sync plus the pnpm store). A lockfile mismatch surfaces as `ERR_PNPM_OUTDATED_LOCKFILE`; regenerate with `pnpm install` rather than editing `pnpm-lock.yaml` by hand.

## 4. Common commands

| Command | Purpose |
| --- | --- |
| `pnpm dev` | Renderer only (Vite dev server, no desktop shell). |
| `pnpm dev:desktop` | Full desktop loop: builtin plugins in watch mode plus `tauri dev` with `src-tauri/tauri.dev.conf.json`. |
| `pnpm dev:shell:desktop` | Same, using the shell config and the `dsh-shell-dev` feature. |
| `pnpm build` | Type-check, build the renderer, then build the shell bundle. |
| `pnpm build:desktop` | `tauri build` — produces the platform installer. |
| `pnpm typecheck` | `tsc --noEmit` across apps, packages, tests and scripts. |
| `pnpm lint` / `pnpm lint:fix` | ESLint with the antfu config. |
| `pnpm test` | Vitest, both projects (`unit` and `desktop`). |
| `pnpm test:unit` | Unit project only. |
| `pnpm test:e2e:desktop` | Desktop E2E project (CDP-driven). |
| `pnpm test:native` / `pnpm typecheck:native` | Mobile target checks. |
| `pnpm tauri` | Raw Tauri CLI passthrough. |

## 5. Desktop development loop

1. `pnpm dev:desktop` starts the builtin plugins in parallel and then launches `tauri dev`. The renderer hot-reloads; Rust changes trigger a rebuild.
2. Do **not** run `pnpm build` / `pnpm build:desktop` while the plugin watch is active — it invalidates the dev hot-reload state.
3. The runtime core is not bundled from source during development. `apps/desktop/src-tauri/resources/manifest.jsonc` declares only `engines.dsh.minimum`; the actual core archive is downloaded from the release channel and cached under the app data directory. Anything that needs a different core must go through that channel, not through a local patch.

## 6. Quality gates

Run these before opening a PR; CI runs the same set:

```bash
pnpm typecheck && pnpm lint && pnpm test
```

CI (`ci.yml`) additionally builds core packages, regenerates declarations, and runs Rust tests plus the desktop CDP E2E suite on a runner matrix. Specs for what each suite must assert live in `docs/specs/testing.md`, `docs/specs/desktop.test.md` and `docs/specs/plugin.test.md`.

Known environment caveat: a handful of Windows tests shell out to `wmic`. On hardened machines that block it, those tests fail with a policy error that has nothing to do with the change under review — confirm by running the same test on an unrestricted machine.

## 7. Versioning and release

- `bumpp` (`bump.config.ts`) writes one version into seven files: the root `package.json`, both app manifests, `src-tauri/Cargo.toml`, `Cargo.lock`, `tauri.conf.json` and `apps/native/app.json`. Never bump them individually.
- `scripts/stamp-version.mjs` re-stamps the version at build time from the release tag, using `scripts/release-identity.mjs` for tag parsing. `scripts/rename-release-assets.mjs` normalises artifact names.
- `tauri.conf.json` carries `productName` and `identifier`; both are part of the shipped identity, so treat edits as release-affecting.
- Workflows are split by concern: `ci.yml` for checks, `build-*.yml` for per-platform builds, `release*.yml` for publishing.

## 8. Brand layer

The DSH XC identity is applied as a replaceable layer, not as scattered edits, so upstream upgrades can be re-applied mechanically:

| Item | Location |
| --- | --- |
| Assets (SVG, native icons, text blocks) | `.temp/dsh-xc-kit/brand/` |
| Apply / verify / kernel-mirror scripts | `.temp/dsh-xc-kit/scripts/apply-brand.mjs`, `verify-brand.mjs`, `sync-kernel.mjs` |
| Release pipeline for the fork | `.temp/dsh-xc-kit/.github/workflows/release.yml` |

Upgrade flow: merge upstream → `node .temp/dsh-xc-kit/scripts/apply-brand.mjs` → `node .temp/dsh-xc-kit/scripts/verify-brand.mjs` → `pnpm typecheck && pnpm test` → tag. `verify-brand.mjs` fails loudly when an anchor string moved upstream, which is the intended signal to update the kit rather than to hand-patch the source. Desktop installers go to the `dsh-xc-release` repository, mirrored kernel archives to `dsh-xc-kernel`.

## 9. Conventions

These are enforced project rules, not preferences (`AGENTS.md` is authoritative):

- **Spec routing.** Read and stack the matching spec from `docs/specs/` before analysing or changing code. `devlopment.md` applies to everything; module specs override it on conflict.
- **Zero comments.** Code should explain itself. Reserve comments for genuinely non-obvious algorithms; delete stale narrative comments while refactoring.
- **Scratch space.** Intermediate analysis and drafts go in `.temp/`.
- **Submodule discipline.** `crates/*` commits land before the pointer update in this repository.

## 10. Troubleshooting

| Symptom | Cause / action |
| --- | --- |
| `unexpected Cargo OUT_DIR layout: missing build directory` | Rust toolchain is not 1.98.1. Install the pinned version. |
| Startup fails with `DSH_INTEGRITY_UNAVAILABLE` | The integrity check could not reach `releases.atom` upstream — network or proxy, not a build defect. |
| `ERR_PNPM_OUTDATED_LOCKFILE` | `pnpm-workspace.yaml` or a manifest changed without regenerating the lockfile. |
| Brand verification fails after an upstream merge | An anchor string changed upstream; update the kit's match table, do not patch generated output. |
