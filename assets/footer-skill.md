# 调整 dsh-turn-stats-footer 统计行

本插件有**两处**统计行，同源同口径：

1. **轮末统计行**（每轮回答最下方，本插件自己的实现）：
   `第N轮 · 耗时… · 首字…s · … token · … tok/s · 缓存…% · 模型`
2. **「本轮」常驻行**（输入框上方状态行区域 `conversation.input.dock`；**整段移植 turn-fold**）：
   ```
   [扑克牌图标] 耗时… · 首字…s · … token · … tok/s · 缓存…%     第N轮 · M 步 ⚙
   ──────────────────────────────────────────────────────────────
   ```
   跑着有、跑完也有；运行中数字是滚轮里程表。

源码：`~/.dsh/plugins/dsh-turn-stats-footer/client.js`
- 顶部 `var TF = (function(){ … })();` 整块 = **从 `@winteries/dsh-turn-fold` 的 client.js
  原样抽取**（CSS 文本 + TurnBarView/SettingsDialog/PokerIcon/computeTurnMetrics 等），
  通过 `TF.xxx` 调用；图标数据取自该包 `icons/default.json`。
- 其后的 `TurnStatsComposerLine` = 本插件的胶水层（取本回合数据 → 调 TF 计算 → 渲染 TF.TurnBarView）。
- **不要手改 TF 块**：要同步外观就按同样方式重新移植（按顶层语句切分 + 依赖闭包抽取）。

## 常见改法

- **轮末字段 / 顺序**：`parts.push`（`TurnStatsFooterLine` 内），轮末独有
  `cachePercent` / `models` 也在那里追加。
- **常驻行字段**：由 TF 的 `filterVisibleMetrics` + 齿轮面板控制（`FIELD_CONFIG`）；
  想加新字段要动 TF 块里的 `FIELD_KEYS/FIELD_DEFAULTS/FIELD_CONFIG` 与
  `computeTurnMetrics` 的返回。
- **常驻行字段 / 顺序**：`TurnStatsComposerLine` 里的 `metrics.push(...)`，每项
  `{ k, label, value }`（k 只用于 React key，label 是中文前缀，value 是数字串）。
- **常驻行右端**：`rightParts`（轮号 + 步数）。
- **牌面图标**：`PokerIcon` / `pokerCard` / `POKER_PIPS` / `STACK3` / `FAN3`；
  几何与花色 path 取自 turn-fold（5:7 比例、rx 1.08、stroke 0.7、pip 在 24 盒内）。
  顶牌固定鲸鱼 Logo；牌数 = 步数 >2 ? 5 : 3。开合动画靠
  `data-running` + `.ccg` 同款 `transition: transform .45s cubic-bezier(.22,1,.36,1)`。
- **运行中的旋转牌**：`PokerSpinIcon` + `buildPokerSpinSVG`（原样移植，含 `POKER_SPIN_*`
  常量与 `pokerSpinSeq`），SMIL 绕竖直对角轴（`POKER_SPIN_REST`≈35.54°）1.6s 一循环，
  另有一条 6.4s 的花色 `visibility` 轮换（spade/heart/diamond/club + 鲸鱼牌背）。
  调用口径：`turnPokerIcon(iconStyle, 步数, running, open, 轮号, canCollapse, sessionId)`
  —— **running 必须传真实值**，传 `false` 会渲染静态牌堆（表现为「图标不动」）。
  每条实例的 uid 前缀 `ccg-poker-spin-<n>`，避免 SVG defs/mask 被跨实例复用。
- **样式**：常驻行样式全部内联，配色用官方 token 并带兜底
  （`var(--dsw-alias-label-secondary,#9ca3af)`）——改色优先改 token 引用而不是字面量。
- **改文案**：`zh ? "首字" : "TTFT "` 等三目分支；耗时格式在 `fmtDurationZh/En`。

## 开关与位置（常驻行②）

按 `localStorage` 键 `dsh-turn-stats-footer:composerLine` 取模式：

