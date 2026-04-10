/**
 * kais-archi/renderer.js — HTML 渲染
 * ES Module
 *
 * 将架构模型渲染为单文件 HTML，支持多种视觉风格。
 */

/**
 * 渲染完整 HTML 页面
 * @param {object} model - detectArchitecture() 的返回值
 * @param {object} options
 * @param {'dark'|'light'|'gradient'|'minimal'} options.style - 视觉风格
 * @returns {string} 完整 HTML 字符串
 */
export function render(model, options = {}) {
  const style = options.style || 'dark';
  const css = getCSS(style);

  return `<!DOCTYPE html>
<html lang="zh">
<head>
<meta charset="UTF-8">
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
  // 检测延长链
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

// ─── CSS 主题 ────────────────────────────────────────

function getCSS(style) {
  const themes = {
    dark: `
* { margin: 0; padding: 0; box-sizing: border-box; }
body { font-family: 'SF Pro Display', -apple-system, sans-serif; background: #0a0a0f; color: #e0e0e0; padding: 40px; }
h1 { text-align: center; font-size: 28px; color: #fff; margin-bottom: 8px; }
h1 span { color: #6c5ce7; }
.subtitle { text-align: center; color: #666; margin-bottom: 40px; font-size: 14px; }
.pipeline { max-width: 900px; margin: 0 auto; }
.phase { background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%); border: 1px solid #2d2d4a; border-radius: 12px; padding: 16px 20px; margin-bottom: 12px; transition: all 0.3s; }
.phase:hover { border-color: #6c5ce7; transform: translateX(4px); }
.phase-header { display: flex; align-items: center; gap: 12px; }
.phase-num { background: #6c5ce7; color: #fff; font-size: 11px; font-weight: 700; padding: 3px 10px; border-radius: 20px; white-space: nowrap; }
.phase-num.git { background: #00b894; }
.phase-name { font-weight: 600; font-size: 15px; color: #fff; }
.phase-skill { font-size: 12px; color: #a29bfe; font-family: monospace; }
.phase-tags { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px; }
.tag { font-size: 10px; padding: 2px 8px; border-radius: 10px; background: rgba(108,92,231,0.15); color: #a29bfe; border: 1px solid rgba(108,92,231,0.3); }
.arrow { text-align: center; color: #444; font-size: 18px; padding: 2px 0; }
.section-title { font-size: 18px; color: #fff; margin: 30px 0 15px; padding-left: 12px; border-left: 3px solid #6c5ce7; }
.cross-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 12px; max-width: 900px; margin: 0 auto; }
.cross-box { background: #1a1a2e; border: 1px solid #2d2d4a; border-radius: 10px; padding: 16px; }
.cross-box h3 { font-size: 13px; color: #a29bfe; margin-bottom: 6px; }
.cross-box p { font-size: 11px; color: #888; line-height: 1.6; }
.data-flow { max-width: 900px; margin: 20px auto; background: #1a1a2e; border: 1px solid #2d2d4a; border-radius: 12px; padding: 20px; font-family: monospace; font-size: 11px; line-height: 1.8; color: #aaa; }
.data-flow .hl { color: #a29bfe; }
.data-flow .green { color: #00b894; }
.chain-box { max-width: 900px; margin: 20px auto; background: linear-gradient(135deg, #1a1a2e 0%, #0d1b2a 100%); border: 1px solid #2d2d4a; border-radius: 12px; padding: 20px; }
.chain-step { display: flex; align-items: center; gap: 12px; padding: 10px 0; border-bottom: 1px solid rgba(45,45,74,0.5); }
.chain-step:last-child { border-bottom: none; }
.chain-idx { background: #6c5ce7; color: #fff; font-size: 12px; font-weight: 700; width: 28px; height: 28px; display: flex; align-items: center; justify-content: center; border-radius: 50%; flex-shrink: 0; }
.chain-content { flex: 1; }
.chain-refs { font-size: 11px; color: #fdcb6e; margin-bottom: 2px; }
.chain-prompt { font-size: 11px; color: #74b9ff; font-family: monospace; }
.chain-arrow { color: #444; font-size: 16px; padding: 4px 0; text-align: center; }
.legend { max-width: 900px; margin: 30px auto; display: flex; flex-wrap: wrap; gap: 16px; justify-content: center; }
.legend-item { display: flex; align-items: center; gap: 6px; font-size: 11px; color: #888; }
.legend-dot { width: 8px; height: 8px; border-radius: 50%; }`,

    light: `
* { margin: 0; padding: 0; box-sizing: border-box; }
body { font-family: -apple-system, sans-serif; background: #f8f9fa; color: #333; padding: 40px; }
h1 { text-align: center; font-size: 28px; margin-bottom: 8px; }
h1 span { color: #6c5ce7; }
.subtitle { text-align: center; color: #999; margin-bottom: 40px; font-size: 14px; }
.pipeline { max-width: 900px; margin: 0 auto; }
.phase { background: #fff; border: 1px solid #e0e0e0; border-radius: 12px; padding: 16px 20px; margin-bottom: 12px; box-shadow: 0 2px 8px rgba(0,0,0,0.06); }
.phase-header { display: flex; align-items: center; gap: 12px; }
.phase-num { background: #6c5ce7; color: #fff; font-size: 11px; font-weight: 700; padding: 3px 10px; border-radius: 20px; }
.phase-num.git { background: #00b894; }
.phase-name { font-weight: 600; font-size: 15px; }
.phase-skill { font-size: 12px; color: #6c5ce7; font-family: monospace; }
.phase-tags { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px; }
.tag { font-size: 10px; padding: 2px 8px; border-radius: 10px; background: #f0edff; color: #6c5ce7; }
.arrow { text-align: center; color: #ccc; font-size: 18px; padding: 2px 0; }
.section-title { font-size: 18px; margin: 30px 0 15px; padding-left: 12px; border-left: 3px solid #6c5ce7; }
.cross-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 12px; max-width: 900px; margin: 0 auto; }
.cross-box { background: #fff; border: 1px solid #e0e0e0; border-radius: 10px; padding: 16px; box-shadow: 0 2px 8px rgba(0,0,0,0.06); }
.cross-box h3 { font-size: 13px; color: #6c5ce7; margin-bottom: 6px; }
.cross-box p { font-size: 11px; color: #888; line-height: 1.6; }
.data-flow { max-width: 900px; margin: 20px auto; background: #fff; border: 1px solid #e0e0e0; border-radius: 12px; padding: 20px; font-family: monospace; font-size: 11px; line-height: 1.8; color: #555; }
.data-flow .hl { color: #6c5ce7; }
.data-flow .green { color: #00b894; }
.legend { max-width: 900px; margin: 30px auto; display: flex; flex-wrap: wrap; gap: 16px; justify-content: center; }
.legend-item { display: flex; align-items: center; gap: 6px; font-size: 11px; color: #999; }
.legend-dot { width: 8px; height: 8px; border-radius: 50%; }`,

    minimal: `
* { margin: 0; padding: 0; box-sizing: border-box; }
body { font-family: monospace; background: #fff; color: #333; padding: 40px; font-size: 13px; }
h1 { font-size: 20px; margin-bottom: 4px; }
h1 span { color: #6c5ce7; }
.subtitle { color: #999; margin-bottom: 30px; }
.pipeline { max-width: 800px; }
.phase { border-left: 2px solid #ddd; padding: 8px 16px; margin-bottom: 4px; }
.phase:hover { border-left-color: #6c5ce7; }
.phase-header { display: flex; gap: 8px; align-items: baseline; }
.phase-num { color: #6c5ce7; font-weight: bold; font-size: 11px; }
.phase-num.git { color: #00b894; }
.phase-name { font-weight: 600; }
.phase-skill { color: #999; font-size: 11px; }
.phase-tags { display: flex; gap: 4px; margin-top: 4px; }
.tag { font-size: 10px; color: #888; background: #f5f5f5; padding: 1px 6px; border-radius: 4px; }
.arrow { color: #ddd; padding: 0 0 0 6px; font-size: 12px; }
.section-title { font-size: 15px; margin: 24px 0 12px; color: #6c5ce7; }
.cross-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.cross-box { border: 1px solid #eee; padding: 12px; border-radius: 6px; }
.cross-box h3 { font-size: 12px; margin-bottom: 4px; }
.cross-box p { font-size: 11px; color: #888; line-height: 1.5; }
.data-flow { background: #fafafa; border: 1px solid #eee; padding: 16px; margin: 16px 0; font-size: 11px; line-height: 1.8; }
.data-flow .hl { color: #6c5ce7; }
.data-flow .green { color: #00b894; }
.legend { display: flex; gap: 16px; margin-top: 24px; font-size: 11px; color: #999; }
.legend-item { display: flex; align-items: center; gap: 4px; }
.legend-dot { width: 6px; height: 6px; border-radius: 50%; }`,
  };

  return themes[style] || themes.dark;
}
