/**
 * kais-archi/detector.js — 结构探测
 * ES Module
 *
 * 自动扫描目标目录，提取管线阶段、子 Skill、共享库、数据流。
 */

import { readFile, readdir, stat } from 'node:fs/promises';
import { join, basename } from 'node:path';

// ─── 主入口 ──────────────────────────────────────────

export async function detectArchitecture(targetDir) {
  const [phases, skills, libraries, dataFlow, crossCutting, inputsOutputs] = await Promise.all([
    detectPipeline(targetDir),
    detectSkills(targetDir),
    detectLibraries(targetDir),
    detectDataFlow(targetDir),
    detectCrossCutting(targetDir),
    detectInputsOutputs(targetDir),
  ]);

  const title = await detectTitle(targetDir);

  return {
    title: title || basename(targetDir),
    subtitle: `${phases.length} 个阶段 · ${skills.length} 个子模块 · ${libraries.length} 个共享库`,
    phases, skills, libraries, dataFlow, crossCutting,
    inputs: inputsOutputs.inputs,
    outputs: inputsOutputs.outputs,
    targetDir,
    detectedAt: new Date().toISOString(),
  };
}

// ─── 管线探测 ────────────────────────────────────────

export async function detectPipeline(targetDir) {
  const skillMd = await readText(join(targetDir, 'SKILL.md'));
  if (!skillMd) return [];

  const phases = [];
  const seen = new Set();

  function addPhase(id, rawName, matchIndex) {
    if (seen.has(id)) return;
    seen.add(id);

    const skillMatch = rawName.match(/[（(](.+?)[)）]/);
    const skill = skillMatch ? skillMatch[1] : null;
    const name = skillMatch ? rawName.replace(/[（(].+?[)）]/, '').trim() : rawName;

    const lineEnd = skillMd.slice(matchIndex).split('\n')[0];
    const hasGit = lineEnd.includes('git checkpoint') || lineEnd.includes('📌');

    const descLine = skillMd.slice(matchIndex).split('\n')[1] || '';
    const tags = extractTags(descLine);

    const blockEnd = skillMd.indexOf('\n###', matchIndex + 1);
    const blockText = skillMd.slice(matchIndex, blockEnd > 0 ? blockEnd : matchIndex + 500);
    const ioAnnot = extractIOAnnotation(blockText);

    const nextLines = skillMd.slice(matchIndex).slice(0, 300);
    const hasFailCheck = /FAIL|回滚|rollback|审核/.test(nextLines);

    phases.push({ id, name, description: descLine.trim().slice(0, 80), ioAnnot, skill, hasGit, hasFailCheck, tags, isSubPhase: /\./.test(id) });
  }

  let match;

  // Phase X: format
  const phaseRegex = /Phase\s+([\d.]+)\s*[:：]\s*(.+?)(?:\s{2,}|$|\n)/g;
  while ((match = phaseRegex.exec(skillMd)) !== null) {
    addPhase(`Phase ${match[1]}`, match[2].trim(), match.index);
  }

  // Step/步骤 format
  if (phases.length === 0) {
    const stepRegex = /###\s+(?:Step|步骤)\s+(\d+)\s*[.、:：]\s*(.+?)(?:\n|$)/gm;
    for (const m of skillMd.matchAll(stepRegex)) {
      addPhase(`Step ${m[1]}`, m[2].trim(), m.index);
    }
  }

  // Stage/阶段 format
  if (phases.length === 0) {
    const stageRegex = /^##\s+(?:阶段|Stage)\s*(\d+)\s*[:：]?\s*(.+)$/gm;
    while ((match = stageRegex.exec(skillMd)) !== null) {
      addPhase(`Stage ${match[1]}`, match[2].trim(), match.index);
    }
  }

  return phases;
}

// ─── 子 Skill 探测 ────────────────────────────────────

export async function detectSkills(targetDir) {
  const skillsDir = join(targetDir, 'skills');
  const entries = await safeReaddir(skillsDir);
  const results = [];

  for (const entry of entries) {
    const skillPath = join(skillsDir, entry);
    const s = await stat(skillPath);
    if (!s.isDirectory()) continue;

    const skillMd = await readText(join(skillPath, 'SKILL.md'));
    const triggers = [];
    const triggerMatch = skillMd?.match(/触发词\s*\n([\s\S]*?)(?:\n##|\n#|$)/);
    if (triggerMatch) triggerMatch[1].match(/`([^`]+)`/g)?.forEach(t => triggers.push(t.replace(/`/g, '')));

    const descMatch = skillMd?.match(/^#\s+.+\n+(.+)/m);
    const libFiles = await safeReaddir(join(skillPath, 'lib')).catch(() => []);

    results.push({
      name: entry,
      triggers: triggers.slice(0, 5),
      description: descMatch?.[1]?.trim()?.slice(0, 100) || '',
      hasLib: libFiles.length > 0,
      libFiles: libFiles.filter(f => f.endsWith('.js') || f.endsWith('.py')),
    });
  }

  return results;
}

