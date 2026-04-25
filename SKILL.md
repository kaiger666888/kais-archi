---
name: kais-archi
version: 3.0.0
description: "管线架构图生成引擎，单文件 HTML 输出，含 I/O 标注。触发词：架构图, architecture, 管线图, pipeline, 流程图, 数据流图, 系统架构, 生成架构图"
---

# kais-archi — 管线架构图生成引擎

## 触发词
`架构图`, `architecture`, `管线图`, `pipeline`, `流程图`, `数据流图`, `系统架构`, `生成架构图`

## 功能
从任意项目/Skill 的代码和文档中，自动分析管线结构，生成含 I/O 标注的架构图。

**输出格式**：单文件 HTML（内联 CSS，深色主题，无外部依赖）

## 执行流程

### Step 1: 结构探测
自动扫描目标目录，提取架构信息：

```
探测规则：
├── SKILL.md → 提取管线阶段、子 Skill 列表、I/O 标注
├── lib/pipeline.js → 提取精确的 Phase 定义（outputFiles, review）
├── skills/*/SKILL.md → 提取子模块功能描述
├── lib/*.js / lib/*.py → 提取共享库和导出函数
└── 代码/文档中的 → 数据流
```

**核心探测函数**（`lib/detector.js`）：
- `detectArchitecture(dir)` — 主入口，返回完整架构模型
- `detectPipeline(dir)` — 从 SKILL.md 的 Phase 标记中提取管线阶段
- `detectPipelineIO(dir)` — 从 lib/pipeline.js 提取精确的 outputFiles/review
- `detectSkills(dir)` — 扫描 skills/ 子目录
- `detectLibraries(dir)` — 扫描 lib/ 目录，提取导出函数
- `detectDataFlow(dir)` — 从代码中的数据流标记推断数据流
- `detectCrossCutting(dir)` — 识别横切能力
- `detectInputsOutputs(dir)` — 提取输入输出类型

### Step 2: HTML 渲染
基于模型生成管线架构图（`lib/renderer.js`）。

**HTML 结构**：标题 → 管线流程（Phase 卡片 + I/O 面板）→ 跨阶段数据流 → 横切能力 → 图例

**Phase 卡片**：Phase 编号 + 名称 + 子 skill（橙色）+ 标签（hook/review/optional/forced）

**I/O 面板**（右侧 180px）：
- 📥 输入文件（绿色高亮）
- 📤 输出文件（蓝色高亮，从 pipeline.js 的 outputFiles 提取）

**CSS 设计**：
- 深色主题（#0d1117 背景）
- Phase 卡片 hover 时边框变蓝
- 输出文件蓝色高亮（#79c0ff）、输入文件绿色高亮（#7ee787）
- 标签使用半透明背景+边框

### Step 3: 本地预览
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

## 使用示例

```
帮我生成 kais-camera 的架构图
生成这个项目的管线架构图
用浅色风格生成架构图
```

## 输出规范

- 单文件 HTML（内联 CSS，无外部依赖）
- 响应式布局（移动端适配）
- 文件大小控制在 20KB 以内

## 与其他 Skill 的协作

- **kais-pilot**：项目初始化后自动生成架构图作为文档
- **skill-creator**：新建 Skill 后自动生成架构图验证结构

## 文件结构
```
kais-archi/
├── SKILL.md
├── lib/
│   ├── index.js          # 入口（generate 函数）
│   ├── detector.js       # 结构探测
│   └── renderer.js       # HTML 渲染（手写 I/O 风格）
└── templates/            # CSS 模板（保留兼容）
```

## 设计原则

1. **零配置**：只需指定目标目录，自动完成探测→建模→渲染
2. **单文件输出**：HTML 内联所有资源，可直接分享
3. **源码即文档**：从实际代码和 SKILL.md 提取，不手动维护
4. **I/O 可视化**：每个 Phase 标注具体输入输出文件
5. **美观实用**：深色主题 + 响应式 + 标签系统
