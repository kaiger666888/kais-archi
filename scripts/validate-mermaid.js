#!/usr/bin/env node
/**
 * Mermaid 语法验证器 — 使用 mermaid-cli (mmdc) 实际渲染验证
 * 用法: node validate-mermaid.js <file.mmd> [file2.mmd ...]
 */
import { execFileSync } from 'node:child_process';
import { writeFileSync, unlinkSync, existsSync } from 'node:fs';

const PUPPETEER_CFG = '/tmp/.mermaid-puppeteer.json';

// 确保配置文件存在
if (!existsSync(PUPPETEER_CFG)) {
  writeFileSync(PUPPETEER_CFG, '{"args":["--no-sandbox","--disable-setuid-sandbox"]}');
}

function validateOne(mmdFile) {
  const svgFile = `/tmp/mermaid-validate-${Date.now()}-${Math.random().toString(36).slice(2,6)}.svg`;
  try {
    execFileSync('npx', [
      '@mermaid-js/mermaid-cli', '-i', mmdFile, '-o', svgFile, '-p', PUPPETEER_CFG
    ], { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'], timeout: 15000 });
    try { unlinkSync(svgFile); } catch {}
    return { valid: true, error: '' };
  } catch (e) {
    try { unlinkSync(svgFile); } catch {}
    const stderr = (e.stderr || e.message || '').split('\n')[0];
    return { valid: false, error: stderr.slice(0, 200) };
  }
}

const files = process.argv.slice(2);
if (files.length === 0) {
  console.log('用法: node validate-mermaid.js <file.mmd> [file2.mmd ...]');
  process.exit(1);
}

const results = [];
for (const file of files) {
  const name = file.split('/').pop();
  process.stdout.write(`  验证 ${name} ... `);
  const r = validateOne(file);
  results.push({ file: name, ...r });
  console.log(r.valid ? '✅' : `❌ ${r.error}`);
}

console.log(`\n结果: ${results.filter(r => r.valid).length}/${results.length} 通过`);
if (!results.every(r => r.valid)) process.exit(1);
