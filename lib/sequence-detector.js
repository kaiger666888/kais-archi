/**
 * 时序图检测器
 * 从 SKILL.md 文本中自动提取参与者与交互消息
 * 零依赖，纯文本分析
 */

// 已知交互动词 → 方向推断
const ACTION_VERBS_ZH = ['发送', '调用', '触发', '请求', '通知', '传递', '转发', '委托', '查询', '返回', '回复', '输出', '写入', '推送', '生成', '创建', '执行', '解析', '读取', '加载'];
const ACTION_VERBS_EN = ['send', 'call', 'invoke', 'trigger', 'spawn', 'request', 'notify', 'dispatch', 'delegate', 'query', 'return', 'reply', 'output', 'write', 'push', 'generate', 'create', 'execute', 'parse', 'read', 'load', 'fetch', 'render', 'dispatch'];

// 返回类关键词
const RETURN_KEYWORDS = ['返回', '回复', '响应', 'return', 'reply', 'response', 'callback', 'result'];

/**
 * 从 SKILL.md 中检测时序模型
 * @param {string} skillMd - SKILL.md 完整文本，或已解析的 JSON 对象
 * @returns {{type:'sequence', actors:string[], messages:Array<{from:string,to:string,text:string,index:number,async?:boolean,return?:boolean}>}}
 */
export function detectSequenceFromSkill(skillMd) {
  // 如果传入的是 JSON 字符串或对象，直接解析
  if (typeof skillMd === 'object' && !Array.isArray(skillMd) && skillMd.actors) {
    return {
      type: 'sequence',
      actors: skillMd.actors,
      messages: (skillMd.messages || []).map((m, i) => ({ ...m, index: i })),
    };
  }

  let text = typeof skillMd === 'string' ? skillMd : '';
  // 如果是 JSON 字符串
  try {
    const parsed = JSON.parse(text);
    if (parsed.actors) {
      return { type: 'sequence', actors: parsed.actors, messages: (parsed.messages || []).map((m, i) => ({ ...m, index: i })) };
    }
  } catch {}

  // --- 文本分析模式 ---
  const lines = text.split('\n');

  // 1. 提取参与者：匹配 "用户"、"Agent"、"kais-xxx"、英文驼峰/kebab标识符
  const actorSet = new Set();
  const actorPatterns = [
    /(?:用户|User)/gi,
    /(?:Agent|代理)/gi,
    /(?:kais|skill|tool|plugin|handler|worker|service|server|client|browser|db|database|api|gateway)\/[a-z0-9-]+/gi,
    /\b[A-Z][a-zA-Z0-9]*(?:-[A-Z][a-zA-Z0-9]*)*\b/g,  // 大驼峰或 kebab-case 标识符
  ];

  for (const line of lines) {
    // 跳过标题行和空行
    if (/^#{1,6}\s/.test(line) || line.trim() === '') continue;
    for (const pat of actorPatterns) {
      const matches = line.match(pat);
      if (matches) matches.forEach(m => actorSet.add(m.trim()));
    }
  }

  // 规范化参与者名称
  const actors = [...actorSet]
    .map(a => a.replace(/^用户$/i, 'User').replace(/^代理$/i, 'Agent').replace(/^Agent$/i, 'Agent'))
    .filter((a, i, arr) => arr.indexOf(a) === i) // 去重
    .slice(0, 10); // 最多 10 个参与者

  // 如果没提取到参与者，给一个默认
  if (actors.length === 0) {
    actors.push('User', 'Agent');
  }

  // 2. 提取消息：逐行分析包含动作动词的句子
  const messages = [];
  let msgIndex = 0;

  for (const line of lines) {
    if (/^#{1,6}\s/.test(line) || line.trim() === '') continue;

    const msg = extractMessage(line, actors);
    if (msg) {
      msg.index = msgIndex++;
      messages.push(msg);
    }
  }

  return { type: 'sequence', actors, messages };
}

/**
 * 从单行文本中提取一条消息
 * @param {string} line
 * @param {string[]} actors
 * @returns {{from:string,to:string,text:string,async?:boolean,return?:boolean}|null}
 */
function extractMessage(line, actors) {
  // 匹配模式：[参与者A] [动词] [参与者B] [描述]
  // 例：Agent 调用 kais-pilot 触发编排
  // 例：用户 请求 Agent 描述需求

  const actorList = actors.join('|').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const verbList = [...ACTION_VERBS_ZH, ...ACTION_VERBS_EN].join('|');

  // 模式1：A 动词 B 描述
  const re1 = new RegExp(`(${actorList})\\s+(${verbList})\\s+(${actorList})\\s*(.*)`, 'i');
  // 模式2：A → B 描述
  const re2 = new RegExp(`(${actorList})\\s*[→➤⟵↪]\\s*(${actorList})\\s*(.*)`, 'i');
  // 模式3：动词 A → B（被动式）
  const re3 = new RegExp(`(${actorList})\\s+被\\s*(${actorList})\\s+(${verbList})\\s*(.*)`, 'i');

  let m = line.match(re1) || line.match(re2);
  if (!m) {
    const m3 = line.match(re3);
    if (m3) {
      // 被动式：B 被 A 动词 → from: A, to: B
      return {
        from: m3[2],
        to: m3[1],
        text: m3[3] + m3[4],
        async: isAsync(m3[3]),
        return: isReturn(m3[3] + m3[4]),
      };
    }
    return null;
  }

  const verb = m[2] || '';
  const isRet = isReturn(verb);
  return {
    from: isRet ? m[2] || m[1] : m[1],
    to: isRet ? m[1] : (m[2] || m[3]),
    text: (verb ? verb + ' ' : '') + (m[4] || '').trim(),
    async: isAsync(verb) && !isRet,
    return: isRet,
  };
}

function isAsync(verb) {
  return /\b(spawn|dispatch|push|notify|trigger)\b/i.test(verb) || /推送|触发|通知/.test(verb);
}

function isReturn(text) {
  return RETURN_KEYWORDS.some(k => new RegExp(`\\b${k}\\b`, 'i').test(text));
}
