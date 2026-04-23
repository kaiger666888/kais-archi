/**
 * Notion 输出器 — 将架构图输出到 Notion 页面
 * 依赖：notion-cli、NOTION_API_TOKEN 环境变量
 */
import { execFileSync } from 'node:child_process';
import { existsSync, writeFileSync, mkdirSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';

const TMP_DIR = '/tmp/kais-archi-notion';
const MAX_CONTENT_LEN = 1800; // Notion rich_text 上限 2000，留余量

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

/**
 * 安全执行 notion-cli
 */
function notionCli(args, input = '') {
  return execFileSync('notion-cli', args, {
    input,
    encoding: 'utf-8',
    stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...process.env },
    maxBuffer: 1024 * 1024,
  });
}

/**
 * 追加一个 code block（自动分段处理超长内容）
 */
function appendCodeBlock(pageId, content, language = 'plain text') {
  if (content.length <= MAX_CONTENT_LEN) {
    notionCli(['block', 'append', pageId, '--type', 'code', '--language', language, '--content', content]);
    return;
  }

  // 超长内容拆分为多个 code block
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

/**
 * 追加一个 heading_2
 */
function appendHeading2(pageId, text) {
  if (text.length > MAX_CONTENT_LEN) text = text.slice(0, MAX_CONTENT_LEN);
  notionCli(['block', 'append', pageId, '--type', 'heading_2', '--content', text]);
}

/**
 * 追加一个 paragraph（自动分段）
 */
function appendParagraph(pageId, text) {
  if (text.length <= MAX_CONTENT_LEN) {
    notionCli(['block', 'append', pageId, '--type', 'paragraph', '--content', text]);
    return;
  }

  // 分段
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

/**
 * 追加 divider
 */
function appendDivider(pageId) {
  notionCli(['block', 'append', pageId, '--type', 'divider', '--content', '---']);
}

/**
 * 追加 bulleted_list_item
 */
function appendBullet(pageId, text) {
  if (text.length > MAX_CONTENT_LEN) text = text.slice(0, MAX_CONTENT_LEN);
  notionCli(['block', 'append', pageId, '--type', 'bulleted_list_item', '--content', text]);
}

/**
 * 将架构图输出到 Notion
 */
export async function writeToNotion(parentId, options) {
  checkPrerequisites();

  const { projectName, mermaidCode, type, style = 'dark', label } = options;
  const title = `${label || type} 架构图`;
  const timestamp = new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });

  // 1. 创建子页面
  const createResult = notionCli(['page', 'create', '--parent', parentId, '--title', `${projectName} - ${title}`]);
  const idMatch = createResult.match(/([0-9a-f]{32})/);
  if (!idMatch) throw new Error(`创建页面失败: ${createResult.slice(0, 200)}`);
  const pageId = idMatch[1];

  // 2. 追加内容
  appendHeading2(pageId, `📊 ${title}`);
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

/**
 * 批量输出所有图表到 Notion
 */
export async function writeAllToNotion(parentId, options) {
  checkPrerequisites();

  const { projectName, mermaidAll = [], style = 'dark' } = options;
  const results = [];

  for (const item of mermaidAll) {
    try {
      const result = await writeToNotion(parentId, {
        projectName,
        mermaidCode: item.mermaid,
        type: item.type,
        label: item.label,
        style,
      });
      results.push(result);
      console.log(`  ✅ Notion: ${item.label} → ${result.url}`);
    } catch (err) {
      console.error(`  ❌ Notion: ${item.label} 失败: ${err.message}`);
    }
  }

  return results;
}
