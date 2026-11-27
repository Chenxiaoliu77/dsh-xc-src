# 开发指南

本文说明如何初始化、开发、测试与发布 DSH XC 桌面端工程。安装与使用见[根目录 README](../README.md)；英文版见 [DEVELOPMENT.md](./DEVELOPMENT.md)。

## 1. 环境要求

| 工具 | 版本 | 说明 |
| --- | --- | --- |
| Node.js | 22 | CI 取值，见 `.github/actions/setup-node-pnpm` 中 `actions/setup-node` 的默认值。 |
| pnpm | 11.7.0 | 由 `packageManager` 字段锁定，用 `corepack enable` 启用。 |
| Rust | 1.98.1 | 所有 workflow 均固定此版本，不要浮动：其他工具链会改变 Cargo 的 `OUT_DIR` 布局，而 `crates/tauri-runtime-electron` 依赖该布局。 |
| Git | > 2.53.0.2 | 子模块需要；应用运行时也会调用 Git。 |
| 平台 SDK | — | Windows：MSVC 工具链、WebView2 运行时、NSIS（打包安装器）。macOS：Xcode 命令行工具。Linux：Tauri 2 所需的 WebKitGTK 依赖。 |

`apps/native`（Expo / React Native）另需 Android SDK 或 Xcode，仅在改动移动端时才需要。

## 2. 仓库结构

| 路径 | 内容 |
| --- | --- |
| `apps/desktop` | 桌面应用：React 19 渲染层（`src/`）与 Tauri 2 / Electron 的 Rust 宿主（`src-tauri/`）。 |
| `apps/native` | 基于 Expo 的移动端目标。 |
| `packages/builtin-plugin-*` | 九个内置插件（`archive`、`bundle`、`config`、`extension`、`model`、`notification`、`remote`、`tauri`、`ui`）。 |
| `crates/` | Rust 基础库：`electron-rs`、`tauri-runtime-electron`、`tauri-plugin-notifications`，三者均为 **git 子模块**。 |
| `source/deepseek-harness` | 上游 harness 检出，固定到某个提交。只作只读参考，不要通过改它来改变运行时行为。 |
| `scripts/` | 构建、版本戳、发布标识与打包脚本。 |
| `config/` | Vitest 的三套 project 配置（`unit`、`desktop`、`native`）与共享的单元测试 setup。 |
| `docs/specs` | `AGENTS.md` 路由指向的规范文档（桌面端、插件、测试、上游同步）。 |

`crates/` 下的子模块与本仓库作为一个整体管理：先提交并推送子模块，再更新本仓库指针并提交。全新克隆必须带 `--recurse-submodules`；`pnpm install` 的 `preinstall` 钩子也会再执行一次 `git submodule update --init --recursive`。

## 3. 初始化

```bash
git clone --recurse-submodules <repo>
cd <repo>
corepack enable
pnpm install
```

首次 `pnpm install` 需要联网（同步子模块并拉取 pnpm store）。锁文件不一致会报 `ERR_PNPM_OUTDATED_LOCKFILE`，应重新执行 `pnpm install`，不要手工编辑 `pnpm-lock.yaml`。

## 4. 常用命令

| 命令 | 用途 |
| --- | --- |
| `pnpm dev` | 仅启动渲染层（Vite dev server，不含桌面外壳）。 |
| `pnpm dev:desktop` | 完整桌面开发：内置插件进入 watch，随后用 `src-tauri/tauri.dev.conf.json` 启动 `tauri dev`。 |
| `pnpm dev:shell:desktop` | 同上，改用 shell 配置并启用 `dsh-shell-dev` feature。 |
| `pnpm build` | 类型检查、构建渲染层，再构建 shell 产物。 |
| `pnpm build:desktop` | `tauri build`，产出平台安装包。 |
| `pnpm typecheck` | 对 apps、packages、tests、scripts 执行 `tsc --noEmit`。 |
| `pnpm lint` / `pnpm lint:fix` | 按 antfu 配置执行 ESLint。 |
| `pnpm test` | Vitest 全量（`unit` 与 `desktop` 两个 project）。 |
| `pnpm test:unit` | 仅单元测试 project。 |
| `pnpm test:e2e:desktop` | 桌面 E2E project（CDP 驱动）。 |
| `pnpm test:native` / `pnpm typecheck:native` | 移动端检查。 |
| `pnpm tauri` | 直接透传 Tauri CLI。 |

