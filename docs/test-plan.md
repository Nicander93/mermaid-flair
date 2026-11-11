# 测试记录与复现

## 0.5.2（2026-11-06）

35 项自动回归通过。新增隔离 iframe 的连续切换回归，确认旧任务被取消、最终 SVG 与最新主题一致。新增暗色流程图检查覆盖三套主题：浅彩节点配深色文字，分组和关系标签配浅色文字，默认连线及箭头为 #b6c2cf、线宽 2px，作者指定的颜色和 1px 细线保持原样。验证暗色 PNG 复制和 SVG 导出，并补充时序图上下参与者颜色一致性、人物标签、消息和注释，以及状态、类、ER、甘特、思维导图和饼图的暗色样例。

真实 Obsidian 运行时通过 API 记录为 **1.15.0**，阅读视图、默认主题保存、实际明暗切换、精简弹层、选择与源码定位通过；系统剪贴板确认得到 3265×693 的完整 PNG。本轮没有重跑 VS Code/Cursor 原生交互，相关缺口继续保留。

此前未记录运行时 API 版本，本轮原生脚本已加入采集，确认本次完整验证的运行时为 1.15.0，见[版本记录](evidence/obsidian-runtime-0.5.2.json)。

保留证据：[白板暗色](evidence/whiteboard-dark-0.5.2.png)、[白板亮色](evidence/whiteboard-light-0.5.2.png)、[简洁暗色](evidence/clean-dark-0.5.2.png)、[纸张暗色](evidence/paper-dark-0.5.2.png)、[文字角色与作者样式](evidence/dark-labels-0.5.2.png)、[时序图](evidence/dark-sequence-0.5.2.png)、[饼图](evidence/dark-pie-0.5.2.png)、[Obsidian 阅读视图](evidence/obsidian-reading-0.5.2.png)、[Obsidian 暗色](evidence/obsidian-dark-0.5.2.png)、[设置](evidence/obsidian-settings-0.5.2.png)。

## 0.5.1（2026-11-06）

本轮仅修改共享渲染器和主题，没有更改宿主接入。33 项自动回归覆盖原有行为，并新增截图中[应用总览](../fixtures/mermaid/app-overview.md)的轮廓连续性检查：读取实际 SVG 曲线端点，确认节点圆角处各段衔接和闭合。该检查在旧描边实现上失败，在新实现上通过。

三套主题仍检查亮暗文字对比度，完整 shell 图覆盖六种主题与明暗组合，选择恢复及干净 PNG/SVG 导出回归保持通过。保留[调整前暗色](evidence/whiteboard-dark-before-0.5.1.png)、[调整后暗色](evidence/whiteboard-dark-0.5.1.png)及[调整后亮色](evidence/whiteboard-light-0.5.1.png)供视觉评审。本轮验证使用浏览器及构建包，原生宿主验证范围沿用下面的 0.5.0 记录。

## 0.5.0（2026-11-05）

32 项自动回归覆盖普通 Markdown 接入、加载顺序和重复加载、原始围栏来源、增量更新、三套主题及旧设置迁移、分组与树分支配色、作者颜色优先、节点及连线局部选择、箭头隔离、宿主代码字体与明暗变化、精简弹层、PNG 复制和 SVG 导出、源码定位与外部资源拦截。颜色测试同时检查亮暗主题的标签对比度。

反馈中的 shell 图已保留为完整的[层级图样例](../fixtures/mermaid/layered-shell.md)，覆盖三套主题的亮暗模式。原生预览回归故意在 code DOM 前加入额外标题，确认渲染使用后端传来的原始围栏内容。原截图的具体触发条件未能重现，不能据此断言其唯一原因。

PNG 自动测试验证文件签名、完整尺寸及选择和缩放前后的输出一致。Obsidian 原生测试还读取系统剪贴板图像尺寸，确认得到 3263×690 的图像。

| 宿主 | 本次结果 | 验证边界 |
| --- | --- | --- |
| Obsidian（历史测试未采集运行时版本） | 阅读视图、选择、源码定位、四按钮弹层、系统 PNG 剪贴板、三套默认主题保存、实际外观明暗切换通过 | 桌面阅读视图接管；Live Preview 保持原生。未测移动端。 |
| Cursor 3.28.7 | 同标签 Preview 自动渲染九图一诊断、键盘多选、局部高亮、四按钮弹层和原生源码命令通过 | 隔离登录页遮挡工作台，鼠标和复制仍需已登录环境验收。禁用非 VS Code 自带扩展并审计未激活。 |
| VS Code 1.141.2 | 当前原生预览集成的浏览器及构建包测试通过 | 本次隔离宿主启动未创建工作台窗口，未执行到交互。0.4.0 的原生验证通过，不能替代本版宿主验收。 |

保留证据：[简洁弹层](evidence/popup-0.5.0.png)、[自动分组配色](evidence/automatic-groups-0.5.0.png)、[白板亮色](evidence/whiteboard-light-0.5.0.png)、[白板暗色](evidence/whiteboard-dark-0.5.0.png)、[简洁主题](evidence/clean-light-0.5.0.png)、[纸张主题](evidence/paper-light-0.5.0.png)、[Obsidian 阅读视图](evidence/obsidian-reading-0.5.0.png)、[Obsidian 设置](evidence/obsidian-settings-0.5.0.png)、[Cursor 禁用清单](evidence/cursor-disabled-extensions-0.5.0.json)。

## 复现

```sh
pnpm check
pnpm test
pnpm package
```

使用 Node.js 24 和 pnpm 11.8.0。通过 FLAIR_CHROMIUM 指定本机 Chrome，默认使用 Playwright Chromium。测试生成 playwright-report/index.html，清理后可重新运行生成。

原生验证使用隔离配置与开发扩展目录：

```powershell
node scripts/native-smoke.mjs vscode 'C:/path/to/Code.exe'
node scripts/native-smoke.mjs cursor 'C:/path/to/Cursor.exe' --custom
node scripts/spike.mjs obsidian 'C:/path/to/Obsidian.exe' --mvp --settings
```

Cursor 脚本通过启动参数禁用所有非 VS Code 自带扩展，包含代理、MCP、浏览器和电脑代理扩展，并审计激活日志；不会调用 Cursor AI。登录界面出现时跳过鼠标与剪贴板路径。旧的通用 spike 入口禁止启动 VS Code/Cursor，统一使用此脚本。

## 安装与清理

VSIX 用 Install from VSIX… 安装后 Reload Window；Obsidian 将解压目录放入 Vault 的 .obsidian/plugins/ 并启用。真实宿主测试使用开发目录，发布前仍需用户在日常配置中验收安装包。

powershell -File scripts/clean.ps1 预览清理范围，加入 -Apply 才执行。清理只涉及仓库内的临时宿主配置、缓存、测试报告、测试构建、旧版本安装包及明确列出的未引用旧截图，保留源码、依赖与当前安装包。
