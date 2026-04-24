/**
 * kais-archi/index.js — 统一入口
 * ES Module
 *
 * 根据 type 选择对应的 detector + renderer，一键生成架构图。
 * 支持 generateAll() 批量生成所有类型 + 导航中心页。
 */

import fs from 'node:fs';
import path from 'node:path';

// ─── 质量检查工具 ──────────────────────────────────────

/** 字符串相似度（基于 bigram Jaccard） */
function similarity(a, b) {
  const bigrams = s => { const set = new Set(); for (let i = 0; i < s.length - 1; i++) set.add(s.slice(i, i + 2)); return set; };
  const sa = bigrams(a), sb = bigrams(b);
  let inter = 0; for (const g of sa) if (sb.has(g)) inter++;
  return inter / (sa.size + sb.size - inter) || 0;
}

/** 检查 mermaid 内容质量，返回问题描述或 null */
function checkContentQuality(code, type) {
  // 去掉 init 块
  const clean = code.replace(/%%\{[\s\S]*?\}%%/g, '').trim();
  const lines = clean.split('\n').filter(l => l.trim());

  if (type === 'sequence') {
    const messages = lines.filter(l => /->>|-->>/.test(l));
    if (messages.length === 0) return '时序图没有消息行';
    const participants = lines.filter(l => l.includes('participant'));
    if (participants.length < 2) return '时序图参与者少于2个';
  }

  if (type === 'combined' || type === 'pipeline' || type === 'graph') {
    const nodes = lines.filter(l => /^\s+\w+/.test(l) && !l.includes('-->') && !l.includes('subgraph'));
    const edges = lines.filter(l => l.includes('-->'));
    if (edges.length < 2) return '图表边数少于2';
  }

  if (type === 'call-graph') {
    const nodes = lines.filter(l => /^\s+\S/.test(l) && !l.includes('-->') && !l.includes('subgraph'));
    if (nodes.length < 3) return '调用图节点少于3个';
  }

  if (type === 'layer-map') {
    const subgraphs = lines.filter(l => l.includes('subgraph'));
    if (subgraphs.length < 2) return '全景图分层少于2层';
  }

  // 通用检查：总行数过少
  if (lines.length < 5) return '图表内容过少';

  return null;
}

// --- Detectors ---
export { detectArchitecture, detectPipeline, detectSkills, detectLibraries, detectDataFlow, detectCrossCutting } from './detector.js';
export { detectCallGraph } from './call-graph-detector.js';
export { detectSequenceFromSkill } from './sequence-detector.js';
export { detectLayerMap } from './layer-map-detector.js';

// --- Renderers ---
export { render } from './renderer.js';
export { renderCallGraph } from './call-graph-renderer.js';
export { renderSequence } from './sequence-renderer.js';
export { renderLayerMap } from './layer-map-renderer.js';
export { renderHub } from './hub-renderer.js';

// --- Mermaid + Notion ---
export { toMermaid, toMermaidAll } from './mermaid-renderer.js';
export { writeToNotion, writeAllToNotion } from './notion-writer.js';

/**
 * 统一生成入口（单个图表）
 */
export async function generate(targetDir, options = {}) {
  const { type = 'combined', style = 'dark' } = options;
  let model;

  switch (type) {
    case 'pipeline':
    case 'combined':
      model = await (await import('./detector.js')).detectArchitecture(targetDir);
      return (await import('./renderer.js')).render(model, { style });

    case 'call-graph':
      model = await (await import('./call-graph-detector.js')).detectCallGraph(targetDir);
      return (await import('./call-graph-renderer.js')).renderCallGraph(model, { style });

    case 'sequence': {
      const skillMdPath = path.join(targetDir, 'SKILL.md');
      const skillMd = fs.existsSync(skillMdPath) ? fs.readFileSync(skillMdPath, 'utf-8') : '';
      if (!skillMd) throw new Error(`SKILL.md not found in ${targetDir}`);
      model = (await import('./sequence-detector.js')).detectSequenceFromSkill(skillMd);
      return (await import('./sequence-renderer.js')).renderSequence(model, { style });
    }

    case 'layer-map':
      model = await (await import('./layer-map-detector.js')).detectLayerMap(targetDir);
      return (await import('./layer-map-renderer.js')).renderLayerMap(model, { style });

    default:
      throw new Error(`Unknown type: ${type}. Supported: pipeline, call-graph, sequence, layer-map, combined`);
  }
}

