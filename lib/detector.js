/**
 * kais-archi/detector.js — 结构探测
 * ES Module
 *
 * 自动扫描目标目录，提取管线阶段、子 Skill、共享库、数据流。
 */

import { readFile, readdir, stat } from 'node:fs/promises';
import { join, basename, dirname } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

// ─── 主入口 ──────────────────────────────────────────

/**
 * 探测目标项目的完整架构
 * @param {string} targetDir - 项目根目录
 * @returns {Promise<object>} 架构模型
 */
export async function detectArchitecture(targetDir) {
  const [phases, skills, libraries, dataFlow, crossCutting, inputsOutputs] = await Promise.all([
    detectPipeline(targetDir),
    detectSkills(targetDir),
    detectLibraries(targetDir),
    detectDataFlow(targetDir),
    detectCrossCutting(targetDir),
    detectInputsOutputs(targetDir),
  ]);

  // 从 SKILL.md 提取标题
  const title = await detectTitle(targetDir);

  return {
    title: title || basename(targetDir),
    subtitle: `${phases.length} 个阶段 · ${skills.length} 个子模块 · ${libraries.length} 个共享库`,
    phases,
    skills,
    libraries,
    dataFlow,
    crossCutting,
    inputs: inputsOutputs.inputs,
    outputs: inputsOutputs.outputs,
    targetDir,
    detectedAt: new Date().toISOString(),
  };
}

// ─── 管线探测 ────────────────────────────────────────

/**
 * 从 SKILL.md 提取管线阶段
 * 支持多种格式：
 *   - Phase X: ... / Phase X.Y: ...
 *   - ### Step X: ... / ### 步骤 X: ...
 *   - ## 阶段 N: ... / ## Stage N: ...
 *   - 1. ... / 2. ... （有序列表，至少 2 项）
 */
export async function detectPipeline(targetDir) {
  const skillMd = await readText(join(targetDir, 'SKILL.md'));
  if (!skillMd) return [];

  const phases = [];

  // 格式1: Phase X: ... 或 Phase X.Y: ...
  const phaseRegex = /Phase\s+([\d.]+)\s*[:：]\s*(.+?)(?:\s{2,}|$|\n)/g;
  // 格式2: Step X / 步骤 X
  const stepRegex = /(?:###\s+(?:Step|步骤)\s+)?(\d+)\s*[.、:：]\s*(.+?)(?:\n|$)/gm;
  // 格式3: ## 阶段 N / ## Stage N
  const stageRegex = /^##\s+(?:阶段|Stage)\s*(\d+)\s*[:：]?\s*(.+)$/gm;

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

    const nextLines = skillMd.slice(matchIndex).slice(0, 300);
    const hasFailCheck = /FAIL|回滚|rollback|审核/.test(nextLines);

    phases.push({
      id,
      name,
      skill,
      hasGit,
      hasFailCheck,
      tags,
      isSubPhase: /\./.test(id),
    });
  }

  let match;

  // 优先匹配 Phase 格式
  while ((match = phaseRegex.exec(skillMd)) !== null) {
    addPhase(`Phase ${match[1]}`, match[2].trim(), match.index);
  }

  // 如果 Phase 格式没有结果，尝试 Step/步骤 格式
  if (phases.length === 0) {
    const stepMatches = [...skillMd.matchAll(stepRegex)];
    if (stepMatches.length >= 2) {
      for (const m of stepMatches) {
        addPhase(`Step ${m[1]}`, m[2].trim(), m.index);
      }
    }
  }

  // 如果仍无结果，尝试 阶段/Stage 格式
  if (phases.length === 0) {
    while ((match = stageRegex.exec(skillMd)) !== null) {
      addPhase(`Stage ${match[1]}`, match[2].trim(), match.index);
    }
  }

  return phases;
}

// ─── 子 Skill 探测 ────────────────────────────────────

/**
 * 扫描 skills/ 子目录
 */
export async function detectSkills(targetDir) {
  const skillsDir = join(targetDir, 'skills');
  const entries = await safeReaddir(skillsDir);

  const results = [];
  for (const entry of entries) {
    const skillPath = join(skillsDir, entry);
    const s = await stat(skillPath);
    if (!s.isDirectory()) continue;

    const skillMd = await readText(join(skillPath, 'SKILL.md'));
    const name = entry;

    // 提取触发词
    const triggers = [];
    const triggerMatch = skillMd?.match(/触发词\s*\n([\s\S]*?)(?:\n##|\n#|$)/);
    if (triggerMatch) {
      triggerMatch[1].match(/`([^`]+)`/g)?.forEach(t => triggers.push(t.replace(/`/g, '')));
    }

    // 提取功能描述（第一段）
    const descMatch = skillMd?.match(/^#\s+.+\n+(.+)/m);
    const description = descMatch?.[1]?.trim() || '';

    // 检查 lib/ 子目录
    const libFiles = await safeReaddir(join(skillPath, 'lib')).catch(() => []);

    results.push({
      name,
      triggers: triggers.slice(0, 5),
      description: description.slice(0, 100),
      hasLib: libFiles.length > 0,
      libFiles: libFiles.filter(f => f.endsWith('.js') || f.endsWith('.py')),
    });
  }

  return results;
}

