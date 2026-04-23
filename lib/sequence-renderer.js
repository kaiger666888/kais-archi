/**
 * 时序图渲染器
 * 基于 SVG 工具函数渲染经典 UML 时序图
 * 零外部依赖
 */

import { createSVG, createNode, createText, wrapWithZoomPan } from './svg-utils.js';
import { sequenceLayout } from './layout-utils.js';

// --- 主题配色 ---
const THEMES = {
  dark: {
    bg: '#1a1a2e',
    actorFill: '#16213e',
    actorStroke: '#0f3460',
    actorText: '#e0e0e0',
    lifeline: '#555',
    syncColor: '#00d2ff',
    asyncColor: '#7b2ff7',
    returnColor: '#888',
    msgText: '#ccc',
    msgFont: '11px "JetBrains Mono", "Fira Code", monospace',
  },
  light: {
    bg: '#ffffff',
    actorFill: '#4a90d9',
    actorStroke: '#357abd',
    actorText: '#ffffff',
    lifeline: '#bbb',
    syncColor: '#4a90d9',
    asyncColor: '#e67e22',
    returnColor: '#999',
    msgText: '#333',
    msgFont: '11px "JetBrains Mono", "Fira Code", monospace',
  },
  gradient: {
    bg: '#0f0c29',
    actorFill: 'url(#actorGrad)',
    actorStroke: '#6c5ce7',
    actorText: '#ffffff',
    lifeline: '#444',
    syncColor: '#00cec9',
    asyncColor: '#fd79a8',
    returnColor: '#636e72',
    msgText: '#dfe6e9',
    msgFont: '11px "JetBrains Mono", "Fira Code", monospace',
  },
  minimal: {
    bg: '#fafafa',
    actorFill: '#2d3436',
    actorStroke: '#2d3436',
    actorText: '#ffffff',
    lifeline: '#ddd',
    syncColor: '#2d3436',
    asyncColor: '#636e72',
    returnColor: '#b2bec3',
    msgText: '#636e72',
    msgFont: '11px "SF Mono", "Menlo", monospace',
  },
};

/**
 * 渲染时序图为完整 HTML
 * @param {{type:'sequence', actors:string[], messages:Array<{from:string,to:string,text:string,index:number,async?:boolean,return?:boolean}>}} model
 * @param {{style?:string, width?:number}} [options]
 * @returns {string} 完整 HTML 字符串
 */
export function renderSequence(model, options = {}) {
  const { style = 'dark' } = options;
  const theme = THEMES[style] || THEMES.dark;

  const { actors, messages } = model;

  // 计算尺寸
  const actorWidth = 130;
  const actorHeight = 38;
  const padding = 60;
  const topMargin = 90;     // 参与者框底部留白
  const messageGap = 50;
  const bottomPadding = 60;

  // 宽度：参与者 × 间距，最小 800
  const minColWidth = 180;
  const computedWidth = Math.max(actors.length * minColWidth, 800);

  // 高度：顶部 + 消息行 + 底部
  const computedHeight = topMargin + messages.length * messageGap + bottomPadding;

  // 获取布局坐标
  const { actorX, messageY } = sequenceLayout(actors, messages, computedWidth, {
    padding, messageGap, topMargin,
  });

  // --- 构建 SVG ---
  let svg = createSVG(computedWidth, computedHeight);

  // defs：渐变（gradient 主题）+ 箭头 marker
  let defs = '<defs>';
  if (style === 'gradient') {
    defs += `<linearGradient id="actorGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#6c5ce7"/><stop offset="100%" stop-color="#a29bfe"/>
    </linearGradient>`;
  }
  // 同步箭头（实心三角）
  defs += `<marker id="seq-sync" viewBox="0 0 10 10" refX="10" refY="5" markerWidth="8" markerHeight="8" orient="auto">
    <path d="M0,1 L10,5 L0,9 Z" fill="${theme.syncColor}"/></marker>`;
  // 异步箭头（开放 V 形）
  defs += `<marker id="seq-async" viewBox="0 0 10 10" refX="10" refY="5" markerWidth="8" markerHeight="8" orient="auto">
    <path d="M0,1 L10,5 L0,9" fill="none" stroke="${theme.asyncColor}" stroke-width="1.5"/></marker>`;
  // 返回箭头（开放 V 形，灰色）
  defs += `<marker id="seq-return" viewBox="0 0 10 10" refX="10" refY="5" markerWidth="7" markerHeight="7" orient="auto">
    <path d="M0,1 L10,5 L0,9" fill="none" stroke="${theme.returnColor}" stroke-width="1.5"/></marker>`;
  defs += '</defs>';

  // --- 参与者框 ---
  const actorNodes = actors.map((actor, i) => {
    const x = actorX[actor];
    const y = 40;
    // 参与者名称截断显示
    const displayLabel = actor.length > 16 ? actor.slice(0, 14) + '…' : actor;
    return createNode(x, y, `actor-${i}`, displayLabel, {
      shape: 'rounded',
      width: actorWidth,
      height: actorHeight,
      fill: theme.actorFill,
      stroke: theme.actorStroke,
      textColor: theme.actorText,
      fontSize: 12,
    });
  });

  // --- 生命线 ---
  const lifelines = actors.map((actor) => {
    const x = actorX[actor];
    const y1 = 40 + actorHeight / 2 + 4;   // 参与者框底部
    const y2 = computedHeight - 20;          // 接近底部
    return `<line class="lifeline" data-actor="${actor}" x1="${x}" y1="${y1}" x2="${x}" y2="${y2}" stroke="${theme.lifeline}" stroke-width="1" stroke-dasharray="6,4" opacity="0.5"/>`;
  });

  // --- 消息箭头 ---
  const messageElements = messages.map((msg, i) => {
    const fromX = actorX[msg.from];
    const toX = actorX[msg.to];
    const y = messageY[msg.index];

    // 安全检查：参与者不存在时跳过
    if (fromX === undefined || toX === undefined) return '';

    // 确定箭头样式
    let lineColor, markerRef, dashAttr, lineOpacity;
    if (msg.return) {
      lineColor = theme.returnColor;
      markerRef = 'url(#seq-return)';
      dashAttr = ' stroke-dasharray="6,3"';
      lineOpacity = '0.7';
    } else if (msg.async) {
      lineColor = theme.asyncColor;
      markerRef = 'url(#seq-async)';
      dashAttr = '';
      lineOpacity = '0.9';
    } else {
      lineColor = theme.syncColor;
      markerRef = 'url(#seq-sync)';
      dashAttr = '';
      lineOpacity = '1';
    }

    // 生命线到箭头的起止 x（留出间距避免覆盖生命线）
    const gap = 6;
    const sx = fromX < toX ? fromX + gap : fromX - gap;
    const ex = toX < fromX ? toX + gap : toX - gap;

    // 箭头路径
    const pathEl = `<path class="msg-line" data-from="${msg.from}" data-to="${msg.to}" data-idx="${i}" d="M${sx},${y} L${ex},${y}" fill="none" stroke="${lineColor}" stroke-width="1.5"${dashAttr} marker-end="${markerRef}" opacity="${lineOpacity}"/>`;

    // 消息标签
    const midX = (sx + ex) / 2;
    const labelY = y - 8;
    const displayText = msg.text.length > 40 ? msg.text.slice(0, 38) + '…' : msg.text;
    const labelEl = `<text class="msg-label" data-from="${msg.from}" data-to="${msg.to}" data-idx="${i}" x="${midX}" y="${labelY}" text-anchor="middle" fill="${theme.msgText}" font-family="${theme.msgFont}">${escapeXml(displayText)}</text>`;

    // 序号小圆点
    const dotEl = `<circle class="msg-dot" data-from="${msg.from}" data-to="${msg.to}" data-idx="${i}" cx="${sx}" cy="${y}" r="3" fill="${lineColor}" opacity="0.6"/>`;

    return `${dotEl}${pathEl}${labelEl}`;
  });

  // 拼装 SVG
  const allContent = [defs, ...actorNodes, ...lifelines, ...messageElements].join('\n');
  const fullSvg = `${svg}\n${allContent}\n</svg>`;

  // 包裹为 HTML + 交互样式
  return wrapSequenceHtml(fullSvg, computedWidth, computedHeight, theme);
}