// ─── 共享库探测 ──────────────────────────────────────

export async function detectLibraries(targetDir) {
  const libDir = join(targetDir, 'lib');
  const entries = await safeReaddir(libDir).catch(() => []);
  const results = [];

  for (const entry of entries) {
    const filePath = join(libDir, entry);
    const s = await stat(filePath);
    if (s.isDirectory() || !/\.(js|py|sh)$/.test(entry)) continue;

    const content = await readText(filePath);
    if (!content) continue;

    const exports = [];
    const exportRegex = /export\s+(?:async\s+)?function\s+(\w+)/g;
    let match;
    while ((match = exportRegex.exec(content)) !== null) exports.push(match[1]);
    const namedExports = content.match(/export\s+\{([^}]+)\}/);
    if (namedExports) namedExports[1].split(',').forEach(e => {
      const name = e.trim().split(/\s+as\s+/).pop().trim();
      if (name) exports.push(name);
    });

    results.push({ name: entry, exports: [...new Set(exports)].slice(0, 10), size: content.length });
  }

  return results;
}

// ─── 数据流探测 ──────────────────────────────────────

export async function detectDataFlow(targetDir) {
  const skillMd = await readText(join(targetDir, 'SKILL.md'));
  if (!skillMd) return [];

  const flows = [];
  const codeBlocks = skillMd.match(/```[\s\S]*?```/g) || [];
  const tables = skillMd.match(/^\|.+\|$/gm) || [];
  const searchable = [...codeBlocks, ...tables].join('\n');

  const flowRegex = /(.+?)\s*[→─]+\s*(.+)/g;
  let match;
  while ((match = flowRegex.exec(searchable)) !== null) {
    const from = match[1].trim().replace(/^[|\s`]+/, '');
    const to = match[2].trim().replace(/[\s`|]+$/, '');
    if (from.length < 2 || to.length < 2 || from.startsWith('#') || from.startsWith('|')) continue;
    const hasArtifact = /\.(json|js|py|md|png|mp4|html|css|yaml|yml|sh|txt|csv)/i.test(from + to);
    const hasKeyword = /产出|输出|生成|导出|输入|读取|写入|保存|加载/i.test(from + to);
    if (!hasArtifact && !hasKeyword) continue;
    const key = `${from}→${to}`;
    if (!flows.find(f => `${f.from}→${f.to}` === key)) flows.push({ from, to });
  }

  return flows.slice(0, 20);
}

// ─── 横切能力探测 ────────────────────────────────────

export async function detectCrossCutting(targetDir) {
  const skillMd = await readText(join(targetDir, 'SKILL.md'));
  if (!skillMd) return [];

  const crossCutting = [];
  const sectionRegex = /^##\s+(.+)$/gm;
  const sections = [];
  let match;
  while ((match = sectionRegex.exec(skillMd)) !== null) sections.push({ title: match[1], start: match.index });

  for (let i = 0; i < sections.length; i++) {
    const section = sections[i];
    const content = skillMd.slice(section.start, sections[i + 1]?.start || skillMd.length);
    if (/管线流程|Phase|Git 版本|子 Skill|共享工具|环境变量|关键参数|成本对比|线稿控制/.test(section.title)) continue;

    const phaseRefs = content.match(/Phase\s+[\d.]+/g) || [];
    if (phaseRefs.length >= 2 || /贯穿|横切|全管线|每个\s*Phase|所有/i.test(content)) {
      const icon = guessIcon(section.title);
      const desc = content.split('\n').find(l => l.trim() && !l.startsWith('#') && !l.startsWith('|') && !l.startsWith('-'))?.trim() || '';
      crossCutting.push({ name: section.title, icon, description: desc.slice(0, 80), phaseRefs: [...new Set(phaseRefs)] });
    }
  }

  return crossCutting;
}

// ─── I/O 标注提取 ────────────────────────────────────

