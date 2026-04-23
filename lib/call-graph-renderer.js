/**
 * Skill 依赖调用图渲染器
 * 将 call-graph model 渲染为带交互的 HTML
 */

import { createSVG, createNode, createEdge, createText, wrapWithZoomPan } from './svg-utils.js';
import { forceLayout } from './force-layout.js';

// ── 样式主题 ────────────────────────────────────────────
const THEMES = {
  dark: {
    bg: '#0d1117', nodeFill: '#161b22', nodeStroke: '#30363d',
    text: '#e6edf3', edge: '#484f58', title: '#e6edf3',
    legendBg: '#161b22', legendBorder: '#30363d',
    groupColors: {
      orchestration: '#f78166', content: '#d2a8ff',
      dev: '#7ee787', infra: '#79c0ff', other: '#8b949e',
    },
  },
  light: {
    bg: '#ffffff', nodeFill: '#f6f8fa', nodeStroke: '#d0d7de',
    text: '#1f2328', edge: '#afb8c1', title: '#1f2328',
    legendBg: '#f6f8fa', legendBorder: '#d0d7de',
    groupColors: {
      orchestration: '#cf222e', content: '#8250df',
      dev: '#1a7f37', infra: '#0969da', other: '#656d76',
    },
  },
  gradient: {
    bg: '#0f0c29', nodeFill: '#1a1a3e', nodeStroke: '#444',
    text: '#e0e0ff', edge: '#555', title: '#ffffff',
    legendBg: '#1a1a3e', legendBorder: '#444',
    groupColors: {
      orchestration: '#ff6b6b', content: '#c084fc',
      dev: '#4ade80', infra: '#60a5fa', other: '#9ca3af',
    },
  },
  minimal: {
    bg: '#fafafa', nodeFill: '#ffffff', nodeStroke: '#e5e5e5',
    text: '#374151', edge: '#d1d5db', title: '#111827',
    legendBg: '#ffffff', legendBorder: '#e5e5e5',
    groupColors: {
      orchestration: '#ef4444', content: '#a855f7',
      dev: '#22c55e', infra: '#3b82f6', other: '#9ca3af',
    },
  },
};

// ── 边 label 对应的样式 ─────────────────────────────────
const EDGE_STYLES = {
  spawn:     { color: '#f59e0b', dashed: false },
  delegate:  { color: '#8b5cf6', dashed: false },
  import:    { color: '#10b981', dashed: true },
  trigger:   { color: '#3b82f6', dashed: false },
  reference: { color: '#6b7280', dashed: true },
};

// ── 主渲染函数 ──────────────────────────────────────────
/**
 * 渲染调用图为完整 HTML
 * @param {{type:'call-graph', nodes:Array, edges:Array}} model
 * @param {object} [options]
 * @param {'dark'|'light'|'gradient'|'minimal'} [options.style='dark']
 * @param {number} [options.width=1200]
 * @param {number} [options.height=800]
 * @returns {string} 完整 HTML 字符串
 */