/**
 * 包裹为带 hover 交互的 HTML
 */
function wrapSequenceHtml(svgContent, width, height, theme) {
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><style>
*{margin:0;padding:0;box-sizing:border-box}
body{background:${theme.bg};display:flex;align-items:center;justify-content:center;height:100vh;overflow:hidden;font-family:${theme.msgFont}}
.viewport{width:${width}px;height:${height}px;overflow:hidden;border:1px solid ${theme.lifeline};border-radius:8px;background:${theme.bg};cursor:grab;position:relative}
.viewport:active{cursor:grabbing}
.viewport svg{transform-origin:0 0;transition:none}
/* hover 高亮：消息悬停时高亮相关生命线 */
.msg-line:hover,.msg-label:hover,.msg-dot:hover{filter:brightness(1.4);cursor:pointer}
.viewport:hover .lifeline{opacity:0.3;transition:opacity 0.2s}
.viewport:hover .lifeline.highlight{opacity:1;stroke-width:2;transition:opacity 0.2s}
.hint{position:fixed;bottom:12px;right:12px;font:12px/1 sans-serif;color:#666;pointer-events:none}
</style></head><body>
<div class="viewport" id="vp">${svgContent}</div>
<div class="hint">滚轮缩放 · 拖拽平移 · 双击重置</div>
<script>
(function(){
  const vp=document.getElementById('vp'),svg=vp.querySelector('svg');
  let scale=1,tx=0,ty=0,dragging=false,sx,sy,stx,sty;
  function apply(){svg.style.transform=\`translate(\${tx}px,\${ty}px) scale(\${scale})\`}

  // 缩放
  vp.addEventListener('wheel',e=>{
    e.preventDefault();
    const d=e.deltaY>0?0.9:1.1;
    const r=vp.getBoundingClientRect();
    const mx=e.clientX-r.left,my=e.clientY-r.top;
    tx=mx-(mx-tx)*d;ty=my-(my-ty)*d;scale*=d;
    apply();
  },{passive:false});

  // 拖拽
  vp.addEventListener('mousedown',e=>{dragging=true;sx=e.clientX;sy=e.clientY;stx=tx;sty=ty});
  window.addEventListener('mousemove',e=>{if(!dragging)return;tx=stx+e.clientX-sx;ty=sty+e.clientY-sy;apply()});
  window.addEventListener('mouseup',()=>{dragging=false});
  vp.addEventListener('dblclick',()=>{scale=1;tx=0;ty=0;apply()});

  // hover 高亮相关生命线
  const lifelines=vp.querySelectorAll('.lifeline');
  const msgEls=vp.querySelectorAll('.msg-line,.msg-label,.msg-dot');
  msgEls.forEach(el=>{
    el.addEventListener('mouseenter',()=>{
      const from=el.dataset.from,to=el.dataset.to;
      lifelines.forEach(ll=>{
        ll.classList.toggle('highlight',ll.dataset.actor===from||ll.dataset.actor===to);
      });
    });
    el.addEventListener('mouseleave',()=>{
      lifelines.forEach(ll=>ll.classList.remove('highlight'));
    });
  });
})();
</script></body></html>`;
}

/** XML 特殊字符转义 */
function escapeXml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
