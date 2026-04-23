/**
 * SVG 渲染工具函数
 * 零依赖，纯字符串拼接生成 SVG 片段
 */

/**
 * 创建 SVG 根元素字符串
 * @param {number} width - 画布宽度
 * @param {number} height - 画布高度
 * @param {string} [viewBox] - 可选 viewBox，默认等于 width height
 * @returns {string} <svg> 开始标签
 */
export function createSVG(width, height, viewBox) {
  const vb = viewBox || `0 0 ${width} ${height}`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="${vb}">`;
}

/**
 * 创建节点（SVG group）
 * @param {number} x - 中心 x
 * @param {number} y - 中心 y
 * @param {string} id - 节点 ID（用于 defs/cursor）
 * @param {string} label - 显示文本
 * @param {object} [opts]
 * @param {'rect'|'rounded'|'diamond'|'circle'} [opts.shape='rounded'] - 形状
 * @param {number} [opts.width=120] - 宽度
 * @param {number} [opts.height=40] - 高度
 * @param {string} [opts.fill='#fff'] - 填充色
 * @param {string} [opts.stroke='#333'] - 描边色
 * @param {string} [opts.textColor='#333'] - 文字颜色
 * @param {number} [opts.fontSize=13] - 字号
 * @param {string} [opts.icon] - 可选 emoji/unicode 图标前缀
 * @returns {string} SVG <g> 字符串
 */
export function createNode(x, y, id, label, opts = {}) {
  const {
    shape = 'rounded',
    width = 120,
    height = 40,
    fill = '#fff',
    stroke = '#333',
    textColor = '#333',
    fontSize = 13,
    icon = '',
  } = opts;

  const hw = width / 2, hh = height / 2;
  let shapeEl = '';

  switch (shape) {
    case 'rect':
      shapeEl = `<rect x="${x - hw}" y="${y - hh}" width="${width}" height="${height}" fill="${fill}" stroke="${stroke}" stroke-width="1.5"/>`;
      break;
    case 'rounded':
      shapeEl = `<rect x="${x - hw}" y="${y - hh}" width="${width}" height="${height}" rx="8" ry="8" fill="${fill}" stroke="${stroke}" stroke-width="1.5"/>`;
      break;
    case 'diamond':
      shapeEl = `<polygon points="${x},${y - hh} ${x + hw},${y} ${x},${y + hh} ${x - hw},${y}" fill="${fill}" stroke="${stroke}" stroke-width="1.5"/>`;
      break;
    case 'circle': {
      const r = Math.min(hw, hh);
      shapeEl = `<circle cx="${x}" cy="${y}" r="${r}" fill="${fill}" stroke="${stroke}" stroke-width="1.5"/>`;
      break;
    }
  }

  const displayLabel = icon ? `${icon} ${label}` : label;
  const textEl = `<text x="${x}" y="${y}" text-anchor="middle" dominant-baseline="central" fill="${textColor}" font-size="${fontSize}">${displayLabel}</text>`;

  return `<g id="${id}">${shapeEl}${textEl}</g>`;
}

/**
 * 创建边（路径 + 箭头 + 标签）
 * @param {number} fromX - 起点 x
 * @param {number} fromY - 起点 y
 * @param {number} toX - 终点 x
 * @param {number} toY - 终点 y
 * @param {object} [opts]
 * @param {string} [opts.label] - 边标签
 * @param {string} [opts.color='#666'] - 线条颜色
 * @param {boolean} [opts.dashed=false] - 是否虚线
 * @param {number} [opts.arrowSize=8] - 箭头大小
 * @param {number} [opts.strokeWidth=1.5] - 线宽
 * @param {boolean} [opts.curved=false] - 是否曲线
 * @returns {string} SVG 字符串
 */
export function createEdge(fromX, fromY, toX, toY, opts = {}) {
  const {
    label, color = '#666', dashed = false,
    arrowSize = 8, strokeWidth = 1.5, curved = false,
  } = opts;

  // 计算方向角
  const dx = toX - fromX, dy = toY - fromY;
  const len = Math.sqrt(dx * dx + dy * dy) || 1;
  const ux = dx / len, uy = dy / len;

  // 箭头终点（缩进 arrowSize 避免覆盖节点）
  const endX = toX - ux * arrowSize;
  const endY = toY - uy * arrowSize;

  // 路径
  let d;
  if (curved && len > 0) {
    const mx = (fromX + toX) / 2, my = (fromY + toY) / 2;
    const cx = mx - uy * len * 0.2, cy = my + ux * len * 0.2;
    d = `M${fromX},${fromY} Q${cx},${cy} ${endX},${endY}`;
  } else {
    d = `M${fromX},${fromY} L${endX},${endY}`;
  }

  const dashAttr = dashed ? ' stroke-dasharray="6,3"' : '';
  const pathEl = `<path d="${d}" fill="none" stroke="${color}" stroke-width="${strokeWidth}"${dashAttr} marker-end="url(#arrow-${color.replace('#','')})"/>`;

  // 箭头 marker（用 id 缓存避免重复）
  const markerEl = `<defs><marker id="arrow-${color.replace('#','')}" viewBox="0 0 10 10" refX="10" refY="5" markerWidth="${arrowSize}" markerHeight="${arrowSize}" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 Z" fill="${color}"/></marker></defs>`;

  // 标签
  let labelEl = '';
  if (label) {
    const lx = (fromX + toX) / 2, ly = (fromY + toY) / 2 - 8;
    labelEl = `<text x="${lx}" y="${ly}" text-anchor="middle" fill="${color}" font-size="11">${label}</text>`;
  }

  return `${markerEl}${pathEl}${labelEl}`;
}

