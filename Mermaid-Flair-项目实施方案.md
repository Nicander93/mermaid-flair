# Mermaid Flair — 项目实施方案（Agent 交付版）

> 状态：规划稿 · 2026-11-05<br>
> 目标：一个 Monorepo，两套编辑器插件（Obsidian、VS Code/Cursor），共享 Mermaid 美化与查看能力。<br>
> 原则：最小改动 Markdown、不自行实现 Mermaid 语法/布局、先验证宿主集成再扩张功能。

## 一、产品定位

**一句话**：在用户已有的 Markdown 工作流中，让 Mermaid 图表自动更好看，并能够方便地放大、查看与导出。

### 目标用户

频繁在 Obsidian、VS Code、Cursor 中阅读技术文档、流程图、时序图的开发者。

### 产品目标

- 无需修改已有 `mermaid` 代码块，即可得到更一致的排版与配色。
- 在现有预览中直接切换风格，图表不会因为换主题而丢失信息。
- 复杂图可全屏、缩放、平移、适应窗口和导出 SVG。
- 两端的主题语义和查看交互一致；实现方式遵循各自宿主 API。
- 默认离线执行，不向外部服务上传图表内容。

### 非目标（首版不要做）

- 不做 Mermaid 源码编辑器、双向可视化编辑或 AI 生图。
- 不重新实现 Mermaid 语法解析、ELK/Dagre 等布局算法。
- 不提供数十种主题、完整 CSS 可视化编辑器或在线主题商店。
- 不承诺所有图表类型都具备相同的样式自由度。
- 不依赖侵入宿主私有 API 或要求用户卸载/关闭内置功能才能稳定使用。

## 二、首版功能（MVP）

| 优先级 | 能力 | 规格 |
|---|---|---|
| P0 | 即插即用的 Markdown Mermaid 渲染 | 源码保持不变；出现错误能看见诊断；不出现双层图表 |
| P0 | 3 种风格 | Minimal（单色）、Modern（柔和卡片）、Sketch（手绘）；风格与明暗模式分离 |
| P0 | 图表类型 | 首先用 Flowchart + Sequence 验证，其他类型由官方 Mermaid 渲染器兜底 |
| P0 | 主题同步 | 跟随宿主 Light/Dark 切换，保证文字对比度 |
| P0 | 大图查看 | 悬浮/聚焦显现操作入口；放大、缩小、拖动、适应窗口、重置；Esc 关闭 |
| P0 | SVG 导出 | 导出当前图表，保证 SVG 可独立打开 |
| P0 | 离线与安全 | 无 CDN / 遥测；限制 HTML 与脚本注入；失败回退或提示而非空白 |
| P1 | PNG 导出 | 在 SVG 成熟后增加，验证高清比例和字体一致性 |
| P1 | 单图临时风格切换 | 只改变显示结果，不改 Markdown 源码；全局默认主题可保存 |
| P2 | 更多预设与细调 | 字体、间距、线型、配色；依据用户反馈决定 |

**首版交互原则**：图表正常显示时不要堆放按钮或解释文案；仅在图表悬浮、键盘聚焦或打开大图后展示工具。

## 三、技术选型与边界

- 语言：TypeScript；Monorepo：pnpm workspace；构建：esbuild（如无必要不要引入框架）。
- 首选渲染：官方 `mermaid`（以开发时兼容的 v12 稳定版为基线）。v12 已内置 ELK，适用图表可用 ELK；不要对时序图强制套 ELK。
- 视觉增强：评估 `beautiful-mermaid`（MIT），只用于它明确支持并通过语法回归测试的图表；它不是官方 Mermaid 的全量替代品。
- `Renderer` 适配器负责渲染与能力声明，`Theme` 预设通过设计变量进行映射。不同后端对样式的支持可以不同，不能以“统一布局引擎”作为强约束。
- 语法错误与“不支持的图表类型”必须区分：类型不支持时回退官方引擎；语法错误显示诊断，不默默掩盖。
- 注重 CSP、安全级别、SVG 消毒与链接策略；禁止未经确认的外链资源及远程字体加载。
- UI 尽量使用 DOM + CSS，自研轻量查看层；不要引入重量级画布框架。

### 建议接口（可据实验调整）

```ts
interface RenderRequest {
  source: string;
  theme: 'minimal' | 'modern' | 'sketch';
  colorMode: 'light' | 'dark';
}

interface RenderResult {
  svg: string;
  engine: 'mermaid' | 'beautiful-mermaid';
  warnings: string[];
}

interface Renderer {
  supports(source: string, request: RenderRequest): boolean;
  render(request: RenderRequest): Promise<RenderResult>;
}
```

