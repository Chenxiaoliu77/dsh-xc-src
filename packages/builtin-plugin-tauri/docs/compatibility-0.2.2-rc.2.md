# Harness 0.2.2-rc.2 兼容记录

推荐核心和开发依赖为 `0.2.2-rc.2`，最低支持为 `0.2.2-rc.1`。源码对照固定到 `dsh-v0.2.2-rc.2`（`ddac96760b6edf8fa0fe17cbdcf0b512f4c12b2c`），历史派生来源保留。打包发行如实登记：rc.2 目前只有源码 prerelease `dsh-src-0.2.2-rc.2-43074821738`，正式 asar 打包发行尚未产出，最新正式打包仍是 `dsh-0.2.2-rc.1-41838008646`；推荐版本解析不到时回退 tag 仍指向它，不由版本号推算 build ID。

## 本轮变更范围

`pnpm-workspace.yaml` 的 `minimumReleaseAgeExclude`（82 条）与 `catalogs.dsh`（32 条）由 `0.2.2-rc.1` 推进到 `0.2.2-rc.2`；根 `THIRD_PARTY_NOTICES.md` 表格与各包 `THIRD_PARTY_NOTICES.md` 的 reference version / revision / support policy / catalog pin 同步到 rc.2。

最低支持基线未移动：`apps/desktop/src-tauri/resources/manifest.jsonc` 的 `engines.dsh.minimum`、各包 `package.json` 的 `"dsh": ">=0.2.2-rc.1"`、`config/vitest.unit.config.ts` 的 `__REMOTE_DSH_MINIMUM__` 仍是 `0.2.2-rc.1`。

## 契约核对边界

`source/deepseek-harness` 子模块指针已补齐到 `ddac96760b6edf8fa0fe17cbdcf0b512f4c12b2c`（与 `catalogs.dsh` 的 `0.2.2-rc.2` 对齐）。

契约面按 GitHub blob SHA 比对 rc.1（`66491b05`）→ rc.2（`ddac9676`）；同一 blob SHA 即文件逐字节相同：

| 契约载体 | rc.1 | rc.2 | 结论 |
| --- | --- | --- | --- |
| `apps/desktop/src/host-protocol.ts` | `dc0556fb52` | `dc0556fb52` | 未变 |
| `packages/host/webserver/src/injections.ts`（index 注入行） | `79734fd34a` | `79734fd34a` | 未变 |
| `packages/client/connection/src/rpc.ts`（鉴权） | `aec79d0728` | `aec79d0728` | 未变 |
| `packages/host/frontend-static/src/index.ts` | `609d2062dc` | `609d2062dc` | 未变 |
| `apps/desktop/src/preload-app.ts` | `26266b4f1c` | `6b4e989614` | **有变更** |

`preload-app.ts` 的唯一变更是新增更新通道能力 `updates.channels.get/set/subscribe`，背后是 `DESKTOP_IPC.updatesChannelGet` / `updatesChannelSet` / `updatesChannelChanged` 三个 Electron IPC 通道。该面属于**上游 Electron 参考宿主**（`window.desktop`）的能力；本壳以 `window.dshDesktop` 注入（`packages/builtin-plugin-tauri/src/host/apply.ts`）与内核交互，该注入面不含 `updates`，更新流程由 Rust 侧 `service/update/*` 与壳 UI 承担，因此不消费这三个通道，rc.2 的该变更对本壳无运行时影响。

上述结论的范围仅限列出的 5 个契约载体文件，不声称整棵源码树逐字节相同，也不把源码对照等同于真实模型请求、发布包压缩锚点与完整桌面浏览器交互的运行验证。

## 验证范围

本轮重生成 `pnpm-lock.yaml`（rc.2 全部依赖解析成功），并在 rc.2 依赖上跑通仓库 typecheck 与 unit 全量（91 文件 / 800 用例）。rc.1 一轮的验证结论只对它自己的区间成立，见 [0.2.2-rc.1 兼容记录](<./compatibility-0.2.2-rc.1.md>)。

未验证真实模型请求、发布包压缩锚点与完整桌面浏览器交互，不能把源码对照等同于这些运行验证。
