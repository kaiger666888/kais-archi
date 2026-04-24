/**
 * Skill 依赖调用图检测器
 * 扫描 skills 目录，从 SKILL.md 和 lib/*.js 中提取 skill 间的调用关系
 */

import { readdir, readFile } from 'node:fs/promises';
import { join, basename } from 'node:path';
import { existsSync } from 'node:fs';

// ── Skill 分类规则 ──────────────────────────────────────
const GROUP_RULES = [
  { group: 'orchestration', pattern: /pilot|auto-dev|brainstorm|pre-mortem|autoresearch|experiment-research/i },
  { group: 'content',       pattern: /writer|scenario|storyboard|camera|shooting|scene|character|art-direction|xiaohongshu|emotion|uml|coda-reviewer|geo/i },
  { group: 'dev',           pattern: /coding-agent|claude-code|github|gh-issues|coding/i },
  { group: 'infra',         pattern: /weather|healthcheck|node-connect|rssaurus|video-frames|chromadb|bilibili-upload|clawhub|mcporter|notion|feishu/i },
];

/** 根据 skill 名称推断 group */
function classifySkill(name) {
  for (const { group, pattern } of GROUP_RULES) {
    if (pattern.test(name)) return group;
  }
  return 'other';
}

// ── 从 SKILL.md 提取描述（第一行非空 # 标题后的摘要） ─────
function extractDescription(content) {
  const m = content.match(/^#\s+.+$/m);
  if (m) {
    // 取标题下一行到下一个 ## 之间的非空文本，截断
    const after = content.slice(content.indexOf(m[0]) + m[0].length);
    const snippet = after.replace(/^#.*$/gm, '').trim().split(/\n/)[0];
    return snippet.slice(0, 80) || m[0].replace(/^#\s+/, '');
  }
  return '';
}

// ── 已知 skill 名称模式 ─────────────────────────────────
const SKILL_NAME_RE = /\b(kais-[a-z][-a-z0-9]*|coding-agent|claude-code-via-openclaw|claude-code|gh-issues|github|weather|healthcheck|node-connect|notion|feishu[-\w]+|clawhub|mcporter|video-frames|rssaurus[-\w]*|chromadb[-\w]*|bilibili-upload|auto-dev|autoresearch|experiment-research|pre-mortem-analyst|uml-storyboard|skill[-\w]*|self-evolving-skill|habit-tracker|chart-image|coda-reviewer|xiaohongshu[-\w]*|arxiv-watcher)\b/gi;

// ── 调用关键词 → 边 label 映射 ──────────────────────────
const KEYWORD_MAP = [
  { re: /\bspawn\b/i,                      label: 'spawn' },
  { re: /\bdelegate\b/i,                   label: 'delegate' },
  { re: /\bimport\b.*from\b/i,             label: 'import' },
  { re: /\brequire\s*\(/i,                 label: 'import' },
  { re: /(?:触发|调用|使用)\s*skill/i,      label: 'trigger' },
  { re: /(?:协作|配合|调用|依赖|使用)/i,     label: 'reference' },
];

// ── 解析单个 skill 目录 ─────────────────────────────────
async function analyzeSkill(dirPath, name) {
  const skillMdPath = join(dirPath, 'SKILL.md');
  const libDir = join(dirPath, 'lib');
  const content = existsSync(skillMdPath) ? await readFile(skillMdPath, 'utf-8') : '';
  const description = extractDescription(content);
  const group = classifySkill(name);

  // 收集所有引用到的 skill 名称
  const refs = new Map(); // skillName → Set<label>

  // 1) 从 SKILL.md 提取
  if (content) {
    // 提取所有 skill 名称
    const mentions = content.match(SKILL_NAME_RE) || [];
    for (const mentioned of mentions) {
      const normalized = mentioned.toLowerCase();
      if (normalized === name.toLowerCase()) continue;
      if (!refs.has(normalized)) refs.set(normalized, new Set());
      // 判断 label
      const lineStart = content.lastIndexOf('\n', content.indexOf(mentioned)) + 1;
      const lineEnd = content.indexOf('\n', content.indexOf(mentioned));
      const line = content.slice(lineStart, lineEnd);
      for (const { re, label } of KEYWORD_MAP) {
        if (re.test(line)) { refs.get(normalized).add(label); break; }
      }
      // 未匹配到关键词则默认 reference
      if (refs.get(normalized).size === 0) refs.get(normalized).add('reference');
    }

    // 2) 专门检查 "与其他 Skill 的协作" 章节
    const collabSection = content.match(/(?:与其他\s*Skill\s*的协作|Skill.*协作|依赖.*skill|skill.*依赖)[\s\S]*?(?=\n##|\n#|$)/i);
    if (collabSection) {
      const collabMentions = collabSection[0].match(SKILL_NAME_RE) || [];
      for (const mentioned of collabMentions) {
        const normalized = mentioned.toLowerCase();
        if (normalized === name.toLowerCase()) continue;
        if (!refs.has(normalized)) refs.set(normalized, new Set());
        refs.get(normalized).add('reference');
      }
    }
  }

  // 3) 从 lib/*.js 提取 import/require
  if (existsSync(libDir)) {
    const libFiles = await readdir(libDir).catch(() => []);
    for (const f of libFiles) {
      if (!f.endsWith('.js')) continue;
      const libContent = await readFile(join(libDir, f), 'utf-8').catch(() => '');
      // 匹配相对路径 import/require（同 skill 内部的 lib 引用不算跨 skill）
      // 这里主要关注跨 skill 引用（如 import from 'kais-xxx/lib/...'）
      const crossImports = libContent.match(/(?:import|require)\s*\(?['"](?:\.+\/)*([\w-]+(?:\/[\w-]+)*)['"]\)?/g) || [];
      // 暂不处理，因为跨 skill import 路径格式不确定，留待后续扩展
    }
  }

  // 4) 从架构定位代码块提取 I/O
  const inputs = [];
  const outputs = [];
  if (content) {
    const codeBlocks = content.match(/```[\s\S]*?```/g) || [];
    for (const block of codeBlocks) {
      // 输入：... → [Type] → name
      const inMatch = block.match(/(\S+)\s*→\s*\[([^\]]+)\]\s*→\s*\b\w+/);
      if (inMatch && !inputs.find(i => i.type === inMatch[2])) {
        inputs.push({ source: inMatch[1], type: inMatch[2] });
      }
      // 输出：name → [Type] → ...
      const afterName = block.split(name).slice(1).join('');
      const outMatch = afterName.match(/→\s*\[(.+?)\]\s*→\s*(\S+)/);
      if (outMatch && !outputs.find(o => o.type === outMatch[1])) {
        outputs.push({ target: outMatch[2], type: outMatch[1] });
      }
    }
  }

  return { name, description, group, refs, inputs, outputs };
}

// ── 主入口 ──────────────────────────────────────────────
/**
 * 扫描 skillsDir 下所有 skill，构建调用关系图
 * @param {string} skillsDir - skills 根目录路径
 * @returns {Promise<{type:'call-graph', nodes:Array, edges:Array}>}
 */
export async function detectCallGraph(skillsDir) {
  // 列出所有 skill 目录
  const entries = await readdir(skillsDir, { withFileTypes: true });
  const skillDirs = entries.filter(e => e.isDirectory() && existsSync(join(skillsDir, e.name, 'SKILL.md')));

  // 并行分析每个 skill
  const results = await Promise.all(
    skillDirs.map(d => analyzeSkill(join(skillsDir, d.name), d.name))
  );

  // 收集所有 skill 名称（作为节点候选集）
  const allNames = new Set(results.map(r => r.name));

  // 构建节点（附加 I/O 信息）
  const ioMap = new Map();
  for (const r of results) {
    if (r.inputs.length > 0 || r.outputs.length > 0) {
      ioMap.set(r.name, { inputs: r.inputs, outputs: r.outputs });
    }
  }

  const nodes = results.map(r => ({
    id: r.name,
    label: r.name,
    group: r.group,
    description: r.description,
    ...(ioMap.has(r.name) ? { io: ioMap.get(r.name) } : {}),
  }));

  // 构建边（去重）
  const edgeSet = new Set();
  const edges = [];
  for (const r of results) {
    for (const [target, labels] of r.refs) {
      // 只保留指向已知 skill 的边
      if (!allNames.has(target)) continue;
      const label = [...labels][0]; // 取第一个 label
      const key = `${r.name}->${target}:${label}`;
      const reverseKey = `${target}->${r.name}:${label}`;
      if (!edgeSet.has(key) && !edgeSet.has(reverseKey)) {
        edgeSet.add(key);
        edges.push({ source: r.name, target, label });
      }
    }
  }

  return { type: 'call-graph', nodes, edges };
}
