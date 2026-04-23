/**
 * kais-archi/hub-renderer.js — 导航中心页渲染
 * ES Module
 *
 * 生成一个包含所有图表导航的主页，链接到各子页面。
 */

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const TEMPLATES_DIR = join(__dirname, '..', 'templates');

function loadCSS(style) {
  try {
    return readFileSync(join(TEMPLATES_DIR, `${style}.css`), 'utf-8');
  } catch {
    return readFileSync(join(TEMPLATES_DIR, 'dark.css'), 'utf-8');
  }
}

/**
 * 渲染导航中心页
 * @param {object} options
 * @param {string} options.targetDir - 目标目录
 * @param {string} options.projectName - 项目名称
 * @param {string} options.style - 主题
 * @param {Array<{type:string, file:string, label:string, icon:string, desc:string, size?:string}>} options.pages - 子页面列表
 * @returns {string} HTML
 */
export function renderHub(options) {
  const { projectName, style = 'dark', pages = [] } = options;
  const css = loadCSS(style);

  const cards = pages.map(p => {
    const sizeTag = p.size ? `<span class="card-size">${p.size}</span>` : '';
    const statusTag = p.error
      ? `<span class="card-status error">⚠️ ${p.error}</span>`
      : `<span class="card-status ok">✅</span>`;
    const link = p.error ? '' : `onclick="location.href='${p.file}'"`;
    return `
    <div class="hub-card" ${link} ${p.error ? 'style="opacity:0.5;cursor:not-allowed;"' : ''}>
      <div class="card-header">
        <span class="card-icon">${p.icon}</span>
        <span class="card-label">${p.label}</span>
        ${sizeTag}
      </div>
      <div class="card-desc">${p.desc}</div>
      <div class="card-footer">
        ${statusTag}
        <span class="card-file">${p.file}</span>
      </div>
    </div>`;
  }).join('');

  const now = new Date().toISOString().slice(0, 16).replace('T', ' ');

  return `<!DOCTYPE html>
<html lang="zh">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${projectName} — 架构图导航</title>
<style>${css}
.hub-title { text-align: center; margin: 20px 0 8px; }
.hub-title h1 { font-size: 32px; }
.hub-title h1 span { color: #6c5ce7; }
.hub-subtitle { text-align: center; color: #666; margin-bottom: 30px; font-size: 13px; }
.hub-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 16px; max-width: 1000px; margin: 0 auto; padding: 0 20px; }
.hub-card { background: #1a1a2e; border: 1px solid #2d2d4a; border-radius: 12px; padding: 20px; cursor: pointer; transition: all 0.3s; }
.hub-card:hover { border-color: #6c5ce7; transform: translateY(-2px); box-shadow: 0 8px 24px rgba(108,92,231,0.15); }
.card-header { display: flex; align-items: center; gap: 10px; margin-bottom: 8px; }
.card-icon { font-size: 24px; }
.card-label { font-weight: 700; font-size: 16px; color: #fff; }
.card-size { font-size: 11px; color: #888; margin-left: auto; background: rgba(108,92,231,0.15); padding: 2px 8px; border-radius: 10px; }
.card-desc { font-size: 12px; color: #888; line-height: 1.6; margin-bottom: 12px; }
.card-footer { display: flex; align-items: center; justify-content: space-between; }
.card-status { font-size: 11px; }
.card-status.ok { color: #00b894; }
.card-status.error { color: #ff6b6b; }
.card-file { font-size: 10px; color: #555; font-family: monospace; }
.hub-meta { text-align: center; margin: 40px 0 20px; color: #444; font-size: 11px; }
.hub-nav { display: flex; justify-content: center; gap: 8px; margin-bottom: 30px; }
.hub-nav a { color: #6c5ce7; text-decoration: none; font-size: 12px; padding: 4px 12px; border: 1px solid #2d2d4a; border-radius: 20px; transition: all 0.2s; }
.hub-nav a:hover { background: rgba(108,92,231,0.15); border-color: #6c5ce7; }
.hub-nav a.active { background: #6c5ce7; color: #fff; border-color: #6c5ce7; }
</style>
</head>
<body>
<div class="hub-title"><h1>🗺 <span>${projectName}</span></h1></div>
<p class="hub-subtitle">架构可视化导航中心 · ${pages.filter(p => !p.error).length}/${pages.length} 图表已生成</p>
<div class="hub-nav">
  <a href="index.html" class="active">🏠 导航</a>
  ${pages.filter(p => !p.error).map(p => `<a href="${p.file}">${p.icon} ${p.label}</a>`).join('\n  ')}
</div>
<div class="hub-grid">${cards}</div>
<div class="hub-meta">生成于 ${now} · kais-archi v2.0</div>
</body>
</html>`;
}
