# 实现决策

## 先确定接入点

Obsidian 桌面版的最小插件用 `registerMarkdownCodeBlockProcessor('mermaid', handler, -100)` 接收原始图表代码。在阅读视图的可见区域，宿主交给 Flair 处理，没有再插入原生 SVG。实时预览仍由内置渲染器处理。正式插件沿用阅读视图的处理器，用 `MarkdownRenderChild` 释放图表、对象 URL 和查看器。插件载入和卸载时，调用公开的 `MarkdownPreviewView.rerender` 刷新已打开的阅读视图。 [Obsidian TypeScript API](https://github.com/obsidianmd/obsidian-api)

0.4.0 将 VS Code／Cursor 普通 Markdown 预览作为主要入口。通过 `markdown.markdownItPlugins` 在 block 阶段后为 Mermaid 围栏指定独立 token 类型，再使用 `markdown.previewScripts` 和 `markdown.previewStyles` 挂载共享查看器。因此不依赖多个插件覆盖 fence renderer 的先后顺序，正文和其他围栏仍交给原有 Markdown 引擎。原生预览的 DOM 更新由 MutationObserver 挂载和释放图表，宿主主题变化直接更新配色。独立 Webview 保留为可选入口。VS Code 标准预览及 Cursor 的标准预览、同标签自定义预览均已实测。 [VS Code Markdown 扩展指南](https://code.visualstudio.com/api/extension-guides/markdown-extension) · [内置 Mermaid 扩展](https://github.com/microsoft/vscode/tree/main/extensions/mermaid-markdown-features)

## 保留一套 Mermaid 语义

两端共用官方 Mermaid 12.3.0、主题变量和查看器。Beautiful Mermaid 提供了另一组视觉风格，但支持语法与官方引擎有差异。布局和诊断沿用官方 Mermaid，时序图使用 Mermaid 自己的时序布局。 [Mermaid 布局](https://mermaid.ai/open-source/config/layouts.html) · [Beautiful Mermaid](https://github.com/lukilabs/beautiful-mermaid)

Sketch 参考 Excalidraw，使用浅色白板、深色笔迹和实色填充。Mermaid 原生手绘外观的密集斜线填充使用固定参数，因此先生成官方 SVG，再用 Rough.js 装饰流程图与时序图中可识别的几何元素，保留原有布局、连接端点、箭头标记及用户颜色。其他元素沿用 Mermaid 的输出。 [Rough.js SVG API](https://roughjs.com/)

0.5.1 固定手绘各段端点并使用单次描画、较低抖动和圆形线帽，保留曲线中段的轻微手绘感。旧实现对每段重复随机描画，圆角处会出现错位断口。填充不再额外增强抖动。暗色主题降低中性线条和文字的亮度，自动着色节点的描边混合其填充与文字色；作者指定的样式仍优先。

0.5.2 根据配色评审选定浅彩节点方案 B，并采用更亮、略粗的 B2 连线。三套主题在暗色画布上保留各自的浅彩填充，分别定义画布文字、节点文字和节点边框。官方主题变量区分节点、时序注释、消息、状态、类、甘特任务与饼图图例的文字角色；默认流程图和时序消息线采用 2px，内联作者线宽保留。使用实际 SVG 检查连线颜色、线宽、箭头与样式优先级。时序参与者头尾副本按同一标识取色，人物标签保持画布文字色。

0.1.2 根据用户偏好改用宿主代码字体。VS Code／Cursor 通过公开配置 API 读取 `editor.fontFamily` 并监听变化，Obsidian 读取宿主的 `--font-monospace`。渲染前校验字体族的 CSS 语法，文字测量和输出使用同一声明。SVG 在另一台设备打开时可以回退到可用代码字体，PNG 保留当前设备渲染结果。

官方 Mermaid 的配置在同一文档内共享。渲染请求按顺序执行，每次应用当前图表的风格与明暗配色。视图只提交最新一次结果，避免切换主题时较早的任务覆盖新结果。VS Code／Cursor 根据代码块位置和内容复用已渲染图表。

0.5.2 还将请求取消传递到隔离 iframe。视图更新或释放时取消旧请求，串行队列在开始执行前跳过已过期任务。单次正在执行的 Mermaid 调用仍完整结束，避免破坏共享配置。这样连续切换主题不会被大量旧请求阻塞；刷新期间暂时禁用图像复制及导出，防止拿到旧配色结果。

## 主题与要素选择

0.5.0 收敛为 Whiteboard、Clean、Paper 三套主题，默认 Whiteboard。每套包含亮暗背景、六种协调填充色、文字与线条色，白板色板参考 Excalidraw 的柔和分类色。旧的八套主题 ID 在读取设置时映射到保留主题，清单校验确保设置枚举与共享列表一致。 [Excalidraw](https://github.com/excalidraw/excalidraw)

自动配色读取固定版本 Mermaid 的 FlowDB，由官方解析器处理语法，不用正则重建关系。显式子图优先，嵌套子图继承顶层色系；无子图且归属明确的单根树按主分支继承。共享依赖、循环和其余节点用标识的稳定散列选色，不根据名称猜业务语义。有限色板会复用颜色，增加分组也可能触发色槽避让；颜色不是业务标识。作者的 classDef/style 填充、描边和文字颜色优先。时序图参与者按标识配色，思维导图和饼图通过官方主题变量使用色板。升级 Mermaid 时需检查内部数据适配与 SVG 标记。

常规预览和放大查看器都使用 Shadow DOM 承载经过净化的 SVG，阻止图表样式影响宿主页面。选择基于当前固定 Mermaid 版本输出的节点、连线和时序要素标记，关联连线标签并扩大细线的命中区域。键盘属性只加到查看副本，导出使用原始净化结果。打开和关闭查看器时同步选择，明暗和字体更新也会保留仍然存在的要素。

0.4.0 去掉选择框，改为只修改查看副本上实际几何路径的描边和轻微填充。悬停、焦点和选择使用同一套局部反馈，原样保留可恢复的内联样式。选中连线的 marker 单独克隆并着色，清除时删除克隆，避免共享箭头定义导致其他连线一起变色。SVG 和 PNG 仍从原始净化结果导出。

源码定位共用 Markdown-it 提取的围栏范围，宿主重新读取当前文档，使用代码块内容与原位置定位图表。元素行号通过渲染输出的节点 ID、参与者 ID、消息端点及唯一标签查找，无法唯一确定时回到代码块开头。内容已变化或重复代码块无法确定时提示重选，不复用过期的行号。VS Code 使用公开编辑器选择 API，Obsidian 使用公开 MarkdownView 编辑器 API，已有编辑视图的未保存内容优先于磁盘文本。

## 阅读界面与输入来源

0.5.0 普通预览仅显示放大和复制图像两个悬浮图标，弹层仅保留缩放、复位和关闭。复制从原始净化结果生成完整 PNG，不包含选择和界面。ClipboardItem 在用户点击期间立即提交异步图像 Promise，避免等待栅格化后失去用户激活；宿主不支持时提供右键保存图像。源码、文字和 SVG 操作放入高级菜单。

原生 Markdown 后端把原始围栏字符串放入编码后的 JSON 选项，前端优先读取该字符串，不把已装饰 code DOM 作为渲染依据；旧缓存仍保留 DOM 回退。诊断默认简短，详情按需展开。反馈截图的额外标题前缀未能在磁盘源文档中复现，此改动解决的是 DOM 内容被第三方装饰后污染输入的风险，不会自动改写非法源文。

## 在发布包里保留许可

根目录 `manifest.json` 是 Obsidian 的唯一清单，构建会复制它，CI 对成品逐字节校验。两个插件独立维护版本。esbuild 列出进入包的模块，构建从各依赖读取许可证和声明并生成 `THIRD_PARTY_NOTICES.txt`。
