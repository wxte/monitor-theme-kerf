// generated from theme.json by tools/build.mjs — do not edit
export const manifest = {
  "name": "Kerf",
  "short": "kerf",
  "version": "1.0.0",
  "config": [
    {
      "type": "title",
      "label": "首页"
    },
    {
      "key": "hero_title",
      "type": "string",
      "label": "大标题",
      "default": "",
      "help": "留空则显示站点名称"
    },
    {
      "key": "hero_subtitle",
      "type": "text",
      "label": "副标题",
      "default": "实时服务器状态，每 2 秒刷新一次。"
    },
    {
      "key": "notice",
      "type": "text",
      "label": "公告",
      "default": "",
      "help": "显示在大标题上方，留空不显示"
    },
    {
      "key": "show_terminal",
      "type": "boolean",
      "label": "显示终端报告",
      "default": true,
      "help": "大标题下方按实时流量排列的节点报告"
    },
    {
      "key": "terminal_rows",
      "type": "number",
      "label": "终端报告行数",
      "default": 5,
      "min": 1,
      "max": 20
    },
    {
      "key": "layout",
      "type": "select",
      "label": "节点布局",
      "default": "cards",
      "options": [
        {
          "value": "cards",
          "label": "卡片"
        },
        {
          "value": "list",
          "label": "列表"
        }
      ]
    },
    {
      "type": "title",
      "label": "节点卡片"
    },
    {
      "key": "show_price",
      "type": "boolean",
      "label": "显示价格",
      "default": true
    },
    {
      "key": "show_expiry",
      "type": "boolean",
      "label": "显示到期",
      "default": true
    },
    {
      "type": "title",
      "label": "页脚"
    },
    {
      "key": "footer_text",
      "type": "string",
      "label": "页脚说明",
      "default": "",
      "help": "显示在页脚站点名下方，留空不显示"
    }
  ]
}