export function renderCallGraph(model, options = {}) {
  const { style = 'dark', width = 1200, height = 800 } = options;
  const theme = THEMES[style] || THEMES.dark;

  // 1) 力导向布局
  const layout = forceLayout(model.nodes, model.edges, { width, height, iterations: 300 });
  const nodeMap = new Map(layout.nodes.map(n => [n.id, n]));

  // 2) 计算每个节点的连接数（用于 tooltip）
  const connectionCount = new Map();
  for (const n of model.nodes) connectionCount.set(n.id, 0);
  for (const e of model.edges) {
    connectionCount.set(e.source, (connectionCount.get(e.source) || 0) + 1);
    connectionCount.set(e.target, (connectionCount.get(e.target) || 0) + 1);
  }

  // 3) 生成 SVG 内容
  let svgBody = '';
  const padding = 60;
  const svgWidth = width + padding * 2;
  const svgHeight = height + padding * 2;
  svgBody += createSVG(svgWidth, svgHeight, `${-padding} ${-padding} ${svgWidth} ${svgHeight}`);

  // 顶部标题
  svgBody += createText(svgWidth / 2, 30, 'Skill 依赖调用图', {
    anchor: 'middle', fontSize: 20, fill: theme.title, fontWeight: 'bold',
  });

  // 右上角图例
  const legendX = svgWidth - 180;
  const legendY = 20;
  const groupLabels = {
    orchestration: '编排', content: '内容',
    dev: '开发', infra: '基础设施', other: '其他',
  };
  svgBody += `<g id="legend">`;
  svgBody += `<rect x="${legendX - 10}" y="${legendY - 5}" width="170" height="${Object.keys(groupLabels).length * 22 + 12}" rx="6" fill="${theme.legendBg}" stroke="${theme.legendBorder}" stroke-width="1"/>`;
  let ly = legendY + 12;
  for (const [g, label] of Object.entries(groupLabels)) {
    const c = theme.groupColors[g] || theme.groupColors.other;
    svgBody += `<circle cx="${legendX + 6}" cy="${ly}" r="5" fill="${c}"/>`;
    svgBody += createText(legendX + 18, ly, label, { anchor: 'start', fontSize: 12, fill: theme.text });
    ly += 22;
  }
  svgBody += `</g>`;

  // 边标签图例（左下角）
  const edgeLegendX = 20;
  const edgeLegendY = svgHeight - 100;
  const edgeLabels = { spawn: 'spawn', delegate: 'delegate', import: 'import', trigger: 'trigger', reference: 'reference' };
  svgBody += `<g id="edge-legend">`;
  svgBody += `<rect x="${edgeLegendX - 10}" y="${edgeLegendY - 5}" width="130" height="${Object.keys(edgeLabels).length * 20 + 12}" rx="6" fill="${theme.legendBg}" stroke="${theme.legendBorder}" stroke-width="1"/>`;
  let ely = edgeLegendY + 12;
  for (const [key, label] of Object.entries(edgeLabels)) {
    const es = EDGE_STYLES[key] || EDGE_STYLES.reference;
    const dashAttr = es.dashed ? ' stroke-dasharray="4,2"' : '';
    svgBody += `<line x1="${edgeLegendX}" y1="${ely}" x2="${edgeLegendX + 20}" y2="${ely}" stroke="${es.color}" stroke-width="2"${dashAttr}/>`;
    svgBody += createText(edgeLegendX + 28, ely, label, { anchor: 'start', fontSize: 11, fill: theme.text });
    ely += 20;
  }
  svgBody += `</g>`;

  // 绘制边（先画边，再画节点，使节点在上层）
  for (const edge of model.edges) {
    const from = nodeMap.get(edge.source);
    const to = nodeMap.get(edge.target);
    if (!from || !to) continue;
    const es = EDGE_STYLES[edge.label] || EDGE_STYLES.reference;
    svgBody += createEdge(from.x, from.y, to.x, to.y, {
      label: edge.label,
      color: es.color,
      dashed: es.dashed,
      strokeWidth: 1.5,
      curved: true,
    });
  }

  // 绘制节点
  for (const n of model.nodes) {
    const pos = nodeMap.get(n.id);
    if (!pos) continue;
    const gc = theme.groupColors[n.group] || theme.groupColors.other;
    svgBody += createNode(pos.x, pos.y, n.id, n.label, {
      shape: 'rounded',
      width: 130,
      height: 36,
      fill: theme.nodeFill,
      stroke: gc,
      textColor: theme.text,
      fontSize: 12,
    });
  }

  // 节点 tooltip 数据（通过 data 属性传递）
  for (const n of model.nodes) {
    svgBody += `<!-- tooltip-${n.id}: ${n.description || '无描述'} | 连接: ${connectionCount.get(n.id) || 0} -->`;
  }

  svgBody += `</svg>`;

  // 4) 用 wrapWithZoomPan 包裹
  const html = wrapWithZoomPan(svgBody, svgWidth, svgHeight);

  // 5) 注入 hover 交互和高亮逻辑
  return injectHoverInteraction(html, model, nodeMap, theme);
}

