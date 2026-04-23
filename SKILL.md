---
name: kais-archi
version: 2.1.0
description: "架构图自动生成引擎，7 种图表 + 3 种输出格式（HTML/Mermaid/Notion）。触发词：架构图, architecture, 依赖图, 调用图, call graph, 时序图, sequence, 生态图, 全景图, layer map, skill关系, 管线图, pipeline, 流程图, 数据流图, 系统架构, 生成架构图, 画架构, 模块图, 项目结构图"
---

# kais-archi — 架构图自动生成引擎

## 触发词
`架构图`, `architecture`, `依赖图`, `调用图`, `call graph`, `时序图`, `sequence`, `生态图`, `全景图`, `layer map`, `skill关系`, `管线图`, `pipeline`, `流程图`, `数据流图`, `系统架构`

## 功能
从任意项目/Skill 的代码和文档中，自动分析结构，生成架构图。支持 **3 种输出格式**和 **7 种图表类型**。

## 📤 输出格式

| 格式 | 说明 | 用途 |
|------|------|------|
| **HTML** | 单文件 HTML（内联 CSS，交互式） | 本地预览、嵌入文档、分享 |
| **Mermaid** | `.mmd` 源码文件（Beautiful-Mermaid 规范） | 粘贴到 Notion/GitHub/文档 |
| **Notion** | 自动创建子页面并写入 Mermaid 代码 | 直接在 Notion 中查看 |

**多格式同时输出**：`--format html,mermaid,notion --notion <页面ID>`

## 🎯 图表类型自动选择指南

**根据用户意图自动匹配，也可用户显式指定：**

| 用户说了什么 | 自动选择 type | 说明 |
|-------------|--------------|------|
| "架构图"、"系统架构"、"画架构" | `all` | 默认：生成全部图表 + 导航中心页 |
| "依赖图"、"调用图"、"call graph"、"skill关系" | `call-graph` | Skill 间的触发/调用关系 |
| "时序图"、"sequence"、"交互流程" | `sequence` | 组件间的交互时序 |
| "生态图"、"全景图"、"skill总览"、"所有skill" | `layer-map` | 所有 Skill 的分层架构 |
| "管线图"、"pipeline"、"执行流程" | `pipeline` | 有序阶段处理流程 |
| "数据流"、"data flow" | `combined` | 包含在混合图中 |

**7 种图表类型**：
1. **管线架构图**（`pipeline`）— 有序阶段的处理流程
2. **Skill 依赖调用图**（`call-graph`）— Skill 间的触发/调用关系，力导向布局
3. **时序图**（`sequence`）— 组件间的交互时序，UML 经典风格
4. **生态全景分层图**（`layer-map`）— 所有 Skill 的分层架构总览
5. **模块关系图**（`module`）— 组件间的依赖和数据流
6. **数据流图**（`dataflow`）— 数据在系统中的流转路径
7. **混合图**（`combined`）— 管线 + 横切能力 + 数据流（默认）

## 执行流程

### Step 1: 结构探测
自动扫描目标目录，提取架构信息：

```
探测规则：
├── SKILL.md → 提取管线阶段、子 Skill 列表、共享工具
├── skills/*/SKILL.md → 提取子模块功能描述
├── lib/*.js / lib/*.py → 提取共享库和导出函数
├── package.json → 提取依赖关系
└── git log --oneline → 提取最近开发活动
```

**核心探测函数**（`lib/detector.js`）：
- `detectArchitecture(dir)` — 主入口，返回完整架构模型
- `detectPipeline(dir)` — 从 SKILL.md 的 Phase 标记中提取管线阶段
- `detectSkills(dir)` — 扫描 skills/ 子目录
- `detectLibraries(dir)` — 扫描 lib/ 目录，提取导出函数
- `detectDataFlow(dir)` — 从代码中的 import/require 推断数据流
- `detectCrossCutting(dir)` — 识别横切能力

### Step 2: 架构建模
探测结果自动结构化为模型（`detectArchitecture()` 直接返回）：

