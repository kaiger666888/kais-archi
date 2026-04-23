/**
 * kais-archi/mermaid-renderer.js — Mermaid 代码生成器
 * ES Module，零外部依赖
 *
 * 将架构模型（detector 返回值）转为可直接粘贴到 Notion 的 Mermaid 代码
 */

import { detectArchitecture } from './detector.js';
import { detectCallGraph } from './call-graph-detector.js';
import { detectSequenceFromSkill } from './sequence-detector.js';
import { detectLayerMap } from './layer-map-detector.js';

// ── Beautiful Mermaid 暗色主题头 ──────────────────────────

const DARK_THEME_HEADER = `%%{init: {'theme': 'dark', 'themeVariables': {
  'primaryColor': '#3b82f6',
  'primaryTextColor': '#e2e8f0',
  'primaryBorderColor': '#64748b',
  'lineColor': '#94a3b8',
  'secondaryColor': '#1e293b',
  'tertiaryColor': '#0f172a',
  'background': '#0f172a',
  'mainBkg': '#0f172a',
  'nodeBorder': '#64748b',
  'clusterBkg': '#1e293b',
  'titleColor': '#e2e8f0',
  'edgeLabelBackground': '#1e293b',
  'nodeTextColor': '#e2e8f0'
}}}%%`;

// ── 五色系统（Beautiful-Mermaid 规范）─────────────────────
const COLORS = {
  blue:   '#3b82f6',  // 接入/配置层
  purple: '#8b5cf6',  // 控制/状态层
  green:  '#10b981',  // 处理/核心层
  cyan:   '#06b6d4',  // 外部/网络层
  orange: '#f97316',  // 完成/通知层
};

// group 名称 → 颜色映射
const GROUP_COLOR_MAP = {
  orchestration: COLORS.purple,
  content:       COLORS.green,
  dev:           COLORS.cyan,
  infra:         COLORS.blue,
  other:         COLORS.orange,
};

// 层名 → 颜色映射
const LAYER_COLOR_MAP = {
  '自动驾驶层': COLORS.orange,
  '编排层':     COLORS.purple,
  '基础设施层': COLORS.blue,
  '专业能力层': COLORS.green,
};

// ── 工具函数 ─────────────────────────────────────────────

/** Mermaid 安全 ID（只保留字母数字和下划线） */
function safeId(str) {
  return str.replace(/[^a-zA-Z0-9\u4e00-\u9fff_-]/g, '_');
}

