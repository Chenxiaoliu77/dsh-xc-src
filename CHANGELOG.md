# Changelog

本文件按提交历史整理（仓库当前无 git tag，版本锚点取自 `package.json` 与各版本文件）。发布入口为 GitHub Releases，正式变更说明由 `release.yml` 的 changelogithub 步骤生成。

## 0.34.1 (2026-11-26)

- 修复 Windows 安装器覆盖 `resources\node_modules\tailwindcss\oxide-win32-x64-msvc\tailwindcss.oxide.win32-x64-msvc.node` 时进程锁文件导致「无法打开要写入的文件」；安装器交接后退出 Electron 主进程（`ef72997`）。
- About 页源码链接指向公开镜像 `dsh-xc-src`（`178bcd8`）。
- 发布资产完整性闸门：前置本地配对校验、发布后端到端复查、失败自动开 issue。

## 0.34.0

- 0.33.0 → 0.34.0 升级端到端回归通过。

## 0.33.0 (2026-11-26)

- 依赖加固：tracing 0.1.40、tracing-subscriber 0.3.20、zip 9.8.1、zstd 0.13.4、regex 1.13.1。
- bumpp 升级 12.3.0 并按新版本重做 patch。
- 6 个版本文件一次性统一，避免 Cargo.toml 漏改导致版本分裂。

## 0.32.x

- 更新源全部自有化：`REPO_URL` / `DSH_CORE_URL` 指向自有仓库，更新检测走自有 `releases.atom`，不连上游。