function extractIOAnnotation(text) {
  if (!text) return '';
  const parts = [];
  const inputMatch = text.match(/(?:读取|接收|输入|加载|获取|解析)\s*[：:]?\s*(.+)/i);
  if (inputMatch) {
    const inp = inputMatch[1].replace(/[的其每个`]+/g, '').replace(/\s+(和|或|与)\s+/g, '/').trim().slice(0, 30);
    if (inp) parts.push(`📥${inp}`);
  }
  const outputMatch = text.match(/(?:返回|输出|产出|生成|导出|保存|写入)\s*[：:]?\s*(.+)/i);
  if (outputMatch) {
    const out = outputMatch[1].replace(/[的其每个`]+/g, '').trim().slice(0, 30);
    if (out) parts.push(`📤${out}`);
  }
  if (parts.length === 0) {
    const callMatch = text.match(/(?:调用|使用|执行)\s*[`'"]?(\w+)[`'"]?/);
    if (callMatch) parts.push(`⚙️${callMatch[1]}`);
  }
  return parts.join(' ');
}

function extractTags(text) {
  const tags = [];
  (text.match(/`([^`]+)`/g) || []).forEach(t => { const tag = t.replace(/`/g, ''); if (tag.length < 30) tags.push(tag); });
  (text.match(/[（(]([^)）]+)[)）]/g) || []).forEach(t => { const tag = t.replace(/[（()）]/g, ''); if (tag.length < 30) tags.push(tag); });
  return tags.slice(0, 5);
}

function guessIcon(text) {
  const map = [[/git|版本|checkpoint/i, '📌'], [/guard|守卫|防御|修复/i, '🔴'], [/锚定|anchor|四维/i, '🟡'], [/拍摄|cinema|coverage/i, '🎬'], [/延长|chain|extension/i, '🔗'], [/成本|cost|积分/i, '💰'], [/音频|audio|tts/i, '🎵'], [/光线|light/i, '💡']];
  for (const [regex, icon] of map) if (regex.test(text)) return icon;
  return '⚡';
}

async function detectTitle(targetDir) {
  const skillMd = await readText(join(targetDir, 'SKILL.md'));
  if (!skillMd) return null;
  const match = skillMd.match(/^#\s+(.+)/);
  return match?.[1]?.replace(/[—\-–].+$/, '').trim() || null;
}

async function detectInputsOutputs(targetDir) {
  const skillMd = await readText(join(targetDir, 'SKILL.md'));
  if (!skillMd) return { inputs: [], outputs: [] };
  const inputs = [], outputs = [];
  let kwMatch;
  const inRegex = /(?:输入|Input|接收|读取)\s*[：:]\s*(.+)/gi;
  while ((kwMatch = inRegex.exec(skillMd)) !== null) { const d = kwMatch[1].trim().slice(0, 50); if (d && !inputs.find(i => i.type === d)) inputs.push({ type: d }); }
  const outRegex = /(?:输出|Output|返回|产出|生成|导出)\s*[：:]\s*(.+)/gi;
  while ((kwMatch = outRegex.exec(skillMd)) !== null) { const d = kwMatch[1].trim().slice(0, 50); if (d && !outputs.find(o => o.type === d)) outputs.push({ type: d }); }
  return { inputs, outputs };
}

// ─── Pipeline IO 探测（从 lib/pipeline.js）──────────

/**
 * 从 lib/pipeline.js 提取精确的 Phase 定义（outputFiles, review 等）
 */
export async function detectPipelineIO(targetDir) {
  const pipelinePath = join(targetDir, 'lib', 'pipeline.js');
  const content = await readText(pipelinePath);
  if (!content) return [];

  const phases = [];
  const phaseRegex = /\{[^}]*id:\s*'([^']+)'[^}]*name:\s*'([^']+)'[^}]*outputFiles:\s*\[([^\]]*)\][^}]*?(review:\s*(\{[^}]*\})[^}]*)?/g;
  let match;
  while ((match = phaseRegex.exec(content)) !== null) {
    const outputFiles = match[3].match(/'([^']+)'/g)?.map(s => s.replace(/'/g, '')) || [];
    const reviewStr = match[4] || '';
    const hasReview = reviewStr !== '';
    const reviewMode = hasReview ? (reviewStr.includes('single') ? 'single' : 'multi') : null;
    const hasScoring = reviewStr.includes('enableScoring');
    phases.push({ id: match[1], name: match[2], outputFiles, hasReview, reviewMode, hasScoring });
  }
  return phases;
}

// ─── 内部工具 ────────────────────────────────────────

async function readText(path) {
  try { return await readFile(path, 'utf-8'); } catch { return null; }
}

async function safeReaddir(path) {
  try { return await readdir(path); } catch { return []; }
}