// ── 注入 hover 交互 ─────────────────────────────────────
function injectHoverInteraction(html, model, nodeMap, theme) {
  // 构建邻接表
  const adjacency = new Map();
  for (const n of model.nodes) adjacency.set(n.id, new Set());
  for (const e of model.edges) {
    adjacency.get(e.source)?.add(e.target);
    adjacency.get(e.target)?.add(e.source);
  }

  // 构建节点信息 JSON
  const nodeInfo = {};
  for (const n of model.nodes) {
    nodeInfo[n.id] = {
      label: n.label,
      description: n.description || '',
      connections: adjacency.get(n.id)?.size || 0,
    };
  }

  // 插入交互脚本
  const script = `
<script>
(function(){
  const nodeInfo = ${JSON.stringify(nodeInfo)};
  const adjacency = ${JSON.stringify(Object.fromEntries([...adjacency].map(([k,v])=>[k,[...v]])))};
  const svg = document.querySelector('svg');
  const allNodes = svg.querySelectorAll('g[id]');
  const allPaths = svg.querySelectorAll('path');

  // 创建 tooltip div
  const tooltip = document.createElement('div');
  tooltip.style.cssText = 'position:fixed;pointer-events:none;background:rgba(0,0,0,0.85);color:#fff;padding:8px 12px;border-radius:6px;font-size:12px;line-height:1.5;display:none;z-index:999;max-width:280px;';
  document.body.appendChild(tooltip);

  // 鼠标位置
  let mouseX = 0, mouseY = 0;
  document.addEventListener('mousemove', e => { mouseX = e.clientX; mouseY = e.clientY; });

  // hover 处理
  function resetHighlight() {
    allNodes.forEach(g => { g.style.opacity = '1'; g.style.filter = ''; });
    allPaths.forEach(p => { p.style.opacity = '0.4'; });
    tooltip.style.display = 'none';
  }

  // 初始状态：边半透明
  allPaths.forEach(p => { p.style.opacity = '0.4'; p.style.transition = 'opacity 0.2s'; });
  allNodes.forEach(g => { g.style.transition = 'opacity 0.2s, filter 0.2s'; g.style.cursor = 'pointer'; });

  for (const g of allNodes) {
    const id = g.id;
    if (!nodeInfo[id]) continue;

    g.addEventListener('mouseenter', () => {
      const neighbors = adjacency[id] || [];
      const connectedSet = new Set([id, ...neighbors]);

      // 高亮相关节点，暗化其他
      allNodes.forEach(ng => {
        if (connectedSet.has(ng.id)) {
          ng.style.opacity = '1';
          ng.style.filter = 'drop-shadow(0 0 6px rgba(255,255,255,0.3))';
        } else {
          ng.style.opacity = '0.15';
          ng.style.filter = '';
        }
      });

      // 高亮相关边
      allPaths.forEach(p => { p.style.opacity = '0.15'; });

      // 显示 tooltip
      const info = nodeInfo[id];
      tooltip.innerHTML = '<b>' + info.label + '</b><br>' +
        (info.description ? info.description.slice(0, 60) + '<br>' : '') +
        '连接数: ' + info.connections;
      tooltip.style.display = 'block';
    });

    g.addEventListener('mouseleave', resetHighlight);

    g.addEventListener('mousemove', () => {
      tooltip.style.left = (mouseX + 14) + 'px';
      tooltip.style.top = (mouseY - 10) + 'px';
    });
  }
})();
</script>`;

  // 在 </body> 前插入脚本
  return html.replace('</body>', script + '</body>');
}
