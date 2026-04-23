/**
 * 简化的力导向布局引擎
 * 零依赖，纯 JS 实现
 */

/**
 * 力导向布局
 * @param {Array<{id:string, x?:number, y?:number, group?:string}>} nodes - 节点列表
 * @param {Array<{source:string, target:string}>} edges - 边列表
 * @param {object} [opts]
 * @param {number} [opts.width=800] - 画布宽度
 * @param {number} [opts.height=600] - 画布高度
 * @param {number} [opts.iterations=300] - 迭代次数
 * @param {number} [opts.repulsion=5000] - 斥力系数
 * @param {number} [opts.attraction=0.01] - 引力系数（弹簧刚度）
 * @param {number} [opts.damping=0.9] - 速度阻尼
 * @returns {{nodes:Array<{id:string,x:number,y:number,group?:string}>,edges:Array<{source:string,target:string}>}}
 */
export function forceLayout(nodes, edges, opts = {}) {
  const {
    width = 800, height = 600,
    iterations = 300, repulsion = 5000,
    attraction = 0.01, damping = 0.9,
  } = opts;

  // 初始化节点位置和速度
  const n = nodes.length;
  const nodeMap = new Map();
  const positions = [];
  const velocities = [];

  for (let i = 0; i < n; i++) {
    const node = nodes[i];
    const x = node.x ?? (Math.random() * (width - 100) + 50);
    const y = node.y ?? (Math.random() * (height - 100) + 50);
    nodeMap.set(node.id, i);
    positions.push({ x, y });
    velocities.push({ x: 0, y: 0 });
  }

  // 预处理边为索引
  const indexedEdges = edges.map(e => ({
    source: nodeMap.get(e.source),
    target: nodeMap.get(e.target),
  })).filter(e => e.source !== undefined && e.target !== undefined);

  // 中心引力（防止节点飘走）
  const centerX = width / 2, centerY = height / 2;
  const gravity = 0.02;

  // 迭代
  for (let iter = 0; iter < iterations; iter++) {
    // 温度衰减，后期迭代更稳定
    const temp = 1 - iter / iterations;

    // 初始化力
    const fx = new Float64Array(n);
    const fy = new Float64Array(n);

    // 1. 斥力（库仑力）：所有节点对之间
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        let dx = positions[i].x - positions[j].x;
        let dy = positions[i].y - positions[j].y;
        let dist = Math.sqrt(dx * dx + dy * dy);
        dist = Math.max(dist, 1); // 防止除零

        const force = repulsion / (dist * dist);
        const fxij = (dx / dist) * force;
        const fyij = (dy / dist) * force;

        fx[i] += fxij; fy[i] += fyij;
        fx[j] -= fxij; fy[j] -= fyij;
      }
    }

    // 2. 引力（弹簧力）：连接的节点之间
    for (const edge of indexedEdges) {
      const si = edge.source, ti = edge.target;
      let dx = positions[ti].x - positions[si].x;
      let dy = positions[ti].y - positions[si].y;
      let dist = Math.sqrt(dx * dx + dy * dy);
      dist = Math.max(dist, 1);

      const force = dist * attraction;
      const fxij = (dx / dist) * force;
      const fyij = (dy / dist) * force;

      fx[si] += fxij; fy[si] += fyij;
      fx[ti] -= fxij; fy[ti] -= fyij;
    }

    // 3. 中心引力
    for (let i = 0; i < n; i++) {
      fx[i] += (centerX - positions[i].x) * gravity;
      fy[i] += (centerY - positions[i].y) * gravity;
    }

    // 更新速度和位置
    for (let i = 0; i < n; i++) {
      velocities[i].x = (velocities[i].x + fx[i]) * damping * temp;
      velocities[i].y = (velocities[i].y + fy[i]) * damping * temp;
      positions[i].x += velocities[i].x;
      positions[i].y += velocities[i].y;

      // 边界约束
      positions[i].x = Math.max(20, Math.min(width - 20, positions[i].x));
      positions[i].y = Math.max(20, Math.min(height - 20, positions[i].y));
    }
  }

  // 构建结果
  const resultNodes = nodes.map((node, i) => ({
    id: node.id,
    x: Math.round(positions[i].x * 10) / 10,
    y: Math.round(positions[i].y * 10) / 10,
    group: node.group,
  }));

  return { nodes: resultNodes, edges };
}
