/**
 * Notion 输出器 — 将架构图输出到 Notion 页面
 * 依赖：notion-cli、NOTION_API_TOKEN 环境变量
 */
import { execFileSync } from 'node:child_process';
import { writeFileSync, mkdirSync, unlinkSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { compressMermaid } from './mermaid-compressor.js';

const TMP_DIR = '/tmp/kais-archi-notion';
const MAX_CONTENT_LEN = 1800;
const PUPPETEER_CFG = '/tmp/.mermaid-puppeteer.json';
if (!existsSync(PUPPETEER_CFG)) {
  writeFileSync(PUPPETEER_CFG, '{"args":["--no-sandbox","--disable-setuid-sandbox"]}');
}

// ─── mmdc 渲染到 PNG ─────────────────────────────────

/**
 * 用 mmdc 渲染 mermaid 为 PNG（白色背景）
 * @returns {{ valid: boolean, pngPath?: string, error?: string }}
 */
function mmdcRenderToPng(code) {
  const id = `${Date.now()}-${Math.random().toString(36).slice(2,6)}`;
  const tmpFile = `/tmp/mmdc-r-${id}.mmd`;
  const pngFile = `/tmp/mmdc-r-${id}.png`;
  try {
    writeFileSync(tmpFile, code);
    execFileSync('npx', [
      '@mermaid-js/mermaid-cli', '-i', tmpFile, '-o', pngFile, '-b', 'white',
      '-p', PUPPETEER_CFG, '-w', '2400', '-H', '3200', '-s', '3',
    ], { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'], timeout: 20000 });
    return { valid: true, pngPath: pngFile };
  } catch (e) {
    const err = (e.stderr || e.message || '').split('\n').slice(0, 2).join(' ').slice(0, 300);
    return { valid: false, error: err };
  } finally {
    try { unlinkSync(tmpFile); } catch {}
  }
}

// ─── GitHub 上传 ───────────────────────────────────

const GITHUB_REPO = 'kaiger666888/kais-archi';
const GITHUB_BRANCH = 'main';
const GITHUB_RAW_BASE = `https://raw.githubusercontent.com/${GITHUB_REPO}/${GITHUB_BRANCH}`;

/**
 * 上传 PNG 到 GitHub 并返回 raw URL
 */
function uploadPngToGithub(pngPath, label) {
  const remoteDir = `docs/${label}`;
  const remoteFile = `${remoteDir}/${path.basename(pngPath)}`;
  const absDir = join(process.cwd(), remoteDir);
  mkdirSync(absDir, { recursive: true });

  const destPath = join(absDir, path.basename(pngPath));
  writeFileSync(destPath, readFileSync(pngPath));

  execFileSync('git', ['add', remoteFile], { cwd: process.cwd(), encoding: 'utf-8', stdio: 'pipe' });
  try {
    execFileSync('git', ['commit', '-m', `🎨 ${label}: ${path.basename(pngPath)}`], { cwd: process.cwd(), encoding: 'utf-8', stdio: 'pipe' });
  } catch {
    // 没有变更（同一内容）
  }
  execFileSync('git', ['push', 'origin', GITHUB_BRANCH], { cwd: process.cwd(), encoding: 'utf-8', stdio: 'pipe', timeout: 30000 });

  return `${GITHUB_RAW_BASE}/${remoteFile}`;
}

// ─── Mermaid 语法检查 ──────────────────────────────────

// ─── Mermaid 语法检查 ──────────────────────────────────

// ─── Notion API 工具 ────────────────────────────────────

function checkPrerequisites() {
  if (!process.env.NOTION_API_KEY && !process.env.NOTION_API_TOKEN) {
    throw new Error('环境变量 NOTION_API_KEY 或 NOTION_API_TOKEN 未设置');
  }
  try {
    execFileSync('which', ['notion-cli'], { stdio: 'pipe' });
  } catch {
    throw new Error('notion-cli 未安装');
  }
}

function notionCli(args, input = '') {
  return execFileSync('notion-cli', args, {
    input,
    encoding: 'utf-8',
    stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...process.env },
    maxBuffer: 1024 * 1024,
  });
}

function createPage(parentId, title) {
  const result = notionCli(['page', 'create', '--parent', parentId, '--title', title]);
  const idMatch = result.match(/([0-9a-f]{32})/);
  if (!idMatch) throw new Error(`创建页面失败: ${result.slice(0, 200)}`);
  return idMatch[1];
}

// ─── Block 追加函数 ─────────────────────────────────────

function appendCodeBlock(pageId, content, language = 'plain text') {
  if (content.length <= 1500) {
    notionCli(['block', 'append', pageId, '--type', 'code', '--language', language, '--content', content]);
    return;
  }
  // 大内容：用 --children-file，rich_text 拆分为多个 ≤2000 字符的片段（同一个 code block 内）
  const richTextParts = [];
  let remaining = content;
  while (remaining.length > 0) {
    richTextParts.push({ type: 'text', text: { content: remaining.slice(0, 2000) } });
    remaining = remaining.slice(2000);
  }
  const childrenJson = JSON.stringify({
    children: [{ type: 'code', code: { rich_text: richTextParts, language } }],
  });
  const tmpFile = `/tmp/kais-archi-codeblock-${Date.now()}.json`;
  writeFileSync(tmpFile, childrenJson);
  notionCli(['block', 'append', pageId, '--children-file', tmpFile]);
  try { unlinkSync(tmpFile); } catch {}
}

function appendHeading2(pageId, text) {
  if (text.length > MAX_CONTENT_LEN) text = text.slice(0, MAX_CONTENT_LEN);
  notionCli(['block', 'append', pageId, '--type', 'heading_2', '--content', text]);
}

function appendParagraph(pageId, text) {
  if (text.length <= MAX_CONTENT_LEN) {
    notionCli(['block', 'append', pageId, '--type', 'paragraph', '--content', text]);
    return;
  }
  const lines = text.split('\n');
  let chunk = '';
  for (const line of lines) {
    if (chunk.length + line.length + 1 > MAX_CONTENT_LEN && chunk.length > 0) {
      notionCli(['block', 'append', pageId, '--type', 'paragraph', '--content', chunk.trim()]);
      chunk = '';
    }
    chunk += line + '\n';
  }
  if (chunk.trim()) {
    notionCli(['block', 'append', pageId, '--type', 'paragraph', '--content', chunk.trim()]);
  }
}

function appendDivider(pageId) {
  notionCli(['block', 'append', pageId, '--type', 'divider', '--content', '---']);
}

function appendBullet(pageId, text) {
  if (text.length > MAX_CONTENT_LEN) text = text.slice(0, MAX_CONTENT_LEN);
  notionCli(['block', 'append', pageId, '--type', 'bulleted_list_item', '--content', text]);
}

function appendCallout(pageId, emoji, text) {
  if (text.length > MAX_CONTENT_LEN) text = text.slice(0, MAX_CONTENT_LEN);
  notionCli(['block', 'append', pageId, '--type', 'callout', '--content', `${emoji} ${text}`]);
}

// ─── 写入单个图表到已有页面 ─────────────────────────────

/**
 * 将一个图表写入到指定的 Notion 页面（不创建新页面）
 */
/**
 * 将一个图表写入 Notion 页面，先用 mmdc 验证
 * @returns {{ written: boolean, reason?: string }}
 */
function writeDiagramToPage(pageId, options) {
  const { label, mermaidCode, type, mermaid } = options;
  const rawCode = mermaidCode || mermaid;

  // PNG 模式：不压缩，直接用完整 mermaid 渲染
  appendHeading2(pageId, `📊 ${label || type}`);

  const r = mmdcRenderToPng(rawCode);
  if (!r.valid) {
    console.log(`    ❌ ${label}: 渲染失败 — ${r.error}`);
    appendCallout(pageId, '❌', `Mermaid 渲染失败: ${r.error}`);
    appendDivider(pageId);
    return { written: false, reason: r.error };
  }

  // 上传 PNG 到 GitHub
  const fileLabel = `${label.replace(/[^a-zA-Z0-9\u4e00-\u9fff]/g, '-')}`;
  const imgUrl = uploadPngToGithub(r.pngPath, fileLabel);
  console.log(`    ✅ ${label} — 渲染并上传`);

  // 创建 image block
  const jsonFile = `/tmp/kais-archi-img-${Date.now()}-${Math.random().toString(36).slice(2,6)}.json`;
  writeFileSync(jsonFile, JSON.stringify({
    children: [{ type: 'image', image: { type: 'external', external: { url: imgUrl } } }],
  }));
  notionCli(['block', 'append', pageId, '--children-file', jsonFile]);
  try { unlinkSync(jsonFile); } catch {}

  // 源码 callout（折叠）
  appendDivider(pageId);
  const { compressed } = compressMermaid(rawCode);
  appendCallout(pageId, '📝', `Mermaid 源码 (${rawCode.length} 字符)`);
  appendCodeBlock(pageId, rawCode, 'mermaid');
  appendDivider(pageId);
  return { written: true };
}

// ─── 主入口：按主题创建页面 ─────────────────────────────

/**
 * 将所有图表写入 Notion（主题+日期子页面，所有图在同一页面内）
 * @param {string} parentId - 父页面 ID（架构图总页面）
 * @param {{ projectName: string, mermaidAll: Array<{type, mermaid, label}>, style: string }} options
 * @returns {Promise<{pageId: string, url: string, diagrams: Array<{type, valid, errors}>}>}
 */
export async function writeAllToNotion(parentId, options) {
  checkPrerequisites();

  const { projectName, mermaidAll = [], style = 'dark' } = options;
  const timestamp = new Date().toLocaleString('zh-CN', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
  });
  const date = new Date().toLocaleDateString('zh-CN', { timeZone: 'Asia/Shanghai' });

  // 1. 创建主题+日期子页面
  const pageTitle = `${projectName} 架构图 · ${date}`;
  console.log(`\n  📋 创建 Notion 页面: ${pageTitle}`);
  const pageId = createPage(parentId, pageTitle);

  // 2. 写入页面头部
  appendHeading2(pageId, `🏗 ${projectName} 架构图`);
  appendParagraph(pageId, `生成时间：${timestamp} · ${mermaidAll.length} 个图表 · kais-archi v2.2`);
  appendDivider(pageId);

  // 3. 逐个写入图表（mmdc 验证在 writeDiagramToPage 内完成）
  const results = [];
  for (const item of mermaidAll) {
    try {
      const r = writeDiagramToPage(pageId, item);
      results.push({ type: item.type, label: item.label, valid: r.written, error: r.reason });
      if (r.written) {
        console.log(`    ✅ ${item.label} — 已写入`);
      } else {
        console.log(`    ❌ ${item.label} — 验证失败`);
      }
    } catch (err) {
      results.push({ type: item.type, label: item.label, valid: false, error: err.message });
      console.error(`    ❌ ${item.label} — 写入失败: ${err.message}`);
    }
  }

  // 4. 写入汇总信息
  appendDivider(pageId);
  const writtenCount = results.filter(r => r.valid).length;
  appendParagraph(pageId, `💡 在 Notion 中，将上面的 mermaid 代码块复制到任意页面即可渲染为架构图。`);

  const url = `https://notion.so/${pageId}`;
  console.log(`\n  📍 ${url}`);

  return { pageId, url, diagrams: results };
}

/**
 * 兼容旧接口：单个图表写入独立页面
 */
export async function writeToNotion(parentId, options) {
  checkPrerequisites();
  const { projectName, mermaidCode, type, style = 'dark', label } = options;

  // mmdc 验证
  const v = mmdcValidate(mermaidCode);
  if (!v.valid) throw new Error(`Mermaid 渲染失败: ${v.error}`);

  const title = `${projectName} - ${label || type} 架构图`;
  const timestamp = new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });
  const pageId = createPage(parentId, title);

  appendHeading2(pageId, `📊 ${label || type} 架构图`);
  appendParagraph(pageId, `${label || type} 图表 — ${projectName}`);
  appendDivider(pageId);
  appendHeading2(pageId, 'Mermaid 源码');
  appendCodeBlock(pageId, mermaidCode, 'mermaid');
  appendDivider(pageId);
  appendHeading2(pageId, '图表说明');
  appendBullet(pageId, `**图表类型**：${type}`);
  appendBullet(pageId, `**生成时间**：${timestamp}`);
  appendBullet(pageId, `**项目**：${projectName}`);
  appendBullet(pageId, `**样式主题**：${style}`);
  appendDivider(pageId);
  appendParagraph(pageId, '💡 在 Notion 中，将上面的 mermaid 代码块复制到任意页面即可渲染为架构图。');

  return { pageId, url: `https://notion.so/${pageId}`, type };
}
