# kais-archi — 架构图自动生成

## 触发词
`架构图`, `architecture`, `arichi`, `系统架构`, `生成架构图`, `画架构`, `pipeline图`, `流程图`

## 功能
从任意项目/Skill 的代码和文档中，自动分析结构，生成精美的 HTML 架构图，支持以下类型：

1. **管线架构图**（Pipeline）— 有序阶段的处理流程
2. **模块关系图**（Module Map）— 组件间的依赖和数据流
3. **数据流图**（Data Flow）— 数据在系统中的流转路径
4. **混合图**（Combined）— 管线 + 横切能力 + 数据流

## 执行流程

### Step 1: 结构探测
自动扫描目标目录，提取架构信息：

```
探测规则：
├── SKILL.md → 提取管线阶段、子 Skill 列表、共享工具
├── skills/*/SKILL.md → 提取子模块功能描述
├── lib/*.js / lib/*.py → 提取共享库和导出函数
├── scripts/*.sh / scripts/*.py → 提取脚本工具
├── package.json → 提取依赖关系
├── docs/*.md → 提取设计文档引用
└── git log --oneline → 提取最近开发活动
```

**关键探测函数**：
- `detectPipeline()` — 从 SKILL.md 的 Phase/Step 标记中提取管线阶段
- `detectSkills()` — 扫描 skills/ 子目录，提取每个 skill 的触发词和功能
- `detectLibraries()` — 扫描 lib/ 目录，提取导出函数
- `detectDataFlow()` — 从代码中的 import/require 和函数调用中推断数据流
- `detectCrossCutting()` — 识别贯穿多阶段的横切能力（如 git、guard、锚定）

### Step 2: 架构建模
将探测结果结构化为模型：

```json
{
  "title": "项目名",
  "subtitle": "一句话描述",
  "phases": [
    {
      "id": "Phase 1",
      "name": "需求确认",
      "skill": null,
      "outputs": ["brief.md"],
      "tags": []
    }
  ],
  "crossCutting": [
    { "name": "Git 版本管理", "icon": "📌", "phases": "all" }
  ],
  "dataFlow": [
    { "from": "art_direction.json", "via": "视觉风格", "to": "sketch-to-render" }
  ],
  "libraries": [
    { "name": "git-stage-manager.js", "exports": ["checkpoint", "rollback"] }
  ]
}
```

### Step 3: HTML 渲染
基于模型生成 HTML 页面，内置多种视觉风格：

**风格选项**：
- `dark` — 深色主题（默认，适合开发者文档）
- `light` — 浅色主题（适合演示文稿）
- `gradient` — 渐变主题（适合 landing page）
- `minimal` — 极简主题（适合快速查看）

**渲染规则**：
- 每个 Phase 用卡片展示，标注 Skill、产出物、标签
- Phase 之间用箭头连接，标注审核/回滚条件
- 横切能力用网格卡片展示
- 数据流用 monospace 文本图展示
- 延长链/特殊流程用独立区块高亮
- 底部附图例说明

### Step 4: 本地预览
```bash
# 启动 HTTP 服务器
cd /tmp && python3 -m http.server 8090 &

# 输出访问地址
echo "http://<局域网IP>:8090/arch.html"
```

## 参数

| 参数 | 说明 | 默认值 |
|------|------|--------|
| `target` | 目标项目/Skill 目录 | 必填 |
| `output` | 输出 HTML 文件路径 | `/tmp/arch-<project>.html` |
| `style` | 视觉风格 | `dark` |
| `type` | 图类型 | `combined` |
| `port` | HTTP 预览端口 | `8090` |
| `serve` | 是否启动预览服务器 | `true` |

## 使用示例

### 基本用法
```
帮我生成 kais-movie-agent 的架构图
→ 自动探测 ~/.openclaw/workspace/skills/kais-movie-agent/ 结构
→ 生成 HTML → 启动预览 → 返回访问 URL
```

### 指定风格
```
用浅色风格生成这个项目的架构图
```

### 指定类型
```
只画数据流图，不需要管线
```

### 自定义目录
```
帮我画 ~/projects/my-app 的架构图
```

## 输出规范

### HTML 文件
- 单文件 HTML（内联 CSS，无外部依赖）
- 响应式布局（移动端适配）
- 文件大小控制在 20KB 以内
- 深色模式默认，尊重 `prefers-color-scheme`

### 结构层次
```
1. 标题 + 副标题
2. 管线流程（Phase 卡片 + 箭头）
3. 特殊流程详情（如延长链、审核循环）
4. 横切能力（网格卡片）
5. 数据流（monospace 图）
6. 图例
```

## CSS 设计系统

```css
/* 配色 */
--bg-primary: #0a0a0f;
--bg-card: #1a1a2e;
--border: #2d2d4a;
--text-primary: #ffffff;
--text-secondary: #e0e0e0;
--text-muted: #888888;
--accent: #6c5ce7;       /* 主色 */
--success: #00b894;       /* 产出物/完成 */
--warning: #fdcb6e;       /* 锚定/注意 */
--danger: #ff6b6b;        /* 守卫/失败 */
--info: #74b9ff;          /* 引用/链接 */
--muted: #636e72;         /* 审核/中性 */

/* 间距 */
--phase-gap: 12px;
--card-padding: 16px 20px;
--tag-gap: 6px;

/* 字体 */
font-family: 'SF Pro Display', -apple-system, sans-serif;
mono: monospace;
```

## 与其他 Skill 的协作

- **kais-pilot**：项目初始化后自动生成架构图作为文档
- **skill-creator**：新建 Skill 后自动生成架构图验证结构
- **gh-issues**：PR 中附架构图方便 review

## 文件结构
```
kais-archi/
├── SKILL.md
├── lib/
│   ├── detector.js      # 结构探测（管线/模块/数据流/横切）
│   ├── modeler.js       # 架构建模（结构化数据）
│   └── renderer.js      # HTML 渲染（多风格模板）
└── templates/
    ├── dark.css          # 深色主题样式
    ├── light.css         # 浅色主题样式
    └── minimal.css       # 极简主题样式
```

## 设计原则

1. **零配置**：只需指定目标目录，自动完成探测→建模→渲染
2. **单文件输出**：HTML 内联所有资源，可直接分享
3. **源码即文档**：从实际代码和 SKILL.md 提取，不手动维护
4. **快速迭代**：代码改动后重新生成，架构图自动同步
5. **美观实用**：深色主题 + 响应式 + 标签系统，适合开发者阅读
