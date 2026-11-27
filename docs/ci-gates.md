# CI Gates

发布资产完整性采用三层闸门，避免「前置查远端 404」这类设计缺陷再次出现。

## 1. PR / 常规 CI（`ci.yml`）

- `version-consistency` job：调用 `readReleaseIdentity()` 校验全部版本文件一致。
- `asset-gate-selftest` job：`node .github/scripts/verify-local-assets.mjs --self-test`，四组 fixture（正常 / 指纹篡改 / 指纹缺失 / 嵌套目录）。
- 两者均 `needs: pre_job`，跳过标志由 skip-duplicate-actions 控制。

## 2. 发布前置闸门（`release.yml` 的 `verify-assets` job）

- `needs: [prepare, build-macos, build-windows, build-linux]`。
- 下载全部 `release-*` 产物后，先跑 self-test，再跑 `--dir release-assets` 逐个校验安装包与同名 `.sha256` 配对。
- `finalize` job 的 `needs` 包含 `verify-assets`，且 `if` 要求 `needs.verify-assets.result == 'success'`。

**关键约束**：前置闸门只做本地产物校验，不做远端校验。首次发布时 release 由 `finalize` 创建，此刻查远端必然 404。远端校验由第 3 层承担。

## 3. 发布后端到端复查（`verify-release-assets.yml`）

- 触发：`release: published` 或手动 `workflow_dispatch`（指定 tag）。
- `verify-release-assets.mjs --tag` 下载真实产物，校验字节哈希与 release 正文哈希。
- 校验 step 设 `continue-on-error: true`，收尾 step 写 job summary；失败时按精确标题查重开 issue（`gh api "repos/${GH_REPO}/issues?state=open&per_page=100"`），规避 `gh issue list --search` 的索引延迟窗口。

## 本地复现

```
node .github/scripts/verify-local-assets.mjs --self-test
node .github/scripts/verify-local-assets.mjs --dir <产物目录>
node --input-type=module -e "import { readReleaseIdentity } from './scripts/release-identity.mjs'; console.log(JSON.stringify(readReleaseIdentity(process.cwd()).versions))"
```