/**
 * 批量生成所有图表 + 导航中心页
 * @param {string} targetDir - 目标项目目录
 * @param {{ style?: string, outputDir?: string, formats?: string[], notionParentId?: string }} options
 * @returns {Promise<{hubFile: string, outDir: string, pages: Array, mermaidFiles?: Array, notionPages?: Array}>}
 */
export async function generateAll(targetDir, options = {}) {
  const { style = 'dark', outputDir, formats = ['html'], notionParentId } = options;
  const outDir = outputDir || path.join('/tmp', `arch-${path.basename(targetDir)}-${Date.now()}`);
  fs.mkdirSync(outDir, { recursive: true });

  const projectName = path.basename(targetDir);
  const skillsDir = path.dirname(targetDir);

  const chartTypes = [
    { type: 'pipeline',   file: '01-pipeline.mmd',   label: '流程图',     icon: '⚡', desc: '内部处理流程与输入输出', dir: targetDir },
    { type: 'sequence',   file: '02-sequence.mmd',   label: '时序图',     icon: '⏱', desc: '组件间的交互时序',       dir: targetDir },
    { type: 'call-graph', file: '03-call-graph.mmd', label: '依赖调用图', icon: '🔗', desc: 'Skill 间的触发/调用关系', dir: skillsDir },
  ];

  const mermaidFiles = [];

  for (const chart of chartTypes) {
    try {
      let model;
      if (chart.type === 'sequence') {
        const skillMd = fs.readFileSync(path.join(chart.dir, 'SKILL.md'), 'utf-8');
        model = (await import('./sequence-detector.js')).detectSequenceFromSkill(skillMd);
      } else if (chart.type === 'call-graph') {
        model = await (await import('./call-graph-detector.js')).detectCallGraph(chart.dir);
      } else {
        model = await (await import('./detector.js')).detectArchitecture(chart.dir);
      }
      const { toMermaid } = await import('./mermaid-renderer.js');
      const mermaidCode = toMermaid(model, { type: chart.type });
      const mmdPath = path.join(outDir, chart.file);
      fs.writeFileSync(mmdPath, mermaidCode);
      mermaidFiles.push({ ...chart, size: (Buffer.byteLength(mermaidCode) / 1024).toFixed(1) + ' KB' });
    } catch (err) {
      mermaidFiles.push({ ...chart, error: err.message.slice(0, 60) });
    }
  }

  // ── 去重 + 质量过滤 ──────────────────────────────────
  // 1. 去重：mermaid 代码相似度 > 90% 的合并（保留先出现的）
  const deduped = [];
  for (const item of mermaidFiles) {
    const code = fs.readFileSync(path.join(outDir, item.file), 'utf-8');
    const isDup = deduped.some(d => {
      const dCode = fs.readFileSync(path.join(outDir, d.file), 'utf-8');
      return similarity(code, dCode) > 0.9;
    });
    if (isDup) {
      console.log(`    ⚠️ ${item.label} 与已有图表重复，已跳过`);
      continue;
    }
    deduped.push(item);
  }

  // 2. 内容完整性检查
  const filtered = deduped.filter(item => {
    const code = fs.readFileSync(path.join(outDir, item.file), 'utf-8');
    const issue = checkContentQuality(code, item.type);
    if (issue) {
      console.log(`    ⚠️ ${item.label}: ${issue}，已跳过`);
      return false;
    }
    return true;
  });
  const finalMermaidFiles = filtered.length > 0 ? filtered : mermaidFiles;

  // Notion 输出
  let notionPages = [];
  if (formats.includes('notion') && notionParentId && mermaidFiles.length > 0) {
    const { writeAllToNotion } = await import('./notion-writer.js');
    notionPages = await writeAllToNotion(notionParentId, {
      projectName,
      mermaidAll: finalMermaidFiles.map(m => ({
        type: m.type,
        mermaid: fs.readFileSync(path.join(outDir, m.file), 'utf-8'),
        label: m.label,
      })),
      style,
    });
  }

  return { outDir, mermaidFiles: finalMermaidFiles, notionPages };
}
