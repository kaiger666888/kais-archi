/**
 * mermaid-compressor.js — 压缩/拆分 mermaid 代码以适配 Notion 2000 字符限制
 * 
 * 策略：
 * 1. 轻度压缩：移除 init 块、多余空行、缩进
 * 2. 中度压缩：移除 edge labels、end 关键字
 * 3. 重度压缩：去重 ID=label、简化 subgraph 标签
 * 4. 拆分模式：按 subgraph 拆成多个小图
 * 5. 最后手段：截断
 */

export function compressMermaid(code, maxLen = 1900) {
  const originalLen = code.length;
  if (originalLen <= maxLen) return { code, compressed: false, originalLen };

  // 提取图表类型行
  const lines = code.split('\n');
  const typeMatch = lines.find(l => l.trim().match(/^(graph|flowchart|sequenceDiagram)/));
  const typeLine = typeMatch ? typeMatch.trim() : 'graph TD';

  let r = code;

  // Step 1: 移除 %%{init}%% 块
  r = r.replace(/%%\{[\s\S]*?\}%%\n?/g, '').trim();
  // Step 2: 移除多余空行
  r = r.replace(/\n{3,}/g, '\n\n');
  // Step 3: 移除行首缩进
  r = r.replace(/^( {2,})/gm, '');

  if (r.length <= maxLen) return { code: r, compressed: true, originalLen };

  // Step 4: 移除 edge labels
  r = r.replace(/-->?\|[^|]+\|/g, '-->');

  if (r.length <= maxLen) return { code: r, compressed: true, originalLen };

  // Step 5: 移除 end 关键字
  r = r.replace(/^\s*end\s*$/gm, '');

  if (r.length <= maxLen) return { code: r, compressed: true, originalLen };

  // Step 6: 去重 ID=label
  r = r.replace(/^([\w.-]+)\(["']\1["']\)$/gm, '$1');
  r = r.replace(/^([\w.-]+)\["']\1["']\]$/gm, '$1');

  if (r.length <= maxLen) return { code: r, compressed: true, originalLen };

  // Step 7: 简化 subgraph 标签
  r = r.replace(/subgraph\s+(\S+)\s*\[["']([^"']+)["']\]/g, (m, id, label) => {
    const short = label.split(/[-\s_]/).map(w => w[0]).join('').slice(0, 4);
    return `subgraph ${id}["${short}"]`;
  });
  r = r.replace(/subgraph\s+(\S+)\s*\(["']([^"']+)["']\)/g, (m, id, label) => {
    const short = label.split(/[-\s_]/).map(w => w[0]).join('').slice(0, 4);
    return `subgraph ${id}("${short}")`;
  });

  if (r.length <= maxLen) return { code: r, compressed: true, originalLen };

  // Step 8: 拆分为多个子图
  const parts = splitBySubgraph(r, typeLine, maxLen);
  if (parts.length > 1) {
    return { code: parts[0], compressed: true, originalLen, split: true, parts };
  }

  // Step 9: 最后手段 — 截断
  const truncated = [];
  for (const line of r.split('\n')) {
    truncated.push(line);
    if (truncated.join('\n').length > maxLen - 60) break;
  }
  truncated.push('  %% ... 已截断');
  return { code: truncated.join('\n'), compressed: true, originalLen, truncated: true };
}

/**
 * 按 subgraph 拆分（不依赖 end 关键字）
 * 策略：遇到新的 subgraph 关键字就开始新的 part
 */
function splitBySubgraph(code, typeLine, maxLen) {
  const lines = code.split('\n');
  
  // 找出所有 subgraph 的起始行号
  const subgraphStarts = [];
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].match(/^subgraph\s/)) {
      subgraphStarts.push(i);
    }
  }

  if (subgraphStarts.length === 0) return [code];

  // 收集每个 subgraph 块的内容（到下一个 subgraph 之前）
  const blocks = [];
  for (let i = 0; i < subgraphStarts.length; i++) {
    const start = subgraphStarts[i];
    const end = (i + 1 < subgraphStarts.length) ? subgraphStarts[i + 1] : lines.length;
    blocks.push(lines.slice(start, end).join('\n'));
  }

  // 合并 blocks 使每个 part ≤ maxLen
  const parts = [];
  let buffer = '';
  for (const block of blocks) {
    if (!buffer) {
      buffer = typeLine + '\n' + block;
    } else if ((buffer + '\n' + block).length <= maxLen) {
      buffer += '\n' + block;
    } else {
      parts.push(buffer);
      buffer = typeLine + '\n' + block;
    }
  }
  if (buffer) parts.push(buffer);

  return parts;
}
