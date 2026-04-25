/**
 * kais-archi/index.js — 管线架构图入口
 * ES Module
 */

import fs from 'node:fs';
import path from 'node:path';

export { detectArchitecture, detectPipeline, detectSkills, detectLibraries, detectDataFlow, detectCrossCutting, detectPipelineIO } from './detector.js';
export { render } from './renderer.js';
export { writeToNotion, writeAllToNotion } from './notion-writer.js';
export { toMermaid } from './mermaid-renderer.js';

/**
 * 生成管线架构图 HTML
 * @param {string} targetDir - 目标项目目录
 * @param {{ style?: string }} options
 * @returns {Promise<string>} 完整 HTML 字符串
 */
export async function generate(targetDir, options = {}) {
  const model = await (await import('./detector.js')).detectArchitecture(targetDir);
  const pipelineIO = await (await import('./detector.js')).detectPipelineIO(targetDir);
  return (await import('./renderer.js')).render(model, pipelineIO, { style: options.style || 'dark' });
}
