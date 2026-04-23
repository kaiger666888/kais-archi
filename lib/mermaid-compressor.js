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

  // Step 8: 扁平化 — 只保留有连线的节点和边
  r = flattenToEdges(r, typeLine);

  if (r.length <= maxLen) return { code: r, compressed: true, originalLen };

  // Step 9: 截断
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

  // 只保留边和边中引用的节点定义行
  const kept = [typeLine, ''];
  for (const line of allLines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (trimmed.includes('-->')) {
      kept.push(trimmed);
    } else {
      // 检查这行是否定义了一个被引用的节点
      const nodeId = trimmed.match(/^([\w][\w.-]*)/);
      if (nodeId && nodeIds.has(nodeId[1])) {
        kept.push(trimmed);
      }
    }
  }

  return kept.join('\n');
}