```json
{
  "title": "项目名",
  "subtitle": "N 个阶段 · M 个子模块 · K 个共享库",
  "phases": [{ "id": "Phase 1", "name": "...", "skill": "...", "tags": [] }],
  "crossCutting": [{ "name": "...", "icon": "📌", "description": "..." }],
  "dataFlow": [{ "from": "...", "to": "..." }],
  "libraries": [{ "name": "...", "exports": ["..."] }]
}
```

### Step 3: HTML 渲染
基于模型生成 HTML 页面（`lib/renderer.js`）。

**风格选项**：`dark`（默认）| `light` | `gradient` | `minimal`

**渲染规则**：
- 每个 Phase 用卡片展示，标注 Skill、产出物、标签
- Phase 之间用箭头连接，标注审核/回滚条件
- 横切能力用网格卡片展示
- 数据流用 monospace 文本图展示
- 底部附图例说明

**CSS 设计系统**：详见 `references/css-design-system.md`

### Step 4: 本地预览
```bash
cd /tmp && python3 -m http.server 8090 &
echo "http://<局域网IP>:8090/arch.html"
```

## 参数

| 参数 | 说明 | 默认值 |
|------|------|--------|
| `target` | 目标项目/Skill 目录 | 必填 |
| `output` | 输出 HTML 文件路径 | `/tmp/arch-<project>.html` |
| `style` | 视觉风格（dark/light/gradient/minimal） | `dark` |
| `type` | 图类型（pipeline/call-graph/sequence/layer-map/combined/**all**） | `all` |

## 使用示例

```
帮我生成 kais-camera 的架构图                    → 全部类型 + HTML/Mermaid
帮我生成架构图并输出到 Notion                    → --format html,mermaid,notion --notion <页面ID>
生成依赖调用图的 Mermaid 代码                   → --format mermaid
只画管线图                                      → --format html
用浅色风格生成这个项目的架构图
生成生态全景图
```

## 输出规范

- 单文件 HTML（内联 CSS，无外部依赖）
- 响应式布局（移动端适配）
- 文件大小控制在 20KB 以内
- 结构：标题 → 管线流程 → 特殊流程 → 横切能力 → 数据流 → 图例

## 与其他 Skill 的协作

- **kais-pilot**：项目初始化后自动生成架构图作为文档
- **skill-creator**：新建 Skill 后自动生成架构图验证结构
- **gh-issues**：PR 中附架构图方便 review

## 文件结构
```
kais-archi/
├── SKILL.md
├── scripts/
│   └── generate.sh              # 入口脚本（支持 --format / --notion）
├── lib/
│   ├── index.js                 # 统一入口（generateAll 支持多格式）
│   ├── detector.js              # 结构探测（管线/模块/数据流/横切）
│   ├── renderer.js              # HTML 渲染（多风格模板）
│   ├── mermaid-renderer.js      # Mermaid 代码生成（4 种图表类型）
│   ├── notion-writer.js         # Notion 输出（自动创建子页面）
│   ├── call-graph-detector.js   # Skill 依赖调用图检测
│   ├── call-graph-renderer.js   # 调用图渲染
│   ├── sequence-detector.js     # 时序图检测
│   ├── sequence-renderer.js     # 时序图渲染
│   ├── layer-map-detector.js    # 生态全景分层图检测
│   ├── layer-map-renderer.js    # 分层图渲染
│   ├── hub-renderer.js          # 导航中心页渲染
│   ├── layout-utils.js          # 布局工具函数
│   ├── force-layout.js          # 力导向布局算法
│   └── svg-utils.js             # SVG 工具函数
├── templates/
│   ├── dark.css / light.css / gradient.css / minimal.css
└── references/
    └── css-design-system.md
```

## 设计原则

1. **零配置**：只需指定目标目录，自动完成探测→建模→渲染
2. **单文件输出**：HTML 内联所有资源，可直接分享
3. **源码即文档**：从实际代码和 SKILL.md 提取，不手动维护
4. **快速迭代**：代码改动后重新生成，架构图自动同步
5. **美观实用**：深色主题 + 响应式 + 标签系统，适合开发者阅读