**架构不必过度抽象**：只有在确实用到两个渲染后端时，才抽取通用适配接口；否则先以官方 Mermaid 为默认基线。

## 四、Monorepo 目录建议

```text
mermaid-flair/
├─ apps/
│  ├─ obsidian/             # Obsidian 生命周期、设置、Markdown 处理器
│  └─ vscode/               # VS Code/Cursor 命令、预览集成、打包
├─ packages/
│  ├─ renderer/             # 渲染逻辑、引擎选择与回退
│  ├─ themes/               # 设计变量、3 套预设
│  └─ viewer/               # 大图交互、缩放平移、SVG 导出
├─ fixtures/
│  └─ mermaid/              # 真实测试用例与渲染快照
├─ docs/
│  ├─ decisions.md          # 重要技术决策与权衡
│  ├─ compatibility.md      # 宿主版本与图表兼容矩阵
│  └─ test-plan.md          # 手工与自动化验收
├─ .github/workflows/
├─ manifest.json            # Obsidian 目录审核要求：仓库根目录
├─ pnpm-workspace.yaml
├─ package.json
├─ README.md
└─ LICENSE
```

注意：`apps/obsidian/manifest.json` 与仓库根 `manifest.json` 不得人工独立维护。指定唯一真源、生成或同步根清单，并在 CI 校验一致性。Obsidian 版本 tag 必须与 manifest 的 x.y.z 完全匹配，Release 上传 `main.js`、`manifest.json`、可选 `styles.css`。

## 五、先做宿主可行性验证（决定能否成功的阶段）

### Spike A：Obsidian

- 核实 `registerMarkdownCodeBlockProcessor('mermaid', ...)` 与内置 Mermaid 渲染的优先级/冲突，以及 Reading View、Live Preview 的行为。
- 渲染同一个复杂时序图，验证切换笔记、切换主题、反复修改代码块时不会重复注册、闪烁或泄漏。
- 验证启用/禁用插件的回退体验；仅在真正需要时使用受支持的 PostProcessor。
- 若无法可靠接管，记录原因与替代机制，不靠修改 Obsidian 内部对象打补丁。

### Spike B：VS Code / Cursor

- 先研究 VS Code 官方 Markdown 扩展点：`markdown.markdownItPlugins`、`markdown.previewScripts`、`markdown.previewStyles`。
- 特别检查 VS Code 自带 `mermaid-markdown-features` 扩展；确认能否**不禁用原扩展**且不重复渲染地接管 Mermaid 图表。
- 在目前稳定版 VS Code 和 Cursor 实测；记录支持版本、预览刷新、CSP 与资源加载限制。
- 如果原生 Markdown 预览无法稳定接管，优先提供 `Mermaid Flair: Open Diagram Preview` 独立预览命令作为兼容方案；不要声称已替换原生预览。是否继续推进此平台，由该阶段验收结果决定。

**阶段退出标准**：两个宿主均有运行截图/录屏、实现位置、冲突说明和可复现的 demo。出现严重宿主兼容问题时，暂停开发该端，不牺牲另一端的稳定性。

## 六、分阶段开发与验收

### Phase 0 — 技术可行性（必须先完成）

交付：两端最小运行 Demo、宿主 API 验证报告、初始语法测试集、关键风险决策文档。

验收：在一份含多个 Mermaid 图表的 Markdown 中，能稳定展示且不出现重叠/重复渲染；关闭插件后仍可使用宿主默认渲染。

### Phase 1 — 共享渲染与风格

交付：renderer + themes、Minimal/Modern/Sketch、自动明暗适配、Flowchart/Sequence 示例、异常处理与回退。

验收：3 个预设视觉上明显不同；中英文、长文本和复杂分支无明显重叠；官方 Mermaid 支持而增强渲染器不支持的图表能够显示。

### Phase 2 — Obsidian MVP

交付：完整插件包、阅读与实时预览集成（以实验结果为准）、悬浮操作入口、大图查看、SVG 导出、简洁设置页。

验收：启用/禁用、切换笔记、更新源码、切换明暗主题、刷新应用均正常；不改动笔记内容；支持离线运行。

### Phase 3 — VS Code / Cursor MVP

交付：VSIX、与官方 Markdown 预览的稳定集成（若 Spike 通过），否则独立图表预览、相同主题和查看操作。

