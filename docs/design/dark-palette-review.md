# 暗色配色评审

这份稿件保留深灰画布上两组浅彩节点的历史评审，使用同一份应用总览、代码字体、布局与手绘轮廓。选定的 B + B2 连线方案已落实到 0.5.2；这些 HTML 和截图保留当时的对比状态。

- [打开可切换的对比页](dark-palette-review.html)：A/B 并排、单独查看 A 或 B、查看当前版本，并可展开分组图。
- [并排截图](../evidence/dark-palette-comparison.png)
- [A：柔和浅彩](../evidence/dark-palette-a.png)
- [B：亮色白板](../evidence/dark-palette-b.png)
- [分组标题与连线标签](../evidence/dark-palette-labels.png)

| 方案 | 填充色 | 节点文字 |
| --- | --- | --- |
| A：柔和浅彩 | #a8c4d8、#b2cfbd、#d9cfaa、#d7b8bf、#c5bada、#d4c3b3 | #26313a |
| B：亮色白板 | #a5d8ff、#b2f2bb、#ffec99、#ffc9c9、#d0bfff、#ffd8a8 | #26313a |

两者画布均为 #1b1d21，连线为 #8995a1，节点描边混合填充色与深色文字。直接位于画布上的分组标题、连线标签使用 #e2e7ed，避免和节点一起改成深色文字。

用户已选择 B，保留亮色白板的浅彩节点与深色文字。0.5.2 已区分节点与画布文字，并验证其他图型与导出。

## 连线评审

用户反馈 B 的连线较弱。保持节点不变，比较 B1（连线从 #8995a1 提亮为 #b6c2cf，保留 1.5px）与 B2（同样提亮，线宽提高到 2px），箭头同步提亮。当前建议 B2，缩小阅读时更容易辨认关系线。

- [打开连线对比页](dark-connections-review.html)，可切回原连线对照。
- [连线对比截图](../evidence/dark-connections-comparison.png)
- [分组图连线对比](../evidence/dark-connections-labels.png)
- [网络参考图集](dark-diagram-references.html)

连线评审已采用 B2。正式渲染的连线颜色、箭头、线宽和作者样式优先级已加入浏览器回归；临时构建覆盖脚本已移除，历史快照继续保留。

历史稿件使用包内 Mermaid 和 Rough.js 生成真实 SVG，没有外部资源请求。当前版本通过 `pnpm test` 复现测试，并生成实际渲染截图。
