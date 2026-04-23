/**
 * kais-archi/renderer.js — HTML 渲染
 * ES Module
 *
 * 将架构模型渲染为单文件 HTML，支持多种视觉风格。
 * CSS 模板从 templates/ 目录加载，最终内联到 HTML 中。
 */

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const TEMPLATES_DIR = join(__dirname, '..', 'templates');

/** 缓存已加载的 CSS */
const cssCache = {};

/**
 * 加载 CSS 模板
 */
function loadCSS(style) {
  if (cssCache[style]) return cssCache[style];
  try {
    const css = readFileSync(join(TEMPLATES_DIR, `${style}.css`), 'utf-8');
    cssCache[style] = css;
    return css;
  } catch {
    // fallback 到 dark
    const css = readFileSync(join(TEMPLATES_DIR, 'dark.css'), 'utf-8');
    cssCache[style] = css;
    return css;
  }
}

/**
 * 渲染完整 HTML 页面
 * @param {object} model - detectArchitecture() 的返回值
 * @param {object} options
 * @param {'dark'|'light'|'gradient'|'minimal'} options.style - 视觉风格
 * @returns {string} 完整 HTML 字符串
 */
export function render(model, options = {}) {
  const style = options.style || 'dark';
  const css = loadCSS(style);

  return `<!DOCTYPE html>
<html lang="zh">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${model.title} 架构图</title>
<style>${css}</style>
</head>
<body>
${renderHeader(model)}
${renderPipeline(model.phases)}
${renderSpecialFlows(model)}
${renderCrossCutting(model.crossCutting)}
${renderDataFlow(model.dataFlow)}
${renderLegend()}
</body>
</html>`;
}

// ─── Header ──────────────────────────────────────────

function renderHeader(model) {
  return `<h1>🤖 <span>${model.title}</span> 架构图</h1>
<p class="subtitle">${model.subtitle}</p>`;
}

// ─── Pipeline ────────────────────────────────────────

function renderPipeline(phases) {
  if (!phases.length) return '';

  const cards = phases.map(p => {
    const numClass = p.hasFailCheck ? 'style="background:#636e72;"' : p.hasGit ? 'class="git"' : '';
    const skillHtml = p.skill ? `<span class="phase-skill">${p.skill}</span>` : '';
    const tagsHtml = p.tags.length
      ? `<div class="phase-tags">${p.tags.map(t => `<span class="tag">${t}</span>`).join('')}</div>`
      : '';
    const failHtml = p.hasFailCheck ? ' style="border-color: #ff6b6b44;"' : '';

    return `<div class="phase"${failHtml}>
  <div class="phase-header">
    <span class="phase-num" ${numClass}>${p.id}${p.hasGit ? ' 📌' : ''}</span>
    <span class="phase-name">${p.name}</span>
    ${skillHtml}
  </div>
  ${tagsHtml}
</div>`;
  }).join('\n  <div class="arrow">↓</div>\n  ');

  return `<div class="pipeline">${cards}</div>`;
}

// ─── 特殊流程 ────────────────────────────────────────

function renderSpecialFlows(model) {
  const extChain = model.crossCutting.find(c => /延长|chain|extension/i.test(c.name));
  if (extChain) {
    return `<h2 class="section-title">${extChain.icon} ${extChain.name}</h2>
<div class="chain-box">
  <div class="chain-step"><div class="chain-idx">1</div><div class="chain-content"><div class="chain-refs">@1 首帧 + @2 目标尾帧 + @3 TTS段 + @4 BGM段</div><div class="chain-prompt">种子片段生成</div></div></div>
  <div class="chain-arrow">↓ 上一段视频 → 下一段参考</div>
  <div class="chain-step"><div class="chain-idx">N</div><div class="chain-content"><div class="chain-refs">@1 段N-1视频 + @2 段N目标尾帧 + @3 TTS段 + @4 BGM段</div><div class="chain-prompt">延长 prompt: "@1是上一段视频，从结尾画面开始延续到@2"</div></div></div>
</div>`;
  }
  return '';
}

// ─── 横切能力 ────────────────────────────────────────

function renderCrossCutting(crossCutting) {
  if (!crossCutting.length) return '';

  const boxes = crossCutting.map(c => `
  <div class="cross-box">
    <h3>${c.icon} ${c.name}</h3>
    <p>${c.description}</p>
  </div>`).join('');

  return `<h2 class="section-title">⚡ 横切能力</h2>
<div class="cross-grid">${boxes}</div>`;
}

// ─── 数据流 ──────────────────────────────────────────

function renderDataFlow(dataFlow) {
  if (!dataFlow.length) return '';

  const lines = dataFlow.map(f => {
    const fromClass = /\.json|\.png|\.mp4/.test(f.from) ? 'green' : 'hl';
    return `<span class="${fromClass}">${f.from}</span> ──→ ${f.to}`;
  }).join('<br>');

  return `<h2 class="section-title">📊 数据流</h2>
<div class="data-flow">${lines}</div>`;
}

// ─── 图例 ────────────────────────────────────────────

function renderLegend() {
  return `<div class="legend">
  <div class="legend-item"><div class="legend-dot" style="background:#00b894;"></div> 产出物</div>
  <div class="legend-item"><div class="legend-dot" style="background:#6c5ce7;"></div> Skill / 模块</div>
  <div class="legend-item"><div class="legend-dot" style="background:#fdcb6e;"></div> 锚定 / 注意</div>
  <div class="legend-item"><div class="legend-dot" style="background:#74b9ff;"></div> 引用 / 链接</div>
  <div class="legend-item"><div class="legend-dot" style="background:#ff6b6b;"></div> 守卫 / 检查</div>
  <div class="legend-item"><div class="legend-dot" style="background:#636e72;"></div> 审核关卡</div>
</div>`;
}
