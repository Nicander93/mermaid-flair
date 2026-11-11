# 排查与反馈

## 安装后没有变化

- **VS Code / Cursor**：确认扩展已启用，执行 Developer: Reload Window，再重新打开普通 Markdown Preview。插件处理的是 Mermaid 代码块。
- **Obsidian**：确认插件文件直接位于 `.obsidian/plugins/mermaid-flair/` 下，并已在第三方插件设置中启用。打开阅读视图；Live Preview 使用内置渲染。
- 如果只下载了仓库的源码 ZIP，需要先构建。安装需要编译后的 VSIX，或 Obsidian 的 main.js、manifest.json、styles.css。
- 多个插件可能同时处理 Mermaid。可以在临时配置或测试笔记库中只启用 Mermaid Flair，帮助定位冲突。

## 图表报错

展开图表中的 Details 查看诊断，并用最小 Mermaid 代码块重现。插件使用内置 Mermaid，宿主或其他工具支持的较新语法不一定已包含在当前版本中。远程图片、外部资源和活动链接受限制。

错误图表不会阻止其余代码块渲染。图型与宿主限制见[兼容性](docs/compatibility.md)。

## 复制图像失败

使用图表右上角的复制图像按钮；Ctrl/Cmd+C 在有选择时会复制标签文字。如果宿主不允许写入图像剪贴板，可使用右键菜单中的 Save image 保存 PNG。

## SVG 在另一台电脑上字体不同

SVG 保留字体声明，没有嵌入宿主字体。接收设备缺少相应字体时会使用回退字体；需要保留本机字形时可使用 PNG。

## 提交问题

仓库公开托管后，请使用本仓库的 Issues。提供以下信息即可：

1. Mermaid Flair 版本，以及编辑器名称和实际版本。
2. 操作系统、阅读/预览模式、主题和明暗模式。
3. 操作步骤、期望结果和实际结果。
4. 可公开的最小 Mermaid 代码块；涉及外观时附上截图。

插件没有遥测，维护者不会自动收到错误报告。[隐私说明](docs/privacy.md)介绍本地渲染、剪贴板与导出的行为。