验收：VS Code 和 Cursor 都能手动安装；文档含多图时不重复渲染、不破坏其他 Markdown 代码块；清楚标注原生/独立预览支持范围。

### Phase 4 — 测试、打包与发布

交付：单元测试、图表截图对比、跨宿主兼容矩阵、Release 工作流、用户 README、更新日志、隐私说明。

验收：CI 构建/测试/打包成功；Obsidian Release 附件完备；VSIX 离线可安装；发布前完成名称与包 ID 查重，提交社区审核及两个扩展市场。

## 七、回归测试样本

必须包含以下 Mermaid 代码示例（真实样例应保存在 `fixtures/mermaid/`）：

1. 简单与复杂 Flowchart：TD/LR、子图、分支、长节点名称、中文、特殊字符。
2. Sequence：OAuth2 登录流程、多个参与者、`alt/else`、`loop`、`note`、长消息、虚线。
3. State / Class / ER：官方引擎默认与回退路径。
4. 不受支持的图表类型（如甘特或思维导图）：不出现空白。
5. 非法 Mermaid 代码：有明显错误提示且不影响同页其他图表。
6. 多图 Markdown：至少 10 个图表；编辑/滚动/切换主题不重复挂载。
7. 明暗主题及高缩放比例；导出后的 SVG 可被浏览器直接打开。

性能：在开发时确定客观预算（例如 10 张中等复杂图表的首次预览、单图编辑后更新耗时），记录基线，避免一开始拍脑袋设硬指标。

## 八、产品交互原则

- 默认“安装即使用”：不弹首次引导，不要求先配置布局参数。
- 主设置仅保留：默认风格、跟随宿主明暗、是否显示悬浮工具栏。
- 默认图表只在悬浮/聚焦时出现两个入口：风格、放大。导出、适应窗口、复位等放进大图查看器。
- 风格切换不修改 Mermaid 源码；设置中的默认风格持久化，单图切换仅本次显示生效。
- 移动端暂不做承诺；首版先确保桌面版稳定，后续根据 Obsidian API 和包体积评估。

## 九、发布与维护

- 推荐 MIT 开源，保留第三方依赖的 LICENSE/NOTICE，并定期检查上游许可变化。
- Obsidian 插件 ID 需满足官方唯一性约束；根目录 manifest 要与 GitHub Release 对应。
- VS Code 与 Open VSX 使用相同的 VSIX 标识 `publisher.name`，但分别在各平台创建 Publisher/Namespace。
- 不默认开启分析、网络请求或遥测；README 披露第三方库与可能的渲染差异。
- 两个插件版本独立。Obsidian Git tag 用严格的纯版本号（例如 `0.1.0`）；VS Code 可使用单独的 tag 前缀（如 `vscode-v0.1.0`）。
- 使用 CI 检查共享包、平台构建、发布产物和根 manifest 同步，不在第一版引入复杂的变更集工作流。

## 十、给开发 Agent 的执行要求

1. **先完成 Phase 0，不要直接全量开发。** 提交实验报告：宿主版本、关键源码/API、可复现样例、能否接管、风险与建议。
2. 每完成一个阶段，提供：改动摘要、运行命令、测试证据、截图、遗留问题；由主 Agent 按验收标准审核。
3. 保持实现简单：不增加无关依赖、不滥建抽象、不修改 Mermaid 源码、不使用宿主私有 API。
4. 有冲突时优先满足：稳定显示 > 兼容语法 > 美观 > 功能数量。
5. 对架构方案如有更优的、证据充分的替代，先记录权衡再调整；不要默默扩大产品范围。

## 参考资料（先读再做）

- VS Code 官方 Markdown 扩展 API：https://code.visualstudio.com/api/extension-guides/markdown-extension
- VS Code 内置 Mermaid 扩展：https://github.com/microsoft/vscode/tree/main/extensions/mermaid-markdown-features
- Obsidian Markdown Post Processing：https://docs.obsidian.md/Plugins/Editor/Markdown%20post%20processing
- Obsidian 插件提交：https://docs.obsidian.md/Plugins/Releasing/Submit%20your%20plugin
- Mermaid 布局：https://mermaid.ai/open-source/config/layouts.html
- Mermaid 外观与语法：https://mermaid.ai/open-source/intro/syntax-reference.html
- beautiful-mermaid：https://github.com/lukilabs/beautiful-mermaid
- VS Code 发布：https://code.visualstudio.com/api/working-with-extensions/publishing-extension
- Open VSX 发布：https://github.com/eclipse-openvsx/openvsx/wiki/Publishing-Extensions