/** Mermaid 安全标签（转义双引号和尖括号） */
function safeLabel(str) {
  return str.replace(/"/g, '&quot;').replace(/[<>]/g, '');
}

// ── 管线图 (pipeline / combined) ────────────────────────

/**
 * 将管线模型转为 Mermaid flowchart
 * @param {object} model - detectArchitecture() 返回值
 * @returns {string} Mermaid 代码
 */
function pipelineToMermaid(model) {
  const phases = model.phases || [];
  if (phases.length === 0) return '';

  const lines = [DARK_THEME_HEADER, 'graph TD', ''];

  for (let i = 0; i < phases.length; i++) {
    const p = phases[i];
    const id = safeId(p.id);
    // failCheck 用菱形，否则圆角矩形
    const shape = p.hasFailCheck ? '{' : '[';
    const closeShape = p.hasFailCheck ? '}' : ']';
    const gitMarker = p.hasGit ? ' 📌' : '';
    const label = safeLabel(`${p.id}: ${p.name}${gitMarker}`);

    lines.push(`    ${id}${shape}"${label}"${closeShape}`);

    // 画边到下一个 phase
    if (i < phases.length - 1) {
      const nextId = safeId(phases[i + 1].id);
      const edgeLabel = p.hasFailCheck ? '|审核通过|' : '';
      lines.push(`    ${id} -->${edgeLabel} ${nextId}`);
    }
  }

  // 如果有 dataFlow，补充数据流边
  if (model.dataFlow && model.dataFlow.length > 0) {
    lines.push('');
    for (const flow of model.dataFlow) {
      const fromId = safeId(flow.from);
      const toId = safeId(flow.to);
      lines.push(`    ${fromId} -.->|data| ${toId}`);
    }
  }

  // Beautiful-Mermaid: 边样式
  lines.push('');
  lines.push('    %% 线条样式');
  for (let i = 0; i < phases.length - 1; i++) {
    lines.push(`    linkStyle ${i} stroke:#94a3b8,stroke-width:3px`);
  }

  lines.push('');
  return lines.join('\n');
}

// ── 调用图 (call-graph) ─────────────────────────────────

/**
 * 将调用图模型转为 Mermaid flowchart (LR 方向)
 * @param {object} model - detectCallGraph() 返回值
 * @returns {string} Mermaid 代码
 */
function callGraphToMermaid(model) {
  const { nodes = [], edges = [] } = model;
  if (nodes.length === 0) return '';

  const lines = [DARK_THEME_HEADER, 'graph LR', ''];

  // 按 group 分组
  const groups = new Map();
  for (const node of nodes) {
    const g = node.group || 'other';
    if (!groups.has(g)) groups.set(g, []);
    groups.get(g).push(node);
  }

  // 画 subgraph
  const groupLabels = {
    orchestration: '编排层',
    content: '内容层',
    dev: '开发层',
    infra: '基础设施',
    other: '其他',
  };

  for (const [g, gNodes] of groups) {
    const color = GROUP_COLOR_MAP[g] || COLORS.orange;
    const label = groupLabels[g] || g;
    lines.push(`    subgraph ${safeId(g)}["${label}"]`);
    lines.push(`    style ${safeId(g)} fill:${color}22,stroke:${color},stroke-width:2px`);
    for (const node of gNodes) {
      const id = safeId(node.id);
      const lbl = safeLabel(node.label);
      lines.push(`        ${id}("${lbl}")`);
    }
    lines.push('    end');
    lines.push('');
  }

  // 画边
  for (const edge of edges) {
    const fromId = safeId(edge.source);
    const toId = safeId(edge.target);
    const lbl = safeLabel(edge.label || '');
    if (lbl) {
      lines.push(`    ${fromId} -->|"${lbl}"| ${toId}`);
    } else {
      lines.push(`    ${fromId} --> ${toId}`);
    }
  }

  lines.push('');
  return lines.join('\n');
}

// ── 时序图 (sequence) ───────────────────────────────────

/**
 * 将时序模型转为 Mermaid sequenceDiagram
 * @param {object} model - detectSequenceFromSkill() 返回值
 * @returns {string} Mermaid 代码
 */
function sequenceToMermaid(model) {
  const { actors = [], messages = [] } = model;
  if (actors.length === 0) return '';

  const lines = [DARK_THEME_HEADER, 'sequenceDiagram', ''];

  // 声明参与者
  for (const actor of actors) {
    lines.push(`    participant ${safeId(actor)} as ${safeLabel(actor)}`);
  }
  lines.push('');

  // 画消息
  for (const msg of messages) {
    const fromId = safeId(msg.from);
    const toId = safeId(msg.to);
    const text = safeLabel(msg.text);

    if (msg.return) {
      // 返回消息用虚线箭头
      lines.push(`    ${fromId} -->> ${toId}: ${text}`);
    } else if (msg.async) {
      // 异步消息用开放箭头
      lines.push(`    ${fromId} -x) ${toId}: ${text}`);
    } else {
      // 同步消息
      lines.push(`    ${fromId} ->> ${toId}: ${text}`);
    }
  }

  lines.push('');
  return lines.join('\n');
}

// ── 分层图 (layer-map) ──────────────────────────────────

/**
 * 将分层模型转为 Mermaid flowchart (TD 分层)
 * @param {object} model - detectLayerMap() 返回值
 * @returns {string} Mermaid 代码
 */
function layerMapToMermaid(model) {
  const layers = model.layers || [];
  if (layers.length === 0) return '';

  const lines = [DARK_THEME_HEADER, 'graph TD', ''];

  for (const layer of layers) {
    const id = safeId(layer.name);
    const color = LAYER_COLOR_MAP[layer.name] || layer.color || COLORS.blue;
    lines.push(`    subgraph ${id}["${layer.name}"]`);
    lines.push(`    style ${id} fill:${color}22,stroke:${color},stroke-width:2px`);
    for (const item of layer.items || []) {
      const itemId = safeId(item.id);
      const lbl = safeLabel(item.label);
      lines.push(`        ${itemId}("${lbl}")`);
    }
    lines.push('    end');
    lines.push('');
  }

  lines.push('');
  return lines.join('\n');
}

// ── 主入口 ──────────────────────────────────────────────

/**
 * 将架构模型转为 Mermaid 代码
 * @param {object} model - detectArchitecture() 或其他 detector 的返回值
 * @param {{ type?: string, direction?: string }} options
 * @returns {string} Mermaid 代码字符串
 */
export function toMermaid(model, options = {}) {
  if (!model) return '';

  // 自动推断类型
  const type = options.type || model.type || '';

  switch (type) {
    case 'pipeline':
    case 'combined':
      return pipelineToMermaid(model);

    case 'call-graph':
      return callGraphToMermaid(model);

    case 'sequence':
      return sequenceToMermaid(model);

    case 'layer-map':
      return layerMapToMermaid(model);

    default:
      // 如果有 phases 字段，按 pipeline 处理
      if (model.phases && model.phases.length > 0) {
        return pipelineToMermaid(model);
      }
      // 如果有 nodes + edges，按 call-graph 处理
      if (model.nodes && model.edges) {
        return callGraphToMermaid(model);
      }
      // 如果有 actors + messages，按 sequence 处理
      if (model.actors && model.messages) {
        return sequenceToMermaid(model);
      }
      // 如果有 layers，按 layer-map 处理
      if (model.layers) {
        return layerMapToMermaid(model);
      }
      return '';
  }
}

/**
 * 批量探测并转换目标目录的所有图表类型
 * @param {string} targetDir - 目标项目目录
 * @param {{ direction?: string }} options
 * @returns {Promise<Array<{type: string, mermaid: string, label: string}>>}
 */
export async function toMermaidAll(targetDir, options = {}) {
  const results = [];

  // 1. 管线图
  const arch = await detectArchitecture(targetDir);
  const pipelineMermaid = toMermaid(arch, { type: 'pipeline' });
  if (pipelineMermaid) {
    results.push({
      type: 'pipeline',
      mermaid: pipelineMermaid,
      label: `管线图 · ${arch.title || targetDir}`,
    });
  }

  // 2. 调用图
  try {
    const callGraph = await detectCallGraph(targetDir);
    const cgMermaid = toMermaid(callGraph, { type: 'call-graph' });
    if (cgMermaid) {
      results.push({
        type: 'call-graph',
        mermaid: cgMermaid,
        label: `调用图 · ${callGraph.nodes.length} 个节点`,
      });
    }
  } catch {
    // 单个 skill 目录可能无法生成调用图，跳过
  }

  // 3. 时序图
  try {
    const { readFile } = await import('node:fs/promises');
    const skillMd = await readFile(`${targetDir}/SKILL.md`, 'utf-8');
    const seq = detectSequenceFromSkill(skillMd);
    const seqMermaid = toMermaid(seq, { type: 'sequence' });
    if (seqMermaid) {
      results.push({
        type: 'sequence',
        mermaid: seqMermaid,
        label: `时序图 · ${seq.actors.length} 个参与者`,
      });
    }
  } catch {
    // SKILL.md 不存在则跳过
  }

  // 4. 分层图
  try {
    const layerMap = await detectLayerMap(targetDir);
    const lmMermaid = toMermaid(layerMap, { type: 'layer-map' });
    if (lmMermaid) {
      results.push({
        type: 'layer-map',
        mermaid: lmMermaid,
        label: `分层图 · ${layerMap.layers.length} 层`,
      });
    }
  } catch {
    // 非 skills 目录可能失败，跳过
  }

  return results;
}
