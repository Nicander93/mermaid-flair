# 首次公开发布记录

2026-11-11，项目推送到公开仓库 [Nicander93/mermaid-flair](https://github.com/Nicander93/mermaid-flair)，默认分支为 main。

- 初始源码提交：`fed51db`。
- CI 修正及 Release 源码提交：`ca5bd81`。
- [main 分支 CI](https://github.com/Nicander93/mermaid-flair/actions/runs/43037590318)：依赖安装、类型/清单检查、35 项浏览器测试、打包、ZIP 完整性及产物上传通过。
- [0.5.2 标签发布工作流](https://github.com/Nicander93/mermaid-flair/actions/runs/43037925449)。
- [0.5.2 公开预览 Release](https://github.com/Nicander93/mermaid-flair/releases/tag/0.5.2)。

Release 同时提供 VSIX、Obsidian ZIP、main.js、manifest.json、styles.css、LICENSE、THIRD_PARTY_NOTICES.txt 和 SHA256SUMS.txt。发布任务先检查清单版本和七个安装附件的校验值，再发布为预览版。

发布后已从公开 Release 回下载全部八个附件，七项 SHA-256 校验值均匹配；VSIX 和 Obsidian ZIP 的完整性及其中的 0.5.2 版本清单也已核对。

托管 Runner 使用 Ubuntu 24.04 的预装 Chrome。首次尝试在浏览器安装步骤等待，已取消旧任务并改为验证预装浏览器，后续流水线通过。

此记录不代表商店上架或新增原生宿主验收。VS Code/Cursor 的原生验证缺口和其他系统边界继续见[兼容性](compatibility.md)。
