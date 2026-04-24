/**
 * mermaid-compressor.js — 压缩 mermaid 代码以适配 Notion 2000 字符限制
 */

export function compressMermaid(code, maxLen = 1900) {
  const originalLen = code.length;
  if (originalLen <= maxLen) return { code, compressed: false, originalLen };

  const typeMatch = code.match(/^(graph|flowchart|sequenceDiagram)\s+\w+/m);
  const typeLine = typeMatch ? typeMatch[0] : 'graph TD';

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

  // Step 5: 确保 subgraph 有 end
  r = ensureSubgraphEnds(r);

  if (r.length <= maxLen) return { code: r, compressed: true, originalLen };

  // Step 6: 去重 ID=label
  r = r.replace(/^([\w.-]+)\(["']\1["']\)$/gm, '$1');
  r = r.replace(/^([\w.-]+)\["']\1["']\]$/gm, '$1');

  if (r.length <= maxLen) return { code: r, compressed: true, originalLen };

  // Step 7: 简化 subgraph 标签
  r = r.replace(/subgraph\s+(\S+)\s*\[["']([^"']+)["']\]/g, (m, id, label) => {
    return `subgraph ${id}["${abbreviate(label)}"]`;
  });
  r = r.replace(/subgraph\s+(\S+)\s*\(["']([^"']+)["']\)/g, (m, id, label) => {
    return `subgraph ${id}("${abbreviate(label)}")`;
  });

  if (r.length <= maxLen) return { code: r, compressed: true, originalLen };

  // Step 7.5: 先尝试按 subgraph 拆分（保留完整结构）
  const parts = splitBySubgraph(r, typeLine, maxLen);
  if (parts.length > 1) return { parts, split: true, compressed: true, originalLen };

  // Step 8: 扁平化 — 只保留有连线的节点和边（最后的手段）
  r = flattenToEdges(r, typeLine);

  if (r.length <= maxLen) return { code: r, compressed: true, originalLen };

  // Step 8.5: 扁平化后再拆分（此时没有 subgraph 结构）
  const flatParts = splitBySubgraph(r, typeLine, maxLen);
  if (flatParts.length > 1) return { parts: flatParts, split: true, compressed: true, originalLen };

  // Step 9: 截断（绝对最后的手段）
  const out = [];
  for (const line of r.split('\n')) {
    out.push(line);
    if (out.join('\n').length > maxLen - 60) break;
  }
  out.push('  %% ... 已截断');
  return { code: out.join('\n'), compressed: true, originalLen, truncated: true };
}

function abbreviate(label) {
  return label.split(/[-\s_]/).map(w => w[0]).join('').slice(0, 4);
}

function ensureSubgraphEnds(code) {
  const srcLines = code.split('\n');
  const result = [];
  for (const line of srcLines) {
    if (line.match(/^subgraph\s/) && result.length > 0) {
      const prev = result[result.length - 1]?.trim();
      if (prev && prev !== 'end') result.push('end');
    }
    result.push(line);
  }
  const last = result[result.length - 1]?.trim();
  if (last && last !== 'end') result.push('end');
  return result.join('\n');
}

/**
 * 扁平化：移除 subgraph 结构，只保留有边连接的节点
 * 对于 call-graph 等大图特别有效
 */
function flattenToEdges(code, typeLine) {
  const allLines = code.split('\n');
  const edgeLines = allLines.filter(l => l.includes('-->'));

  if (edgeLines.length === 0) return code;

  // 提取边中涉及的所有节点 ID
  const nodeIds = new Set();
  for (const line of edgeLines) {
    const nodes = line.match(/([\w][\w.-]*)/g);
    if (nodes) nodes.forEach(n => nodeIds.add(n));
  }

  // 只保留边、style/linkStyle 和边中引用的节点定义行
  const kept = [typeLine, ''];
  for (const line of allLines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    // 保留样式行
    if (trimmed.startsWith('style ') || trimmed.startsWith('linkStyle ')) {
      kept.push(trimmed);
      continue;
    }
    if (trimmed.includes('-->')) {
      kept.push(trimmed);
    } else {
      const nodeId = trimmed.match(/^([\w][\w.-]*)/);
      if (nodeId && nodeIds.has(nodeId[1])) {
        kept.push(trimmed);
      }
    }
  }

  return kept.join('\n');
}

/**
 * 按 subgraph 拆分代码，每部分不超过 maxLen
 * 用于 layer-map 等无边、无边的图
 */
function splitBySubgraph(code, typeLine, maxLen) {
  const lines = code.split('\n');
  
  // 收集所有 subgraph 块（从 subgraph 到 end）
  const blocks = [];
  let currentBlock = null;
  
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('subgraph ')) {
      currentBlock = [line];
    } else if (currentBlock) {
      currentBlock.push(line);
      if (trimmed === 'end') {
        blocks.push(currentBlock.join('\n'));
        currentBlock = null;
      }
    }
  }
  
  // 按 maxLen 分组 blocks
  const parts = [];
  let currentPart = typeLine + '\n';
  
  for (const block of blocks) {
    if (currentPart.length + block.length + 2 > maxLen && currentPart.length > typeLine.length + 2) {
      parts.push(currentPart.trimEnd());
      currentPart = typeLine + '\n';
    }
    currentPart += block + '\n';
  }
  if (currentPart.trim().length > typeLine.length) {
    parts.push(currentPart.trimEnd());
  }
  
  return parts.filter(p => p.trim().length > 0);
}
