#!/usr/bin/env bash
# kais-archi 入口脚本 — 支持多格式输出（HTML / Mermaid / Notion）
set -euo pipefail

SKILL_DIR="$(cd "$(dirname "$0")/.." && pwd)"

# 默认值
TARGET=""
TYPE="all"
STYLE="dark"
FORMATS="html,mermaid"
NOTION_PARENT=""
OUTPUT_DIR=""

# 解析参数
while [[ $# -gt 0 ]]; do
  case "$1" in
    --notion)
      NOTION_PARENT="$2"; shift 2 ;;
    --format)
      FORMATS="$2"; shift 2 ;;
    --style)
      STYLE="$2"; shift 2 ;;
    --output)
      OUTPUT_DIR="$2"; shift 2 ;;
    *)
      if [ -z "$TARGET" ]; then
        TARGET="$1"
      else
        TYPE="$1"
      fi
      shift ;;
  esac
done

if [ -z "$TARGET" ]; then
  echo "用法: generate.sh <目标目录> [类型] [选项]"
  echo ""
  echo "类型: all | combined | pipeline | sequence | call-graph | layer-map"
  echo ""
  echo "选项:"
  echo "  --style dark|light|gradient|minimal   主题（默认 dark）"
  echo "  --format html|mermaid|notion|html,mermaid  输出格式（默认 html,mermaid）"
  echo "  --notion <parent_page_id>             输出到 Notion 指定页面下"
  echo "  --output <dir>                        输出目录"
  echo ""
  echo "示例:"
  echo "  generate.sh ./my-skill                              # HTML + Mermaid"
  echo "  generate.sh ./my-skill --format html                # 仅 HTML"
  echo "  generate.sh ./my-skill --notion 34b11082af8e8009.. # 输出到 Notion"
  echo "  generate.sh ./my-skill --format html,mermaid,notion --notion 34b11082.."
  exit 1
fi

PORT="${KAIS_ARCHI_PORT:-8090}"
IP=$(hostname -I | awk '{print $1}')

# 启动预览服务器
if ! lsof -i :$PORT > /dev/null 2>&1; then
  cd /tmp && python3 -m http.server $PORT > /dev/null 2>&1 &
fi

if [ "$TYPE" = "all" ]; then
  # 批量生成
  echo "🔍 kais-archi v2.1 — 批量生成 [${FORMATS}]"
  OUT_ARG="${OUTPUT_DIR:+--output $OUTPUT_DIR}"
  NOTION_ARG="${NOTION_PARENT:+--notion $NOTION_PARENT}"

  RESULT=$(node --input-type=module -e "
    import { generateAll } from '$SKILL_DIR/lib/index.js';
    const result = await generateAll('$TARGET', {
      style: '$STYLE',
      ${OUTPUT_DIR:+outputDir: '$OUTPUT_DIR',}
      formats: '${FORMATS}'.split(','),
      ${NOTION_PARENT:+notionParentId: '$NOTION_PARENT',}
    });
    console.log(JSON.stringify({
      outDir: result.outDir,
      htmlCount: result.pages.length,
      mermaidCount: result.mermaidFiles.length,
      notionCount: (result.notionPages || []).length,
      notionPages: (result.notionPages || []).map(p => ({ type: p.type, url: p.url })),
    }));
  " 2>&1)

  echo "$RESULT" | node -e "
    const r = JSON.parse(require('fs').readFileSync('/dev/stdin','utf8'));
    console.log('');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('  📂 输出目录: ' + r.outDir);
    console.log('  🌐 HTML:    ' + r.htmlCount + ' 个页面');
    console.log('  📝 Mermaid: ' + r.mermaidCount + ' 个文件');
    if (r.notionCount > 0) {
      console.log('  📋 Notion:   ' + r.notionCount + ' 个页面');
      r.notionPages.forEach(p => console.log('     ✅ ' + p.type + ' → ' + p.url));
    }
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('');
    console.log('📍 http://${IP}:${PORT}/' + r.outDir.split('/').pop() + '/index.html');
  "

else
  # 单个图表
  echo "🔍 kais-archi v2.1 — ${TYPE} [${FORMATS}]"

  SCAN_DIR="$TARGET"
  if [ "$TYPE" = "call-graph" ] || [ "$TYPE" = "layer-map" ]; then
    SCAN_DIR="$(dirname "$TARGET")"
  fi

  set +e
  if echo "$FORMATS" | grep -q "html"; then
    OUTPUT_FILE="${OUTPUT_DIR:-/tmp}/arch-${TYPE}.html"
    HTML=$(node --input-type=module -e "
      import { generate } from '$SKILL_DIR/lib/index.js';
      const html = await generate('$SCAN_DIR', { type: '$TYPE', style: '$STYLE' });
      process.stdout.write(html);
    " 2>/tmp/arch-stderr.log)
    if [ $? -eq 0 ]; then
      echo "$HTML" > "$OUTPUT_FILE"
      SIZE=$(wc -c < "$OUTPUT_FILE" | awk '{printf "%.1f", $1/1024}')
      echo "  ✅ HTML: $OUTPUT_FILE ($SIZE KB)"
      echo "  📍 http://${IP}:${PORT}/$(basename "$OUTPUT_FILE")"
    else
      echo "  ❌ HTML 生成失败: $(cat /tmp/arch-stderr.log)"
    fi
  fi

  if echo "$FORMATS" | grep -q "mermaid"; then
    MMD_FILE="${OUTPUT_DIR:-/tmp}/arch-${TYPE}.mmd"
    node --input-type=module -e "
      import { toMermaid } from '$SKILL_DIR/lib/index.js';
      import { detectArchitecture } from '$SKILL_DIR/lib/detector.js';
      const model = await detectArchitecture('$SCAN_DIR');
      const mmd = toMermaid(model, { type: '$TYPE' });
      require('fs').writeFileSync('$MMD_FILE', mmd);
      console.log('  ✅ Mermaid: $MMD_FILE (' + (mmd.length/1024).toFixed(1) + ' KB)');
    " 2>&1
  fi

  if echo "$FORMATS" | grep -q "notion" && [ -n "$NOTION_PARENT" ]; then
    node --input-type=module -e "
      import { writeToNotion, toMermaid } from '$SKILL_DIR/lib/index.js';
      const mmd = require('fs').readFileSync('${MMD_FILE:-/tmp/arch-${TYPE}.mmd}', 'utf-8');
      const result = await writeToNotion('$NOTION_PARENT', {
        projectName: '$(basename "$TARGET")',
        mermaidCode: mmd,
        type: '$TYPE',
        style: '$STYLE',
      });
      console.log('  ✅ Notion: ' + result.url);
    " 2>&1
  fi
  set -e
fi
