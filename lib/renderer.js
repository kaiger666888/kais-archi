/**
 * kais-archi/renderer.js — 手写 HTML 管线架构图渲染
 * ES Module
 *
 * 生成单文件 HTML（内联 CSS，深色主题），包含 Phase 卡片 + I/O 面板。
 */

const CSS = `*{margin:0;padding:0;box-sizing:border-box}
body{background:#0d1117;color:#e6edf3;font-family:'Segoe UI',-apple-system,sans-serif;padding:40px 20px}
.container{max-width:1100px;margin:0 auto}
h1{text-align:center;font-size:28px;margin-bottom:8px;color:#58a6ff}
.subtitle{text-align:center;color:#8b949e;margin-bottom:40px;font-size:14px}
.pipeline{display:flex;flex-direction:column;gap:0;align-items:stretch}
.phase-row{display:flex;align-items:stretch;min-height:80px}
.phase-card{background:#161b22;border:1px solid #30363d;border-radius:8px;padding:16px 20px;flex:1;position:relative}
.phase-card:hover{border-color:#58a6ff}
.phase-card.active{border-left:3px solid #58a6ff}
.phase-num{font-size:11px;color:#8b949e;text-transform:uppercase;letter-spacing:1px;margin-bottom:4px}
.phase-name{font-size:16px;font-weight:600;margin-bottom:4px}
.phase-skill{font-size:12px;color:#f0883e;margin-bottom:8px}
.phase-tag{display:inline-block;font-size:10px;padding:2px 8px;border-radius:10px;margin-right:4px}
.tag-hook{background:#23863622;color:#3fb950;border:1px solid #23863644}
.tag-review{background:#da363322;color:#f85149;border:1px solid #da363344}
.tag-optional{background:#8957e522;color:#a371f7;border:1px solid #8957e544}
.tag-forced{background:#f0883e22;color:#f0883e;border:1px solid #f0883e44}
.io-section{width:180px;min-width:180px;padding:8px 12px;display:flex;flex-direction:column;gap:4px}
.io-label{font-size:10px;color:#8b949e;text-transform:uppercase;letter-spacing:.5px;margin-bottom:2px}
.io-item{font-size:11px;padding:3px 8px;border-radius:4px;font-family:'Cascadia Code','Fira Code',monospace}
.io-output{background:#1f6feb15;color:#79c0ff;border:1px solid #1f6feb33}
.io-input{background:#23863615;color:#7ee787;border:1px solid #23863633}
.arrow-down{display:flex;justify-content:center;padding:2px 0}
.arrow-down .line{width:2px;height:20px;background:#30363d}
.arrow-down .head{width:0;height:0;border-left:6px solid transparent;border-right:6px solid transparent;border-top:8px solid #30363d}
.arrow-down .label{font-size:10px;color:#8b949e;margin-left:12px;align-self:center;white-space:nowrap}
.data-flow{background:#0d1117;border:1px dashed #30363d;border-radius:6px;padding:12px 16px;margin:20px 0;font-size:12px;color:#8b949e}
.data-flow-title{color:#58a6ff;font-weight:600;margin-bottom:8px}
.flow-row{display:flex;align-items:center;gap:8px;margin:4px 0}
.flow-from{color:#79c0ff;min-width:100px}
.flow-arrow{color:#30363d}
.flow-to{color:#7ee787;min-width:100px}
.flow-desc{color:#8b949e;font-size:11px}
.legend{display:flex;gap:20px;justify-content:center;margin-top:40px;flex-wrap:wrap}
.legend-item{display:flex;align-items:center;gap:6px;font-size:12px;color:#8b949e}
.legend-dot{width:10px;height:10px;border-radius:3px}
h2{font-size:18px;color:#58a6ff;margin:30px 0 12px}`;

/**
 * Render pipeline architecture HTML
 * @param {object} model - detectArchitecture() result
 * @param {Array} pipelineIO - detectPipelineIO() result
 * @param {{ style?: string }} options
 * @returns {string} complete HTML
 */