// ─── 共享库探测 ──────────────────────────────────────

/**
 * 扫描 lib/ 目录
 */
export async function detectLibraries(targetDir) {
  const libDir = join(targetDir, 'lib');
  const entries = await safeReaddir(libDir).catch(() => []);

  const results = [];
  for (const entry of entries) {
    const filePath = join(libDir, entry);
    const s = await stat(filePath);
    if (s.isDirectory()) continue;
    if (!entry.endsWith('.js') && !entry.endsWith('.py') && !entry.endsWith('.sh')) continue;

    const content = await readText(filePath);
    if (!content) continue;

    // 提取导出函数
    const exports = [];
    const exportRegex = /export\s+(?:async\s+)?function\s+(\w+)/g;
    let match;
    while ((match = exportRegex.exec(content)) !== null) {
      exports.push(match[1]);
    }
    // 也匹配 export { ... }
    const namedExports = content.match(/export\s+\{([^}]+)\}/);
    if (namedExports) {
      namedExports[1].split(',').forEach(e => {
        const name = e.trim().split(/\s+as\s+/).pop().trim();
        if (name) exports.push(name);
      });
    }

    results.push({
      name: entry,
      exports: [...new Set(exports)].slice(0, 10),
      size: content.length,
    });
  }

  return results;
}

// ─── 数据流探测 ──────────────────────────────────────

/**
 * 从代码中推断数据流
 */
export async function detectDataFlow(targetDir) {
  const skillMd = await readText(join(targetDir, 'SKILL.md'));
  if (!skillMd) return [];

  const flows = [];

  // 匹配 "→ xxx" 或 "→xxx" 的数据流描述（仅在代码块或表格中）
  const codeBlocks = skillMd.match(/```[\s\S]*?```/g) || [];
  const tables = skillMd.match(/^\|.+\|$/gm) || [];
  const searchable = [...codeBlocks, ...tables].join('\n');

  const flowRegex = /(.+?)\s*[→─]+\s*(.+)/g;
  let match;

  while ((match = flowRegex.exec(searchable)) !== null) {
    const from = match[1].trim().replace(/^[|\s`]+/, '');
    const to = match[2].trim().replace(/[\s`|]+$/, '');

    // 过滤噪音：只保留包含文件扩展名或特定关键词的
    if (from.length < 2 || to.length < 2) continue;
    if (from.startsWith('#') || from.startsWith('|') || from.startsWith('-')) continue;
    const hasArtifact = /\.(json|js|py|md|png|mp4|html|css|yaml|yml|sh|txt|csv)/i.test(from + to);
    const hasKeyword = /产出|输出|生成|导出|输入|读取|写入|保存|加载/i.test(from + to);
    if (!hasArtifact && !hasKeyword) continue;

    // 去重
    const key = `${from}→${to}`;
    if (!flows.find(f => `${f.from}→${f.to}` === key)) {
      flows.push({ from, to });
    }
  }

  return flows.slice(0, 20);
}

// ─── 横切能力探测 ────────────────────────────────────

/**
 * 识别贯穿多阶段的横切能力
 */
export async function detectCrossCutting(targetDir) {
  const skillMd = await readText(join(targetDir, 'SKILL.md'));
  if (!skillMd) return [];

  const crossCutting = [];

  // 匹配独立章节（非 Phase 的 ## 标题）
  const sectionRegex = /^##\s+(.+)$/gm;
  const sections = [];
  let match;
  while ((match = sectionRegex.exec(skillMd)) !== null) {
    sections.push({ title: match[1], start: match.index });
  }

  for (let i = 0; i < sections.length; i++) {
    const section = sections[i];
    const content = skillMd.slice(section.start, sections[i + 1]?.start || skillMd.length);

    // 跳过管线相关章节
    if (/管线流程|Phase|Git 版本|子 Skill|共享工具|环境变量|关键参数|成本对比|线稿控制/.test(section.title)) continue;

    // 检查是否引用了多个 Phase
    const phaseRefs = content.match(/Phase\s+[\d.]+/g) || [];
    if (phaseRefs.length >= 2 || /贯穿|横切|全管线|每个\s*Phase|所有/i.test(content)) {
      const icon = guessIcon(section.title);
      const desc = content.split('\n').find(l => l.trim() && !l.startsWith('#') && !l.startsWith('|') && !l.startsWith('-'))?.trim() || '';
      crossCutting.push({
        name: section.title,
        icon,
        description: desc.slice(0, 80),
        phaseRefs: [...new Set(phaseRefs)],
      });
    }
  }

  // 检查独立的子 Skill（非 Phase 绑定的）
  const skills = await detectSkills(targetDir);
  for (const skill of skills) {
    if (!skill.description) continue;
    const inPhase = await isPhaseBound(targetDir, skill.name);
    if (!inPhase && skill.hasLib) {
      const existing = crossCutting.find(c => c.name.toLowerCase().includes(skill.name.replace('kais-', '')));
      if (!existing) {
        crossCutting.push({
          name: skill.name,
          icon: guessIcon(skill.description),
          description: skill.description,
          phaseRefs: [],
        });
      }
    }
  }

  return crossCutting;
}

