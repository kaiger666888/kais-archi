/**
 * layer-map-renderer.js
 * 将分层模型渲染为单文件 HTML（内联 CSS，零依赖）
 */

// 各主题配色
const THEMES = {
  dark: {
    bg: '#0d1117', text: '#c9d1d9', cardBg: 'rgba(255,255,255,0.06)',
    titleColor: '#58a6ff', footerColor: '#8b949e', layerTitleColor: '#e6edf3',
  },
  light: {
    bg: '#ffffff', text: '#24292f', cardBg: '#f6f8fa',
    titleColor: '#0969da', footerColor: '#656d76', layerTitleColor: '#1f2328',
  },
  gradient: {
    bg: 'linear-gradient(135deg,#0f0c29,#302b63,#24243e)', text: '#e0e0e0',
    cardBg: 'rgba(255,255,255,0.08)', titleColor: '#f093fb',
    footerColor: '#adb5bd', layerTitleColor: '#ffffff',
  },
  minimal: {
    bg: '#fafafa', text: '#333', cardBg: '#fff',
    titleColor: '#111', footerColor: '#999', layerTitleColor: '#222',
  },
};

/**
 * @param {{type:string, layers:Array}} model - detectLayerMap 返回的模型
 * @param {{style?:string}} options - 渲染选项
 * @returns {string} 完整 HTML 字符串
 */
export function renderLayerMap(model, options = {}) {
  const style = options.style || 'dark';
  const t = THEMES[style] || THEMES.dark;
  const totalSkills = model.layers.reduce((s, l) => s + l.items.length, 0);

  const layerHTML = model.layers.map(layer => {
    // 层背景用该层颜色的半透明版本
    const layerBg = hexToRgba(layer.color, 0.12);
    const borderLeft = layer.color;

    const cardsHTML = layer.items.map(item => {
      const shortDesc = item.description.length > 60
        ? item.description.slice(0, 60) + '…'
        : item.description;
      return `<div class="card" title="${escapeAttr(item.description)}">
        <div class="card-name">${escapeHTML(item.label)}</div>
        <div class="card-desc">${escapeHTML(shortDesc)}</div>
      </div>`;
    }).join('');

    return `<div class="layer" style="background:${layerBg};border-left:4px solid ${borderLeft}">
      <div class="layer-title">${escapeHTML(layer.name)}<span class="layer-count">${layer.items.length}</span></div>
      <div class="layer-cards">${cardsHTML}</div>
    </div>`;
  }).join('');

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>OpenClaw Skill 生态全景</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{background:${t.bg};color:${t.text};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;padding:32px 24px;min-height:100vh}
.container{max-width:1200px;margin:0 auto}
h1{text-align:center;font-size:28px;font-weight:700;color:${t.titleColor};margin-bottom:32px;letter-spacing:1px}
.layer{border-radius:8px;padding:20px;margin-bottom:16px;display:flex;gap:20px;align-items:flex-start}
.layer-title{min-width:120px;font-size:18px;font-weight:600;color:${t.layerTitleColor};padding-top:4px;flex-shrink:0}
.layer-count{display:inline-block;background:rgba(255,255,255,0.15);border-radius:10px;padding:1px 8px;font-size:12px;margin-left:6px;font-weight:400;vertical-align:middle}
.layer-cards{flex:1;display:flex;flex-wrap:wrap;gap:10px}
.card{background:${t.cardBg};border-radius:6px;padding:10px 14px;min-width:160px;max-width:260px;flex:1 1 160px;cursor:default;transition:transform .15s,box-shadow .15s}
.card:hover{transform:translateY(-2px);box-shadow:0 4px 16px rgba(0,0,0,0.2)}
.card-name{font-weight:600;font-size:14px;margin-bottom:4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.card-desc{font-size:12px;opacity:.75;line-height:1.4}
.footer{text-align:center;color:${t.footerColor};font-size:13px;margin-top:32px;padding-top:16px;border-top:1px solid rgba(128,128,128,0.15)}
@media(max-width:640px){
  .layer{flex-direction:column}
  .layer-title{min-width:auto}
  .card{min-width:100%}
}
</style>
</head>
<body>
<div class="container">
  <h1>OpenClaw Skill 生态全景</h1>
  ${layerHTML}
  <div class="footer">${totalSkills} 个 Skill · ${model.layers.filter(l => l.items.length > 0).length} 层</div>
</div>
</body>
</html>`;
}

// --- 工具函数 ---

function hexToRgba(hex, alpha) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

function escapeHTML(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function escapeAttr(s) {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
