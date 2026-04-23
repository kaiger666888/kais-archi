/**
 * kais-archi/index.js — 统一入口
 * ES Module
 *
 * 根据 type 选择对应的 detector + renderer，一键生成架构图。
 * 支持 generateAll() 批量生成所有类型 + 导航中心页。
 */

import fs from 'node:fs';
import path from 'node:path';

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
    { type: 'combined',   file: '01-combined.html',   mmdFile: '01-combined.mmd',   label: '混合架构图', icon: '🏗', desc: '管线流程 + 横切能力 + 数据流', dir: targetDir },
    { type: 'pipeline',   file: '02-pipeline.html',   mmdFile: '02-pipeline.mmd',   label: '管线架构图', icon: '⚡', desc: '有序阶段的处理流程', dir: targetDir },
    { type: 'sequence',   file: '03-sequence.html',   mmdFile: '03-sequence.mmd',   label: '时序图',     icon: '⏱', desc: '组件间的交互时序', dir: targetDir },
    { type: 'call-graph', file: '04-call-graph.html', mmdFile: '04-call-graph.mmd', label: '依赖调用图', icon: '🔗', desc: 'Skill 间的触发/调用关系', dir: skillsDir },
    { type: 'layer-map',  file: '05-layer-map.html',  mmdFile: '05-layer-map.mmd',  label: '生态全景图', icon: '🏔', desc: '所有 Skill 的分层架构总览', dir: skillsDir },
  ];

  const pages = [];
  const mermaidFiles = [];

  for (const chart of chartTypes) {
    const filePath = path.join(outDir, chart.file);
    try {
      // HTML 输出
      if (formats.includes('html')) {
        const html = await generate(chart.dir, { type: chart.type, style });
        fs.writeFileSync(filePath, html);
        const size = (Buffer.byteLength(html) / 1024).toFixed(1) + ' KB';
        pages.push({ ...chart, size });
      }

      // Mermaid 输出
      if (formats.includes('mermaid') || formats.includes('notion')) {
        const { toMermaid } = await import('./mermaid-renderer.js');
        let model;
        if (chart.type === 'sequence') {
          const skillMd = fs.readFileSync(path.join(chart.dir, 'SKILL.md'), 'utf-8');
          model = (await import('./sequence-detector.js')).detectSequenceFromSkill(skillMd);
        } else {
          model = await generate(chart.dir, { type: chart.type, style });
          // 对于 HTML renderer，我们需要 detector 的原始 model
          switch (chart.type) {
            case 'call-graph':
              model = await (await import('./call-graph-detector.js')).detectCallGraph(chart.dir);
              break;
            case 'layer-map':
              model = await (await import('./layer-map-detector.js')).detectLayerMap(chart.dir);
              break;
            default:
              model = await (await import('./detector.js')).detectArchitecture(chart.dir);
          }
        }
        const mermaidCode = toMermaid(model, { type: chart.type });
        const mmdPath = path.join(outDir, chart.mmdFile);
        fs.writeFileSync(mmdPath, mermaidCode);
        mermaidFiles.push({ ...chart, mmdFile: chart.mmdFile, size: (Buffer.byteLength(mermaidCode) / 1024).toFixed(1) + ' KB' });
      }
    } catch (err) {
      if (formats.includes('html')) {
        pages.push({ ...chart, error: err.message.slice(0, 60) });
      }
    }
  }

  // HTML 导航中心页
  if (formats.includes('html')) {
    const hubHtml = (await import('./hub-renderer.js')).renderHub({ projectName, style, pages });
    const hubFile = path.join(outDir, 'index.html');
    fs.writeFileSync(hubFile, hubHtml);
  }

  // Notion 输出
  let notionPages = [];
  if (formats.includes('notion') && notionParentId && mermaidFiles.length > 0) {
    const { writeAllToNotion } = await import('./notion-writer.js');
    notionPages = await writeAllToNotion(notionParentId, {
      projectName,
      mermaidAll: mermaidFiles.map(m => ({
        type: m.type,
        mermaid: fs.readFileSync(path.join(outDir, m.mmdFile), 'utf-8'),
        label: m.label,
      })),
      style,
    });
  }

  return { outDir, pages: pages.filter(p => !p.error), mermaidFiles, notionPages };
}