export function render(model, pipelineIO = [], options = {}) {
  const ioMap = new Map(pipelineIO.map(p => [p.id, p]));
  const phasesHtml = model.phases.map((p, i) => {
    const io = ioMap.get(p.id) || {};
    const isActive = i === 0 || p.hasFailCheck;
    const skillNames = p.skill || '';
    const tags = buildTags(p, io);
    const ioHtml = buildIO(p, io);
    const arrowLabel = getArrowLabel(p, i, model.phases, model.dataFlow);

    let html = `<div class="phase-row">
  <div class="phase-card${isActive ? ' active' : ''}">
    <div class="phase-num">${p.id}${p.hasGit ? ' 📌' : ''}</div>
    <div class="phase-name">${p.name}</div>
    ${skillNames ? `<div class="phase-skill">${skillNames}</div>` : ''}
    ${tags}
  </div>
  ${ioHtml}
</div>`;

    if (i < model.phases.length - 1) {
      html += `\n<div class="arrow-down"><div class="line"></div><div class="head"></div>${arrowLabel ? `<div class="label">${arrowLabel}</div>` : ''}</div>`;
    }
    return html;
  }).join('\n');

  const dataFlowHtml = buildDataFlow(model.dataFlow, model.phases);
  const crossHtml = model.crossCutting.length
    ? model.crossCutting.map(c => `<div class="phase-card" style="flex:none;width:280px"><div class="phase-name">${c.icon} ${c.name}</div><div style="font-size:11px;color:#8b949e">${c.description}</div></div>`).join('')
    : '';

  return `<!DOCTYPE html>
<html lang="zh">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${model.title} 架构图</title>
<style>${CSS}</style>
</head>
<body>
<div class="container">
<h1>${model.title}</h1>
<div class="subtitle">${model.subtitle}</div>
<div class="pipeline">${phasesHtml}</div>
${dataFlowHtml}
${crossHtml ? `<h2>⚡ 横切能力</h2><div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:12px;margin-top:12px">${crossHtml}</div>` : ''}
<div class="legend">
  <div class="legend-item"><div class="legend-dot" style="background:#3fb950"></div> Hook</div>
  <div class="legend-item"><div class="legend-dot" style="background:#f85149"></div> REVIEW GATE</div>
  <div class="legend-item"><div class="legend-dot" style="background:#a371f7"></div> 可选</div>
  <div class="legend-item"><div class="legend-dot" style="background:#f0883e"></div> 强制</div>
  <div class="legend-item"><div class="legend-dot" style="background:#79c0ff"></div> 输出文件</div>
  <div class="legend-item"><div class="legend-dot" style="background:#7ee787"></div> 输入文件</div>
</div>
</div>
</body>
</html>`;
}

function buildTags(phase, io) {
  const tags = [];
  if (phase.tags) {
    for (const t of phase.tags) {
      const lower = t.toLowerCase();
      if (/hook|after:|before:/.test(lower)) tags.push(`<span class="phase-tag tag-hook">${t}</span>`);
      else if (/review|gate|审核/.test(lower)) tags.push(`<span class="phase-tag tag-review">${t}</span>`);
      else if (/optional|可选/.test(lower)) tags.push(`<span class="phase-tag tag-optional">${t}</span>`);
      else if (/forced|强制/.test(lower)) tags.push(`<span class="phase-tag tag-forced">${t}</span>`);
      else tags.push(`<span class="phase-tag tag-hook">${t}</span>`);
    }
  }
  if (io.hasReview && !tags.some(t => /review/i.test(t))) {
    tags.push(`<span class="phase-tag tag-review">REVIEW GATE${io.reviewMode ? ' · ' + io.reviewMode : ''}</span>`);
  }
  return tags.join('');
}

function buildIO(phase, io) {
  const inputs = extractInputs(phase);
  const outputs = io.outputFiles && io.outputFiles.length > 0 ? io.outputFiles : extractOutputs(phase);

  let html = '<div class="io-section">';
  if (inputs.length) {
    html += '<div class="io-label">📥 输入</div>';
    html += inputs.map(f => `<div class="io-item io-input">${f}</div>`).join('');
  }
  if (outputs.length) {
    html += `<div class="io-label" style="margin-top:8px">📤 输出</div>`;
    html += outputs.map(f => `<div class="io-item io-output">${f}</div>`).join('');
  }
  html += '</div>';
  return html;
}

function extractInputs(phase) {
  if (!phase.ioAnnot) return [];
  const parts = [];
  const m = phase.ioAnnot.match(/📥(.+?)(?=📤|$)/);
  if (m) parts.push(...m[1].split('/').map(s => s.trim()).filter(Boolean));
  return parts.length ? parts : [];
}

function extractOutputs(phase) {
  if (!phase.ioAnnot) return [];
  const parts = [];
  const m = phase.ioAnnot.match(/📤(.+)/);
  if (m) parts.push(...m[1].split('/').map(s => s.trim()).filter(Boolean));
  return parts.length ? parts : [];
}

function getArrowLabel(phase, index, allPhases, dataFlow) {
  // Try to find a data flow from this phase's outputs to the next phase
  const nextPhase = allPhases[index + 1];
  if (!nextPhase) return '';
  // Use ioAnnot or dataFlow to find meaningful label
  if (phase.ioAnnot) {
    const outMatch = phase.ioAnnot.match(/📤(.+)/);
    if (outMatch) {
      const outFiles = outMatch[1].split('/').map(s => s.trim()).filter(Boolean);
      if (outFiles.length > 0) {
        return `${outFiles[0]} → ${nextPhase.id}`;
      }
    }
  }
  return '';
}

function buildDataFlow(dataFlow, phases) {
  if (!dataFlow || dataFlow.length === 0) return '';
  const rows = dataFlow.map(f =>
    `<div class="flow-row"><span class="flow-from">${f.from}</span><span class="flow-arrow">→</span><span class="flow-to">${f.to}</span></div>`
  ).join('');
  return `<h2>📊 跨阶段数据流</h2><div class="data-flow">${rows}</div>`;
}
