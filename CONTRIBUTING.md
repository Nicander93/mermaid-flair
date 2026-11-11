# 贡献指南

感谢帮助完善 Mermaid Flair。当前分发目标是桌面插件；根工作区保留 `private: true`，内部模块尚未承诺独立的 npm API。

## 准备环境

使用 Node.js 24、pnpm 11.8.0，在仓库根目录运行：

```sh
pnpm install --frozen-lockfile
pnpm check
pnpm exec playwright install chromium
pnpm test
pnpm package
```

`pnpm package` 生成 VSIX、Obsidian 插件目录/ZIP 和 SHA-256 校验文件，不会上传或发布。构建产物、依赖、测试报告和临时宿主配置不提交到源码仓库。

## 找到需要修改的位置

| 目录 | 内容 |
| --- | --- |
| `apps/vscode` | VS Code / Cursor 扩展、普通 Markdown 预览接入 |
| `apps/obsidian` | Obsidian 阅读视图、设置与生命周期 |
| `packages/renderer` | Mermaid、SVG 净化、手绘装饰、隔离渲染 |
| `packages/viewer` | 图表交互、弹层、复制与导出 |
| `packages/themes` | 主题、色板与旧设置迁移 |
| `packages/source` | Markdown 围栏与源码定位 |
| `tests` / `fixtures` | 自动回归和可复现图例 |

## 验证改动

代码改动先运行 `pnpm check`，再运行与行为相关的测试。完整回归使用 `pnpm test`。改变宿主接入、主题同步或剪贴板行为时，还应完成对应宿主实测，并在验证记录中区分自动测试与原生验收。

[测试记录](docs/test-plan.md)提供原生验证命令。Windows 脚本使用独立配置；Cursor 测试入口会禁用非 VS Code 自带扩展，不调用 Cursor AI。

更新公开文档配图时运行：

```sh
pnpm docs:images
```

该命令使用实际插件渲染器生成四张主题配图。默认使用 Playwright Chromium，也可通过 `FLAIR_CHROMIUM` 指定本机 Chrome 路径。修改图例时同步维护 `fixtures/mermaid/quick-start.md` 和中英文 README。

## 提交变更说明

说明用户遇到的问题、改动后的行为以及实际完成的验证。涉及图表外观时附上同一图例的前后效果。不要把本机用户名、绝对路径、访问令牌或临时测试目录放进提交内容。

修改 Mermaid 版本或结构适配时，先查看[实现决策](docs/decisions.md)。发布操作另见[发布准备](docs/publishing.md)。