// ─── 辅助函数 ────────────────────────────────────────

async function readText(path) {
  try {
    return await readFile(path, 'utf-8');
  } catch {
    return null;
  }
}

async function safeReaddir(path) {
  try {
    return await readdir(path);
  } catch {
    return [];
  }
}

function extractTags(text) {
  const tags = [];
  // 匹配反引号标签
  (text.match(/`([^`]+)`/g) || []).forEach(t => {
    const tag = t.replace(/`/g, '');
    if (tag.length < 30) tags.push(tag);
  });
  // 匹配括号标签
  (text.match(/[（(]([^)）]+)[)）]/g) || []).forEach(t => {
    const tag = t.replace(/[（()）]/g, '');
    if (tag.length < 30) tags.push(tag);
  });
  return tags.slice(0, 5);
}

function guessIcon(text) {
  const iconMap = [
    [/git|版本|checkpoint/i, '📌'],
    [/guard|守卫|防御|修复/i, '🔴'],
    [/锚定|anchor|四维/i, '🟡'],
    [/拍摄|cinema|coverage/i, '🎬'],
    [/延长|chain|extension/i, '🔗'],
    [/成本|cost|积分/i, '💰'],
    [/音频|audio|tts/i, '🎵'],
    [/光线|light/i, '💡'],
  ];
  for (const [regex, icon] of iconMap) {
    if (regex.test(text)) return icon;
  }
  return '⚡';
}

async function detectTitle(targetDir) {
  const skillMd = await readText(join(targetDir, 'SKILL.md'));
  if (!skillMd) return null;
  const match = skillMd.match(/^#\s+(.+)/);
  return match?.[1]?.replace(/[—\-–].+$/, '').trim() || null;
}

async function isPhaseBound(targetDir, skillName) {
  const skillMd = await readText(join(targetDir, 'SKILL.md'));
  if (!skillMd) return false;
  return new RegExp(`Phase[\\s\\d].*${skillName}`, 'i').test(skillMd);
}

// ─── 输入输出探测 ─────────────────────────────────────

/**
 * 从 SKILL.md 提取输入输出类型
 * 匹配模式：
 *   - "X → [Type] → kais-xxx → [Type] → Y" （架构定位代码块）
 *   - "输入：xxx" / "Output: xxx"
 *   - "接收 Xxx" / "返回 Xxx" / "产出 Xxx"
 */
export async function detectInputsOutputs(targetDir) {
  const skillMd = await readText(join(targetDir, 'SKILL.md'));
  if (!skillMd) return { inputs: [], outputs: [] };

  const inputs = [];
  const outputs = [];
  const projectName = basename(targetDir);

  // 模式1：架构定位代码块中的 → [Type] → 流
  const codeBlocks = skillMd.match(/```[\s\S]*?```/g) || [];
  for (const block of codeBlocks) {
    // 匹配 ... → [Type] → projectName → [Type] → ...
    const ioRegex = new RegExp(`(\\S+)\\s*→\\s*\\[([^\\]]+)\\]\\s*→\\s*${projectName}(?:\\b|$)`, 'i');
    const match = block.match(ioRegex);
    if (match) {
      const src = match[1].replace(/^\[|\]$/g, '').trim();
      const type = match[2].trim();
      if (!inputs.find(i => i.type === type)) {
        inputs.push({ source: src, type });
      }
    }
    // 匹配 ... → projectName → [Type] → ...（支持嵌套括号如 VideoClip[]）
    const outLine = block.split('\n').find(l => l.includes(projectName) && l.includes('→'));
    if (outLine) {
      const afterName = outLine.split(projectName).slice(1).join('');
      const bracketMatch = afterName.match(/→\s*\[(.+?)\]\s*→\s*(\S+)/);
      if (bracketMatch) {
        const type = bracketMatch[1].trim();
        const target = bracketMatch[2].replace(/^\[|\]$/g, '').trim();
        if (!outputs.find(o => o.type === type)) {
          outputs.push({ target, type });
        }
      }
    }
  }

  // 模式2：文本中的 "输入/输出" 关键词
  const ioKeywordRegex = /(?:输入|Input|接收|读取)\s*[：:]\s*(.+)/gi;
  let kwMatch;
  while ((kwMatch = ioKeywordRegex.exec(skillMd)) !== null) {
    const desc = kwMatch[1].trim().slice(0, 50);
    if (desc && !inputs.find(i => i.type === desc)) {
      inputs.push({ type: desc });
    }
  }
  const outKeywordRegex = /(?:输出|Output|返回|产出|生成|导出)\s*[：:]\s*(.+)/gi;
  while ((kwMatch = outKeywordRegex.exec(skillMd)) !== null) {
    const desc = kwMatch[1].trim().slice(0, 50);
    if (desc && !outputs.find(o => o.type === desc)) {
      outputs.push({ type: desc });
    }
  }

  return { inputs, outputs };
}
