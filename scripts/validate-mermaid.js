#!/usr/bin/env node
/**
 * Mermaid 语法验证器 — 使用 mermaid-cli (mmdc) 实际渲染验证
 * 用法: node validate-mermaid.js <file.mmd> [file2.mmd ...]
 */
import { execFileSync, writeFileSync, unlinkSync, existsSync } from 'node:fs';

const PUPPETEER_CFG = '/tmp/.mermaid-puppeteer.json';
if (!existsSync(PUPPETEER_CFG)) {
  writeFileSync(PUPPETEER_CFG, '{"args":["--no-sandbox","--disable-setuid-sandbox"]}');
}

/**
 * 用 mmdc 实际渲染验证 mermaid 代码
 * @param {string} code - mermaid 代码
 * @returns {{ valid: boolean, error: string }}
 */
export function validateMermaidRender(code) {
  const tmpFile = `/tmp/mermaid-validate-${Date.now()}-${Math.random().toString(36).slice(2,6)}.mmd`;
  const svgFile = tmpFile.replace(/\.mmd$/, '.svg');
  try {
    writeFileSync(tmpFile, code);
    execFileSync('npx', [
      '@mermaid-js/mermaid-cli', '-i', tmpFile, '-o', svgFile, '-p', PUPPETEER_CFG
    ], { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'], timeout: 15000 });
    return { valid: true, error: '' };
  } catch (e) {
    const stderr = (e.stderr || e.message || '').split('\n').slice(0, 3).join(' | ');
    return { valid: false, error: stderr.slice(0, 300) };
  } finally {
    try { unlinkSync(tmpFile); } catch {}
    try { unlinkSync(svgFile); } catch {}
  }
}

// CLI
const files = process.argv.slice(2];
if (files.length === 0) {
  console.log('用法: node validate-mermaid.js <file.mmd> [file2.mmd ...]');
  process.exit(1);
}

const results = [];
for (const file of files) {
  const code = require('node:fs').readFileSync(file, 'utf-8');
  const name = file.split('/').pop();
  process.stdout.write(`  验证 ${name} ... `);
  const r = validateMermaidRender(code);
  results.push({ file: name, ...r });
  console.log(r.valid ? '✅' : `❌ ${r.error}`);
}

console.log(`\n结果: ${results.filter(r => r.valid).length}/${results.length} 通过`);
if (!results.every(r => r.valid)) process.exit(1);
