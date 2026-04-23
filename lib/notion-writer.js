/**
 * Notion 输出器 — 将架构图输出到 Notion 页面
 * 依赖：notion-cli、NOTION_API_TOKEN 环境变量
 */
import { execFileSync } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const TMP_DIR = '/tmp/kais-archi-notion';
const MAX_CONTENT_LEN = 1800;

// ─── Mermaid 语法检查 ──────────────────────────────────

/**
 * 检查 Mermaid 语法常见错误
 * @param {string} code - Mermaid 代码
 * @returns {{ valid: boolean, errors: string[] }}
 */
export function validateMermaid(code) {
  const errors = [];

  // 1. 检查基本结构
  const trimmed = code.trim();
  if (!trimmed) return { valid: false, errors: ['空内容'] };

  // 2. 移除 %%{...}%% init 块，提取有效代码行
  const withoutInit = trimmed.replace(/%%\{[\s\S]*?\}%%/g, '').trim();
  const codeLines = withoutInit.split('\n').filter(l => l.trim());

  // 提取图表类型
  const firstLine = codeLines[0]?.trim() || '';
  const knownTypes = ['graph', 'flowchart', 'sequenceDiagram', 'stateDiagram', 'classDiagram', 'erDiagram', 'gantt', 'pie', 'gitgraph', 'mindmap'];
  const graphType = knownTypes.find(t => firstLine.startsWith(t));
  if (!graphType) {
    errors.push('未知图表类型: ' + (firstLine.slice(0, 40) || '(空)'));
  }

  // 3. 检查括号匹配（仅检查非 init 块部分）
  const openParens = (withoutInit.match(/\[/g) || []).length;
  const closeParens = (withoutInit.match(/\]/g) || []).length;
  if (openParens !== closeParens) {
    errors.push(`方括号不匹配: [ 有 ${openParens} 个, ] 有 ${closeParens} 个`);
  }

  // 4. 检查 sequenceDiagram 参与者
  if (graphType === 'sequenceDiagram') {
    const participants = codeLines.filter(l => l.includes('participant'));
    const messages = codeLines.filter(l => l.match(/->>|-->>/));
    if (participants.length === 0 && messages.length > 0) {
      errors.push('sequenceDiagram 缺少 participant 定义');
    }
  }

  // 5. 检查花括号匹配（排除 init 块中已有的花括号）
  const openBraces = (withoutInit.match(/\{/g) || []).length;
  const closeBraces = (withoutInit.match(/\}/g) || []).length;
  if (openBraces !== closeBraces) {
    errors.push(`花括号不匹配: { 有 ${openBraces} 个, } 有 ${closeBraces} 个`);
  }

  // 6. 检查 subgraph/end 匹配
  if (graphType === 'graph' || graphType === 'flowchart') {
    const subgraphs = (withoutInit.match(/subgraph\s/g) || []).length;
    const ends = (withoutInit.match(/^end$/gm) || []).length;
    if (subgraphs > 0 && ends > 0 && subgraphs !== ends) {
      errors.push(`subgraph/end 不匹配: subgraph ${subgraphs} 个, end ${ends} 个`);
    }
  }

  return { valid: errors.length === 0, errors };
}

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
  if (content.length <= MAX_CONTENT_LEN) {
    notionCli(['block', 'append', pageId, '--type', 'code', '--language', language, '--content', content]);
    return;
  }
  const lines = content.split('\n');
  let chunk = '';
  let partNum = 0;
  for (const line of lines) {
    if (chunk.length + line.length + 1 > MAX_CONTENT_LEN && chunk.length > 0) {
      partNum++;
      const header = partNum > 1 ? `// ── 续 part ${partNum} ──\n` : '';
      notionCli(['block', 'append', pageId, '--type', 'code', '--language', language, '--content', header + chunk]);
      chunk = '';
    }
    chunk += (chunk ? '\n' : '') + line;
  }
  if (chunk) {
    partNum++;
    const header = partNum > 1 ? `// ── 续 part ${partNum} ──\n` : '';
    notionCli(['block', 'append', pageId, '--type', 'code', '--language', language, '--content', header + chunk]);
  }
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
function writeDiagramToPage(pageId, options) {
  const { label, mermaidCode, type, mermaid } = options;
  appendCodeBlock(pageId, mermaidCode || mermaid, 'mermaid');
  appendDivider(pageId);
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

  // 1. 语法预检
  const validationResults = [];
  const validItems = [];
  const invalidItems = [];

  console.log(`\n  🔍 Mermaid 语法预检 (${mermaidAll.length} 个图表)...`);

  for (const item of mermaidAll) {
    const result = validateMermaid(item.mermaid);
    validationResults.push({ type: item.type, label: item.label, ...result });
    if (result.valid) {
      validItems.push(item);
      console.log(`    ✅ ${item.label} — 通过`);
    } else {
      invalidItems.push(item);
      console.log(`    ❌ ${item.label} — ${result.errors.join('; ')}`);
    }
  }

  if (validItems.length === 0) {
    console.log(`\n  ⚠️ 所有图表语法检查失败，跳过 Notion 写入`);
    return { pageId: null, url: null, diagrams: validationResults };
  }

  // 2. 创建主题+日期子页面
  const pageTitle = `${projectName} 架构图 · ${date}`;
  console.log(`\n  📋 创建 Notion 页面: ${pageTitle}`);
  const pageId = createPage(parentId, pageTitle);

  // 3. 写入页面头部
  appendHeading2(pageId, `🏗 ${projectName} 架构图`);
  appendParagraph(pageId, `生成时间：${timestamp} · ${validItems.length} 个图表 · kais-archi v2.1`);
  appendDivider(pageId);

  // 4. 逐个写入图表
  for (const item of validItems) {
    try {
      writeDiagramToPage(pageId, item);
      console.log(`    ✅ ${item.label} — 已写入`);
    } catch (err) {
      console.error(`    ❌ ${item.label} — 写入失败: ${err.message}`);
    }
  }

  // 5. 写入失败的图表（作为纯文本附录）
  if (invalidItems.length > 0) {
    appendDivider(pageId);
    appendHeading2(pageId, '⚠️ 语法检查未通过的图表');
    for (const item of invalidItems) {
      const v = validationResults.find(r => r.type === item.type);
      appendCallout(pageId, '❌', `${item.label || item.type}: ${v.errors.join('; ')}`);
    }
  }

  // 6. 写入汇总信息
  appendDivider(pageId);
  appendParagraph(pageId, `💡 在 Notion 中，将上面的 mermaid 代码块复制到任意页面即可渲染为架构图。`);

  const url = `https://notion.so/${pageId.replace(/-/g, '')}`;
  console.log(`\n  📍 ${url}`);

  return { pageId, url, diagrams: validationResults };
}

/**
 * 兼容旧接口：单个图表写入独立页面
 */
export async function writeToNotion(parentId, options) {
  checkPrerequisites();
  const { projectName, mermaidCode, type, style = 'dark', label } = options;

  // 语法检查
  const validation = validateMermaid(mermaidCode);
  if (!validation.valid) {
    throw new Error(`Mermaid 语法错误: ${validation.errors.join('; ')}`);
  }

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

  return { pageId, url: `https://notion.so/${pageId.replace(/-/g, '')}`, type };
}
