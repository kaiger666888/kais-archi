/**
 * 通用布局工具
 * 零依赖，确定性布局算法
 */

/**
 * 分层布局（上下排列），适用于生态全景图
 * @param {Array<{id:string, label:string, children?:Array<{id:string, label:string}>}>} items - 层级数据
 * @param {number} width - 总宽度
 * @param {number} height - 总高度
 * @param {object} [opts]
 * @param {number} [opts.nodeWidth=120] - 节点宽度
 * @param {number} [opts.nodeHeight=40] - 节点高度
 * @param {number} [opts.layerGap=80] - 层间距
 * @param {number} [opts.nodeGap=20] - 同层节点间距
 * @param {number} [opts.padding=40] - 上下边距
 * @returns {{layers:Array<{y:number,height:number,items:Array<{id:string,label:string,x:number,y:number,width:number,height:number}>>}}}
 */
export function layerLayout(items, width, height, opts = {}) {
  const {
    nodeWidth = 120, nodeHeight = 40,
    layerGap = 80, nodeGap = 20, padding = 40,
  } = opts;

  const layers = [];
  const totalHeight = items.length * nodeHeight + (items.length - 1) * layerGap + padding * 2;
  const startY = (height - totalHeight) / 2 + padding;

  for (let i = 0; i < items.length; i++) {
    const layer = items[i];
    // 层内所有项目（自身 + children）
    const allItems = [layer, ...(layer.children || [])];
    const totalNodeWidth = allItems.length * nodeWidth + (allItems.length - 1) * nodeGap;
    const startX = (width - totalNodeWidth) / 2;
    const y = startY + i * (nodeHeight + layerGap);

    const positioned = allItems.map((item, j) => ({
      id: item.id,
      label: item.label,
      x: startX + j * (nodeWidth + nodeGap) + nodeWidth / 2,
      y,
      width: nodeWidth,
      height: nodeHeight,
    }));

    layers.push({ y, height: nodeHeight, items: positioned });
  }

  return { layers };
}

/**
 * 时序图确定性布局
 * @param {string[]} actors - 参与者名称列表
 * @param {Array<{from:string, to:string, text:string, async?:boolean}>} messages - 消息列表
 * @param {number} width - 总宽度
 * @param {object} [opts]
 * @param {number} [opts.actorGap=40] - 参与者列间距
 * @param {number} [opts.messageGap=50] - 消息行间距
 * @param {number} [opts.padding=60] - 左右边距
 * @param {number} [opts.topMargin=80] - 顶部留白
 * @returns {{actorX:Object<string,number>, messageY:Object<number,number>}}
 */
export function sequenceLayout(actors, messages, width, opts = {}) {
  const {
    actorGap = 40, messageGap = 50,
    padding = 60, topMargin = 80,
  } = opts;

  // 均匀分配参与者列
  const available = width - padding * 2;
  const count = actors.length;
  const step = count > 1 ? available / (count - 1) : 0;
  const startX = count > 1 ? padding : width / 2;

  const actorX = {};
  actors.forEach((actor, i) => {
    actorX[actor] = count > 1 ? startX + i * step : startX;
  });

  // 消息 y 坐标
  const messageY = {};
  messages.forEach((msg, i) => {
    messageY[i] = topMargin + i * messageGap;
  });

  return { actorX, messageY };
}