| 值 | 行为 |
| --- | --- |
| 缺省 / `input` | 挂在 `conversation.input.dock`（输入框**上方**状态行区域，order -10）——默认 |
| `dock` / `below` | 改挂 `conversation.composer.dock`（输入框**下方**统计带） |
| `0` / `off` / `false` | 关闭②，只保留轮末① |

控制台改完可立即重挂，不必刷新：`__DSH_TURN_STATS_FOOTER__.reinstall()`
（`__DSH_TURN_STATS_FOOTER__.mode()` 看当前模式）。

### 左右缩进（对齐顶部回合栏）

官方 transcript 节点是 `._1kaiZa_column{max-width:var(--dsh-chat-content-width);width:100%;margin:0 auto}`
这一层列盒子；`input.dock` 容器却是**整条面板宽度**。所以②自己套一层同款列盒子：

```js
react.createElement("div", { style: { boxSizing:"border-box", width:"100%",
  maxWidth: alignMaxWidth(), marginLeft:"auto", marginRight:"auto", minWidth:0 } }, bar)
```

**不要**改成负边距抵消某个 dock padding（历史上踩过：那只会让左右一起外扩），
也不要写死 px。基准由 `localStorage` 键 `dsh-turn-stats-footer:align` 决定：
`content`（缺省）= `--dsh-chat-content-width`（= 顶部回合栏）、
`card` = `--dsh-composer-card-max-width`、`pane` = 不给缩进。

- 切换：`__DSH_TURN_STATS_FOOTER__.setAlign('content'|'card'|'pane')`（立即重挂）
- 量尺：`__DSH_TURN_STATS_FOOTER__.alignInfo()` → `{composerLine, column, delta}`，
  正常时 `delta.left/right` 都是 0

## 字段口径（勿改语义）

- 耗时 = 轮末取 TurnLocation end−start（durable）；②运行中取 start→now 实时墙钟，
  结束后取 start→end。
- token/缓存/模型 = 官方 turn-tail `tokenUsage` 精确聚合；缓存分母 = totalTokens−outputTokens。
- 首字/tok/s：优先 `turnFoldMetrics` 投影（需 @winteries/dsh-turn-fold）；否则客户端
  `assistant-step` 的 `finalNode.timing` 聚合；tok/s = Σoutput ÷ Σdecode（decode 口径）。
- ②只累计**真实已有**的 step 数据（当前 step 拿到 usage/timing 即计入），不伪造增长。

## 故障排查

1. 页面控制台找 `[dsh-turn-stats-footer]`：
   - `installed: shadowing official turn-tail renderer` = 轮末①挂载正常
   - `installed: live turn line in conversation.input.dock` = 常驻②挂载位置
   - `self-check: faces=… turnNo=… running=… steps=… durable=…` = 首次渲染拿到的数据面
     （`turnNo=undefined` 或 `faces=none` 才是真问题；缺 `useConversation`/`useChat`
     时会自动只靠 durable 投影显示「首字/tok/s」）
   - `another plugin already shadows …` = 有别的插件占了 turn-tail（priority -1）
   - `official turn-tail renderer never appeared` = 200 次 slots/changed 重试超时
2. 完全没有 `[dsh-turn-stats-footer]` 日志 = bundle 没被页面装载（宿主侧问题）：
   完全退出 DSH（Cmd+Q）重开；仍无则看「设置 → 插件」里的同步失败条目。
3. 改了 `client.js` 不生效：宿主按包名缓存 bundle，刷新页面拿不到就 Cmd+Q 重启。
4. **离线自测**（不需要 DSH）：`node tests/harness.test.mjs` —— 假宿主跑装载 + 两处渲染，
   覆盖运行中/结束后常驻/位置开关/投影兜底等路径，全绿才算改好。

## 卸载

官方通道 remove（走 `runCli({manageDesktopProfile:true})`）或直接在 DSH「设置 → 插件」里卸载。
