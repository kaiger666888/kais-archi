/**
 * mermaid-compressor.js — 压缩 mermaid 代码以适配 Notion 2000 字符限制
 * 
 * 策略：
 * 1. 移除 %%{init}%% 块（Notion 用默认主题）
 * 2. 缩短 subgraph 标签（只保留关键词）
 * 3. 缩短节点 ID（用短别名）
 * 4. 移除多余空行
 * 5. 如果仍超过限制，截断为简化版
 */

/**
 * 压缩 mermaid 代码到目标字符数以内
 * @param {string} code - 原始 mermaid 代码
 * @param {number} maxLen - 目标最大长度（默认 1900，留 100 缓冲）
 * @returns {{ code: string, compressed: boolean, originalLen: number }}
 */
export function compressMermaid(code, maxLen = 1900) {
  const originalLen = code.length;
  if (originalLen <= maxLen) return { code, compressed: false, originalLen };

  let result = code;

  // Step 1: 移除 %%{init}%% 块
  result = result.replace(/%%\{[\s\S]*?\}%%\n?/g, '').trim();

  // Step 2: 移除多余空行
  result = result.replace(/\n{3,}/g, '\n\n');

  // Step 3: 移除行首多余缩进（保留 2 空格）
  result = result.replace(/^( {4,})/gm, '  ');

  // Step 4: 缩短 subgraph 标签
  result = result.replace(/subgraph\s+(\w+)\s*\[([^\]]+)\]/g, (match, id, label) => {
    // 取标签前 3 个字符
    const shortLabel = label.replace(/["']/g, '').trim().slice(0, 12);
    return `subgraph ${id}["${shortLabel}"]`;
  });

  if (result.length <= maxLen) return { code: result, compressed: true, originalLen };

  // Step 5: 缩短节点标签（保留 ID 不变，只缩短显示名）
  result = result.replace(/(\w+)\["([^"]+)"\]/g, (match, id, label) => {
    if (label.length <= 20) return match;
    const shortLabel = label.slice(0, 18) + '..';
    return `${id}["${shortLabel}"]`;
  });

  if (result.length <= maxLen) return { code: result, compressed: true, originalLen };

  // Step 6: 移除边缘标签（edge labels 是最大的膨胀源）
  result = result.replace(/-->?\|[^|]+\|/g, '-->');

  if (result.length <= maxLen) return { code: result, compressed: true, originalLen };

  // Step 7: 最后手段 — 截断，只保留结构
  const lines = result.split('\n');
  const truncated = [];
  for (const line of lines) {
    truncated.push(line);
    if (truncated.join('\n').length > maxLen - 100) break;
  }
  truncated.push('  %% ... (已截断，完整版见附件)');
  return { code: truncated.join('\n'), compressed: true, originalLen, truncated: true };
}
