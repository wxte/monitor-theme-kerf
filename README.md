# Kerf

[monitor](https://github.com/monitor-probe/monitor) 的公开状态页主题。黑白极简，标题用一套自制的细线断笔字体：每个笔画在交接处断开一道细缝（kerf，锯缝），节点报告做成终端窗口，节点卡片做成价格卡的样子。

![预览](preview.png)

- 纯静态单页，零依赖、无需构建：原生 JS + CSS，整包约 180 KB
- 三套字体随包自带，不请求任何外部 CDN，国内访问不受影响
- 深浅色跟随系统，访客可手动切换（只存在访客自己的浏览器里）
- 手机、平板、桌面自适应

## 安装

三种方式，任选其一（详见文档的[安装与切换](https://monitor-document.pages.dev/dev/theme#安装与切换)）：

1. 面板 **主题** 页填本仓库地址，点「从 GitHub 安装」
2. 下载 [Releases](../../releases/latest) 里的 `theme.tar.gz`（不是 Source code），在 **主题** 页上传
3. 解压到 hub 的主题目录：一键脚本部署是 `/opt/monitor/data/themes/kerf/`

装好后在 **主题** 页选中即可，不用重启。

## 路由

| 路径 | 页面 |
| --- | --- |
| `/` | 首页：概览、终端报告、节点列表 |
| `/node/{id}` | 节点详情：实时指标、历史曲线、延迟、节点信息 |

hub 前面如果有按路径放行的反代或 WAF，要放行 `/node/` 前缀，以及 `/fonts/`、`/assets/`、`/favicon.svg`、`/apple-touch-icon.png`。症状是「点进节点正常，一刷新就被拦」。

## 主题设置

在面板 **主题** 页的卡片上点设置按钮即可修改，保存后刷新公开页生效。

| 设置 | 默认 | 说明 |
| --- | --- | --- |
| 大标题 | 空 | 留空显示站点名称 |
| 副标题 | 实时服务器状态，每 2 秒刷新一次。 | |
| 公告 | 空 | 显示在大标题上方，纯文本，可换行 |
| 显示终端报告 | 开 | 首页按实时流量排序的终端式报告 |
| 终端报告行数 | 5 | 1–20 |
| 节点布局 | 卡片 | 卡片 / 列表 |
| 显示价格 | 开 | 有价格的节点在卡片上以价格为主数字，否则显示 CPU |
| 显示到期 | 开 | |
| 页脚说明 | 空 | |

## 字体

| 字体 | 用途 | 来源 |
| --- | --- | --- |
| Kerf | 大标题、区块标题 | 由 [Lexend](https://github.com/googlefonts/lexend) 派生，`tools/build_kerf.py` 生成 |
| Space Grotesk | 正文、数字 | [floriankarsten/space-grotesk](https://github.com/floriankarsten/space-grotesk) |
| JetBrains Mono | 终端、等宽数字 | [JetBrains/JetBrainsMono](https://github.com/JetBrains/JetBrainsMono) |

三者都是 SIL Open Font License 1.1，许可证随字体放在 `dist/fonts/`。Kerf 是 Lexend 的修改版，按 OFL 要求改了名字。中文回落到系统字体：标题用细体（苹方 Light、微软雅黑 Light 等），和极细的英文笔画相称。

字体只保留了拉丁字符的子集，所以很小。重新生成 Kerf：

```sh
pip install fonttools numpy scipy scikit-image opencv-python pillow
python3 tools/build_kerf.py "path/to/Lexend[wght].ttf" dist/fonts 200
```

最后一个参数是字重（100–900），越小越细。

## 开发

不需要 npm。改的就是 `dist/` 里的文件。

```sh
# 模拟 hub：假数据，带 WebSocket gzip 推送
node tools/mock-hub.mjs           # 打开 http://127.0.0.1:9911

# 接一个真实 hub 的数据（它要开着公开状态页）
MONITOR_HUB=https://hub.example.com node tools/mock-hub.mjs

# 其它情形
MOCK_CLOSED=1 node tools/mock-hub.mjs   # 公开页关闭（401）
MOCK_NOWS=1 node tools/mock-hub.mjs     # WebSocket 被拒，测试轮询兜底
```

`theme.json` 是设置项的唯一出处，`tools/build.mjs` 把它生成为 `dist/assets/manifest.js`，打包脚本会自动运行它。改了 `theme.json` 的设置后本地调试前手动跑一次：`node tools/build.mjs`。

## 发布

1. 第一次发布前，把 `theme.json` 的 `url` 改成本仓库地址（如 `https://github.com/you/monitor-theme-kerf`），`author` 填上你的名字。面板的一键更新靠 `url` 找 release
2. 改 `theme.json` 的 `version`，提交
3. 打同名 tag 并推送：

```sh
git tag v1.0.0 && git push origin v1.0.0
```

`.github/workflows/release.yml` 会检查 tag 与 `version` 一致（`v1.0.0` 对 `1.0.0`，不一致时一键更新会每次都重装），打包、校验 gzip 尾部，然后创建 release 并上传 `theme.tar.gz`。

本地打包：`sh tools/pack.sh`。

## 与数据接口的约定

按 [主题开发](https://monitor-document.pages.dev/dev/theme) 实现，要点：

- 只用同源的 `/api/me`、`/api/nodes`、`/api/nodes/{id}/metrics`、`/api/ws`、`/api/themes/kerf/config`
- `/api/ws?gzip` 收压缩帧，按到达顺序逐帧解压；10 秒没有新帧当作断流重连；连不上（含满额 503）时每 5 秒轮询 `/api/nodes`，并定时重试 WebSocket
- 页面切到后台时断开推送、停止轮询，切回前台立即请求一次并重连
- 到期天数用 `expires_in`、离线时长用 `last_seen_ago`，旧 hub 没有这两个字段时才用浏览器时钟自算
- 节点上报的字符串、分组名、公开备注、主题设置全部按纯文本渲染
- 节点指标缺失或格式不对时只把这个节点当作「不可用」，不影响其它节点
- 分组按节点顺序排列，切换分组时在线数、网速、流量都跟着这一组算；只有部分节点有分组时显示「未分组」
- 时间范围按 `/api/me` 的 `history_days` 生成
- 价格用 `Intl.NumberFormat("zh-CN")` 显示，付款周期支持 `<n>m`

## 许可

代码 MIT，字体 SIL OFL 1.1。
