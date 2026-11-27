# Architecture

## 总览

桌面端采用 Electron 架构。`AGENTS.md` 明确禁止合并或使用旧版主分支的非 Electron 架构代码。

## 技术栈

| 层 | 实现 | 位置 |
| --- | --- | --- |
| 桌面 Shell | Tauri 2（`unstable` / `dynamic-acl`） | `apps/desktop/src-tauri` |
| 运行时桥 | tauri-runtime-electron + electron-rs | `crates/tauri-runtime-electron`、`crates/electron-rs` |
| 前端 | TypeScript / React / Vite | `apps/desktop/src` |
| 移动端 | Expo / React Native | `apps/native` |
| 内置插件 | 9 个 `builtin-plugin-*` 包 | `packages/` |

electron-rs 以固定 git rev 依赖（见 `apps/desktop/src-tauri/Cargo.toml`），保证运行时行为可复现。

## Git Submodules

`crates/electron-rs`、`crates/tauri-runtime-electron`、`crates/tauri-plugin-notifications`、`source/deepseek-harness`（见 `.gitmodules`）。`crates/` 下所有子仓库作为整体管理：提交/推送时同步更新本仓库指针。

## 版本身份

`scripts/release-identity.mjs` 的 `readReleaseIdentity()` 是版本一致性的唯一裁决点，覆盖 `package.json`、`apps/desktop/package.json`、`apps/desktop/src-tauri/Cargo.toml`、`apps/desktop/src-tauri/Cargo.lock`、`apps/desktop/src-tauri/tauri.conf.json`。任一文件漂移即抛 `RELEASE_IDENTITY: release versions do not match`。

版本写入由 `scripts/stamp-version.mjs` 统一执行，避免多处手工改漏。

## 规范路由

修改代码前按 `AGENTS.md` 路由表叠加 `docs/specs/` 对应规范；通用基础为 `docs/specs/development.md`，冲突时专项规范优先。