/**
 * 创建文本元素
 * @param {number} x - x 坐标
 * @param {number} y - y 坐标
 * @param {string} text - 文本内容
 * @param {object} [opts]
 * @param {'start'|'middle'|'end'} [opts.anchor='start'] - 对齐方式
 * @param {number} [opts.fontSize=13] - 字号
 * @param {string} [opts.fill='#333'] - 颜色
 * @param {string} [opts.fontWeight='normal'] - 字重
 * @returns {string} SVG <text> 字符串
 */
export function createText(x, y, text, opts = {}) {
  const { anchor = 'start', fontSize = 13, fill = '#333', fontWeight = 'normal' } = opts;
  return `<text x="${x}" y="${y}" text-anchor="${anchor}" dominant-baseline="central" fill="${fill}" font-size="${fontSize}" font-weight="${fontWeight}">${text}</text>`;
}

/**
 * 包裹 SVG 内容，添加鼠标滚轮缩放和拖拽平移
 * @param {string} svgContent - 完整的 <svg>...</svg> 字符串
 * @param {number} width - 容器宽度
 * @param {number} height - 容器高度
 * @returns {string} 包裹后的 HTML 字符串（含内联 JS）
 */
export function wrapWithZoomPan(svgContent, width, height) {
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><style>
*{margin:0;padding:0;box-sizing:border-box}
body{background:#f8f9fa;display:flex;align-items:center;justify-content:center;height:100vh;overflow:hidden}
.viewport{width:${width}px;height:${height}px;overflow:hidden;border:1px solid #ddd;border-radius:8px;background:#fff;cursor:grab}
.viewport:active{cursor:grabbing}
.viewport svg{transform-origin:0 0;transition:none}
.hint{position:fixed;bottom:12px;right:12px;font:12px/1 sans-serif;color:#999}
</style></head><body>
<div class="viewport" id="vp">${svgContent}</div>
<div class="hint">滚轮缩放 · 拖拽平移 · 双击重置</div>
<script>
(function(){
  const vp=document.getElementById('vp'),svg=vp.querySelector('svg');
  let scale=1,tx=0,ty=0,dragging=false,sx,sy,stx,sty;
  function apply(){svg.style.transform=\`translate(\${tx}px,\${ty}px) scale(\${scale})\`}
  vp.addEventListener('wheel',e=>{
    e.preventDefault();
    const d=e.deltaY>0?0.9:1.1;
    const r=vp.getBoundingClientRect();
    const mx=e.clientX-r.left,my=e.clientY-r.top;
    tx=mx-(mx-tx)*d;ty=my-(my-ty)*d;scale*=d;
    apply();
  },{passive:false});
  vp.addEventListener('mousedown',e=>{dragging=true;sx=e.clientX;sy=e.clientY;stx=tx;sty=ty});
  window.addEventListener('mousemove',e=>{if(!dragging)return;tx=stx+e.clientX-sx;ty=sty+e.clientY-sy;apply()});
  window.addEventListener('mouseup',()=>{dragging=false});
  vp.addEventListener('dblclick',()=>{scale=1;tx=0;ty=0;apply()});
})();
</script></body></html>`;
}