## 5. 桌面开发循环

1. `pnpm dev:desktop` 会并行启动内置插件的 watch，然后拉起 `tauri dev`。渲染层热更新，Rust 改动触发重编译。
2. 插件 watch 运行期间**不要**执行 `pnpm build` / `pnpm build:desktop`，否则会破坏 dev 热重载状态。
3. 开发期不从源码构建运行时内核。`apps/desktop/src-tauri/resources/manifest.jsonc` 只声明 `engines.dsh.minimum`；实际内核包从发布通道下载并缓存到应用数据目录。需要换内核时应走该通道，而不是本地打补丁。

## 6. 质量门禁

提交 PR 前执行，CI 使用同一组命令：

```bash
pnpm typecheck && pnpm lint && pnpm test
```

`ci.yml` 还会构建核心包、重新生成声明，并在 runner 矩阵上跑 Rust 测试与桌面 CDP E2E。各测试套件应断言什么，见 `docs/specs/testing.md`、`docs/specs/desktop.test.md`、`docs/specs/plugin.test.md`。

已知环境差异：Windows 上少量测试会调用 `wmic`。被安全策略禁用 `wmic` 的机器上，这些测试会以策略错误失败，与本次改动无关；可在未限制的机器上复跑确认。

## 7. 版本与发布

- `bumpp`（`bump.config.ts`）把同一个版本号写入七个文件：根 `package.json`、两个 app 的 manifest、`src-tauri/Cargo.toml`、`Cargo.lock`、`tauri.conf.json`、`apps/native/app.json`。不要单独改其中某一个。
- `scripts/stamp-version.mjs` 在构建期按发布 tag 重新落版本，tag 解析由 `scripts/release-identity.mjs` 负责；`scripts/rename-release-assets.mjs` 规范化产物名。
- `tauri.conf.json` 里的 `productName` 与 `identifier` 属于对外身份，改动需按发布影响对待。
- workflow 按职责拆分：`ci.yml` 做检查，`build-*.yml` 做分平台构建，`release*.yml` 负责发布。

## 8. 品牌层

DSH XC 的标识以可替换层的方式施加，而不是散落在源码里，因此上游升级后可机械重放：

| 项目 | 位置 |
| --- | --- |
| 资产（SVG、原生图标、文案块） | `.temp/dsh-xc-kit/brand/` |
| 应用 / 校验 / 内核镜像脚本 | `.temp/dsh-xc-kit/scripts/apply-brand.mjs`、`verify-brand.mjs`、`sync-kernel.mjs` |
| 本 fork 的发布流水线 | `.temp/dsh-xc-kit/.github/workflows/release.yml` |

升级流程：合并上游 → `node .temp/dsh-xc-kit/scripts/apply-brand.mjs` → `node .temp/dsh-xc-kit/scripts/verify-brand.mjs` → `pnpm typecheck && pnpm test` → 打 tag。上游一旦移动了锚点字符串，`verify-brand.mjs` 会直接失败——这是提示更新工具包，而不是手工改产物。桌面安装包发往 `dsh-xc-release` 仓库，镜像的内核包发往 `dsh-xc-kernel`。

## 9. 工程约定

以下为强制规则而非偏好，以 `AGENTS.md` 为准：

- **规范路由。** 动手分析或改代码前，先读取并叠加 `docs/specs/` 中对应的规范。`development.md` 为全局基础，模块规范与其冲突时以模块规范为准。
- **零注释。** 代码应自解释，仅在确实难以直读的算法处保留少量注释；重构时顺手清理过时叙述性注释。
- **临时区。** 中间分析与草稿放在 `.temp/`。
- **子模块纪律。** `crates/*` 的提交先落地，再更新本仓库指针。

## 10. 故障排查

| 现象 | 原因 / 处理 |
| --- | --- |
| `unexpected Cargo OUT_DIR layout: missing build directory` | Rust 工具链不是 1.98.1，安装固定版本。 |
| 启动报 `DSH_INTEGRITY_UNAVAILABLE` | 完整性校验未能访问上游 `releases.atom`，属网络或代理问题，不是构建缺陷。 |
| `ERR_PNPM_OUTDATED_LOCKFILE` | 改了 `pnpm-workspace.yaml` 或某个 manifest 却没重新生成锁文件。 |
| 上游合并后品牌校验失败 | 上游锚点字符串变了，更新工具包的匹配表，不要改生成产物。 |
