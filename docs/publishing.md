# 公开分发准备

当前目标是公开源码仓库与插件安装包，优先让读者能够看到效果、完成安装并准确反馈问题。内部 packages 暂不作为 npm SDK 发布；根工作区保留 private 状态。

## 已具备的基础

- 中英文 README、真实主题配图、快速图例、安装和排查说明。
- VSIX、Obsidian 插件目录、MIT LICENSE 和各成品的第三方许可声明。
- 主题、隔离渲染、交互、复制导出的自动回归，以及记录了边界的宿主验证。
- GitHub Actions 验证和 Release 草稿流程；发布任务已明确使用 Node.js 24，与直接导入 TypeScript 的校验脚本保持一致。

这些是本地准备结果。当前项目已初始化 Git 并关联 [Nicander93/mermaid-flair](https://github.com/Nicander93/mermaid-flair)。远端构建结果见 [Actions](https://github.com/Nicander93/mermaid-flair/actions)，安装包见 [Releases](https://github.com/Nicander93/mermaid-flair/releases)。商店条目尚未发布。

## 首次公开之前

| 优先级 | 工作 | 当前缺口 |
| --- | --- | --- |
| P0 | 确定维护者与公开仓库地址 | 初始化 Git、创建远端并选择默认分支；据此填写真实 repository、homepage、bugs 和作者信息。 |
| P0 | 跑通远端 CI | 本地检查不替代 GitHub Actions 实跑，先用一个提交检查安装、测试、成品路径和上传。 |
| P0 | 完成用户安装验收 | 在日常 VS Code/Cursor 配置里安装 VSIX并测试普通预览、明暗切换和复制；补齐当前原生验证缺口。 |
| P0 | 发布首个可下载版本 | 统一版本和附件；核对 VSIX、Obsidian 文件、更新记录及许可证。先生成可审阅的 Release 草稿。 |
| P1 | 改善下载体验 | 将 Obsidian 目录自动打成 ZIP，生成 SHA-256 清单，并一起上传；package 命令已生成 ZIP 和校验值，Release 流程会上传全部附件。 |
| P1 | 建立反馈入口 | 启用 Issues，检查问题模板，确定维护者的私下安全问题报告渠道。 |

建议一个纯版本号的 Release 同时携带两端插件。工作流已统一采用纯版本号 tag：通过构建、测试及校验后，创建草稿并发布为公开预览 Release。

Obsidian 要求 Release tag 与根 manifest.json 的 version 完全一致，例如 0.5.2；用于安装的 main.js、manifest.json、styles.css 需要作为单独附件上传。只提交源码或只上传源码 ZIP不能替代这些附件。[官方提交说明](https://docs.obsidian.md/Plugins/Releasing/Submit%20your%20plugin)

## 插件商店上架之前

### VS Code Marketplace / Open VSX

- 确定并取得真实 Publisher / Namespace；当前清单里的 mermaid-flair 尚不能据此认定为已注册身份。
- 补充实际仓库和问题地址、关键词、PNG 图标、商店截图及支持入口。
- 再检查商店 README 的图片和链接解析，使用公开 HTTPS 地址，或通过 repository 元数据让打包工具转换相对地址。
- 发布认证方式以官方当前流程为准；单独配置商店发布权限，避免把凭据写进源码。

VS Code 文档说明了 Publisher、商店图片和图标要求，以及自动发布方式；Open VSX 的 Namespace 权限独立管理。[VS Code 发布文档](https://code.visualstudio.com/api/working-with-extensions/publishing-extension) · [Open VSX Namespace](https://github.com/eclipse-openvsx/openvsx/wiki/Namespace-Access)

### Obsidian 社区目录

- 核对根 manifest、README、LICENSE，以及公开 Release 的编译文件。
- 建立 versions.json 的最低版本兼容记录。官方说明只在调整 minAppVersion 等兼容边界时需要维护回退映射，并非每次补丁都必须新增一条。
- 按当前社区目录流程关联 GitHub 和 Obsidian 账号并提交插件，处理审核反馈。不要沿用旧资料中直接修改 GitHub 社区列表的提交方式。

参考：[提交插件](https://docs.obsidian.md/Plugins/Releasing/Submit%20your%20plugin) · [版本兼容映射](https://docs.obsidian.md/Reference/Versions)

## 首次发布后

优先处理真实用户反馈和宿主兼容：补充 macOS/Linux 原生验收、更多图型的外观一致性，再考虑独立开发者 API。扩充主题数量应以可维护性和实际阅读效果为依据。

发布前另需确认项目名称、作者和版权主体，以及当前 MIT 许可是否符合维护者的分发意图。已有第三方许可声明继续随安装包保留。

