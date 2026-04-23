/**
 * layer-map-detector.js
 * 扫描 skills 目录，按关键词自动分层
 */
import fs from 'node:fs';
import path from 'node:path';

// 分层定义：名称、颜色、匹配关键词（小写）
const LAYER_DEFS = [
  {
    name: '自动驾驶层',
    color: '#FF6B6B',
    keywords: ['autopilot', '自动驾驶', '无人值守', 'pilot', '持续开发'],
  },
  {
    name: '编排层',
    color: '#4ECDC4',
    keywords: ['orchestration', '编排', 'team', '团队', 'pipeline', '协调', 'agent'],
  },
  {
    name: '基础设施层',
    color: '#96CEB4',
    keywords: ['infra', '基础', '通用', '工具', 'util', 'helper', 'memory', 'search', 'browser'],
  },
  // 专业能力层放最后，作为兜底
  {
    name: '专业能力层',
    color: '#45B7D1',
    keywords: [],
  },
];

/**
 * 从 SKILL.md 内容中提取 description（frontmatter 或第一行注释）
 */
function extractDescription(content) {
  // 尝试 <description> 标签（XML frontmatter 风格）
  const descMatch = content.match(/<description>([\s\S]*?)<\/description>/);
  if (descMatch) return descMatch[1].trim().split('\n')[0];

  // 尝试 YAML frontmatter
  const yamlMatch = content.match(/^---\n[\s\S]*?description:\s*["']?(.+?)["']?\s*\n[\s\S]*?---/m);
  if (yamlMatch) return yamlMatch[1].trim();

  // 兜底：取第一个非空、非标题行
  const lines = content.split('\n').filter(l => l.trim() && !l.trim().startsWith('#'));
  return lines[0]?.trim().slice(0, 120) || '';
}

/**
 * 根据 description 关键词判断所属层索引
 */
function classifyLayer(description) {
  const lower = description.toLowerCase();
  for (let i = 0; i < LAYER_DEFS.length; i++) {
    if (LAYER_DEFS[i].keywords.length === 0) continue; // 跳过兜底层
    if (LAYER_DEFS[i].keywords.some(kw => lower.includes(kw))) return i;
  }
  // 兜底：专业能力层（倒数第一个）
  return LAYER_DEFS.length - 1;
}

/**
 * 扫描 skills 目录，返回分层模型
 * @param {string} skillsDir - skills 目录路径
 * @returns {Promise<{type:string, layers:Array}>}
 */
export async function detectLayerMap(skillsDir) {
  const entries = await fs.promises.readdir(skillsDir, { withFileTypes: true });
  const skillDirs = entries.filter(e => e.isDirectory() && !e.name.startsWith('.'));

  // 读取每个 skill 的 SKILL.md
  const skills = [];
  for (const dir of skillDirs) {
    const skillPath = path.join(skillsDir, dir.name, 'SKILL.md');
    let description = '';
    try {
      const content = await fs.promises.readFile(skillPath, 'utf-8');
      description = extractDescription(content);
    } catch {
      // SKILL.md 不存在则跳过
      continue;
    }
    skills.push({ id: dir.name, label: dir.name, description });
  }

  // 分层
  const layers = LAYER_DEFS.map(def => ({ ...def, items: [] }));
  for (const skill of skills) {
    const idx = classifyLayer(skill.description);
    layers[idx].items.push(skill);
  }

  // 每层内按字母排序
  for (const layer of layers) {
    layer.items.sort((a, b) => a.label.localeCompare(b.label));
  }

  // 过滤空层（保留专业能力层即使为空）
  // 实际上不过滤，让结构完整

  return { type: 'layer-map', layers };
}
