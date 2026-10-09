// 离线验证 dsh-turn-stats-footer/client.js：假 __ModuleLoader__ + 假 React + 假 slots。
// 覆盖：模块装载、两个 slot 注册、轮末统计行、统计带「本轮」行（运行中/结束后）。
// 用法：node tests/harness.test.mjs
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const src = readFileSync(join(here, '..', 'client.js'), 'utf8')

let failures = 0
function check(name, cond, extra) {
  if (cond) { console.log('  ok  ', name) } else {
    failures += 1
    console.log('  FAIL', name, extra === undefined ? '' : JSON.stringify(extra))
  }
}

// ---------- 假 React ----------
let currentStore = null
let effectQueue = []
const react = {
  Fragment: Symbol('Fragment'),
  createElement(type, props, ...children) {
    if (typeof type === 'function') return type({ ...(props || {}), children })
    return { type, props: props || {}, children }
  },
  useSyncExternalStore(subscribe, getSnapshot) {
    currentStore = { subscribe, getSnapshot }
    return getSnapshot()
  },
  useState(init) {
    const i = ++__hookIdx
    if (!(i in __hooks)) __hooks[i] = typeof init === 'function' ? init() : init
    return [__hooks[i], (v) => { __hooks[i] = typeof v === 'function' ? v(__hooks[i]) : v }]
  },
  useEffect(fn) { try { fn() } catch (e) { /* ignore */ } },
  useLayoutEffect(fn) { effectQueue.push(fn) },
  useMemo(fn) { __hookIdx += 1; return fn() },
  useCallback(fn) { __hookIdx += 1; return fn },
  useRef(init) {
    const i = ++__hookIdx
    if (!(i in __hooks)) __hooks[i] = { current: init === undefined ? null : init }
    return __hooks[i]
  },
  useId() { __hookIdx += 1; return 'id-' + (++__idSeq) },
}
let __idSeq = 0
// 跨渲染持久的 hook 槽（模拟真实 React：ref 对象同一实例，state 同一位）
let __hooks = {}
let __hookIdx = 0

// ---------- 假宿主环境 ----------
const logs = []
const slots = {
  entries: () => [],
  inject: (name, fn) => { const d = fn(); return typeof d === 'function' ? d : () => {} },
  register: (options, component) => { registered.push({ options, component }); return () => {} },
}
const registered = []
globalThis.window = {
  __ModuleLoader__: { load: (def) => { loaded = def } },
  localStorage: { getItem: () => null },
}
globalThis.document = { documentElement: { lang: 'zh-CN' } }
globalThis.console = { ...console, info: (...a) => logs.push(['info', ...a]), warn: (...a) => logs.push(['warn', ...a]) }
let loaded = null

// ---------- 装载 ----------
new Function(src)()
check('模块已 load', loaded !== null && loaded.id === 'dsh-turn-stats-footer')

const exportsObj = loaded.factory((name) => {
  if (name === 'react') return react
  throw new Error('unexpected require: ' + name)
})

// ---------- 假 slots 服务（带官方 turn-tail 占位） ----------
const officialTurnTail = function OfficialTurnTail() { return { type: 'official' } }
const slotSvc = {
  _entries: [],
  entries(slot) {
    return slot === 'conversation.chat.node'
      ? [{ options: { key: 'turn-tail', priority: 0 }, component: officialTurnTail }]
      : this._entries.filter(e => e.options.name === slot)
  },
  inject: (name, fn) => { const d = fn(); return typeof d === 'function' ? d : () => {} },
  register: (options, component) => { registered.push({ options, component }); return () => {} },
}

let applied = null
exportsObj.apply({
  inject: (deps, fn) => fn({ slots: slotSvc }),
  on: () => () => {},
})

const byId = (id) => registered.find(r => r.options.id === id)
const __api = window.__DSH_TURN_STATS_FOOTER__

check('注册了轮末 shadow（turn-tail, priority -1）',
  registered.some(r => r.options.name === 'conversation.chat.node' && r.options.key === 'turn-tail' && r.options.priority === -1))
check('默认挂在状态行区域（conversation.input.dock，不是输入框下方统计带）',
  !!(byId('turn-stats-footer')
    && byId('turn-stats-footer').options.name === 'conversation.input.dock'
    && byId('turn-stats-footer').options.order === -10))
check('未与官方 activity/usage 撞 id',
  !registered.some(r => r.options.id === 'activity' || r.options.id === 'usage'))

// ---------- 假数据面：一个正在跑的回合 ----------
const STEP_RUNNING = {
  step: 1, status: 'running', time: 1000 + 900, stepStartTime: 1000,
  usage: { outputTokens: 178 },
  blocks: [],
}
const STEP_SETTLED = {
  step: 1, status: 'settled',
  usage: { outputTokens: 240 },
  finalNode: { timing: { stepStartTime: 1000, firstTokenTime: 1300, completedTime: 5300 } },
}
// 官方 turn-tail 聚合（总 token / 缓存 / 模型）——运行中也应有
const TURN_TAIL = {
  tokenUsage: {
    totalTokens: 5000, outputTokens: 240, cacheReadTokens: 4560,
    routes: [{ model: 'deepseek-v4.1-flash' }],
  },
}
const turnLoc = {
  turn: 2, status: 'open', start: { time: 1000 },
  steps: [{ step: 1, data: { get: () => undefined } }],
  data: { get: (k) => (k === 'turn-tail' ? TURN_TAIL : undefined) },
}
const snapshot = { timeline: { turns: new Map([[2, turnLoc]]) } }

function makeSource(data) {
  return { subscribe: () => () => {}, getSnapshot: () => data }
}
let sourceData = [STEP_RUNNING]
const useChat = (selector) => selector({
  nodes: { turnDataSource: () => makeSource(sourceData) },
  timeline: { turns: new Map([[2, turnLoc]]) },
})
const useConversation = (selector) => selector(snapshot)
// 宿主 wire 上 turnFoldMetrics 是「整表」值；投影 hook 可能带选择器也可能不带，
// 两种形态都要能工作（本插件在内部自行归一）。
const PROJECTION_TABLE = { turns: { 2: { ttftMs: 300, decodeMs: 4000, decodeTokens: 240 } } }
const useProjection = (key, selector) => (typeof selector === 'function' ? selector(PROJECTION_TABLE) : PROJECTION_TABLE)

const composer = byId('turn-stats-footer').component
const render = () => {
  effectQueue = []
  __hookIdx = 0
  return composer({ useChat, useConversation, useProjection, t: (k) => k })
}

/** 拍平成文本：跳过 aria-hidden 子树（运行中是滚轮数字，可读文本在 ccg-sr-only 里）。 */
function toText(node) {
  if (node === null || node === undefined) return ''
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(toText).join('')
  if (typeof node !== 'object') return ''
  const p = node.props || {}
  if (p['aria-hidden'] === 'true' || p['aria-hidden'] === true) return ''
  return (node.children || []).map(toText).join('')
}

/** 深度查找第一个满足谓词的元素。 */
function findEl(node, pred) {
  if (node === null || node === undefined || typeof node !== 'object') return null
  if (Array.isArray(node)) {
    for (const c of node) { const hit = findEl(c, pred); if (hit) return hit }
    return null
  }
  if (pred(node)) return node
  for (const c of (node.children || [])) { const hit = findEl(c, pred); if (hit) return hit }
  return null
}

/** 收集所有满足谓词的元素。 */
function allEls(node, pred, out = []) {
  if (node === null || node === undefined || typeof node !== 'object') return out
  if (Array.isArray(node)) { node.forEach(c => allEls(c, pred, out)); return out }
  if (pred(node)) out.push(node)
  ;(node.children || []).forEach(c => allEls(c, pred, out))
  return out
}

const cls = (name) => (n) => n.props && typeof n.props.className === 'string'
  && n.props.className.split(/\s+/).indexOf(name) !== -1

const out1 = render()
check('运行中：常驻行渲染（turn-fold 同一结构）',
  !!(out1 && findEl(out1, cls('ccg-turn-wrap')) && findEl(out1, cls('ccg-turn-row'))), out1 && out1.props && out1.props.className)
check('主栏是运行态（data-tf-turn-bar=running）',
  !!findEl(out1, (n) => n.props && n.props['data-tf-turn-bar'] === 'running'))
check('齿轮按钮存在且可点（ccg-gear-button + aria-haspopup=dialog）',
  !!findEl(out1, (n) => n.props && n.props.className === 'ccg-gear-button'
    && n.props['aria-haspopup'] === 'dialog' && typeof n.props.onClick === 'function'))
check('下方分隔线与回合栏一致（ccg-turn-divider）', !!findEl(out1, cls('ccg-turn-divider')))
const text1 = toText(out1)
check('运行中含 耗时/首字/总token/tok-s/缓存',
  /耗时/.test(text1) && /首字0\.3s/.test(text1) && /5,000 token/.test(text1) && /60tok\/s/.test(text1) && /缓存95\.80%/.test(text1), text1)
check('运行中含轮号与步数（右端）', /第2轮 · 1 步/.test(text1), text1)
// 运行中牌面 = turn-fold 原版的旋转牌（SMIL 主轴旋转 + 花色轮换），不是静态图标
const spinHtml = (() => {
  const svg = findEl(out1, (n) => n.props && typeof n.props.dangerouslySetInnerHTML === 'object'
    && /axis-spin-card/.test(n.props.dangerouslySetInnerHTML.__html))
  return svg ? svg.props.dangerouslySetInnerHTML.__html : null
})()
check('运行中牌面是会转的旋转牌（axis-spin-card + SMIL animateTransform + 主轴倾角）',
  !!spinHtml && /animateTransform/.test(spinHtml) && /ccg-axis-rest-rotation/.test(spinHtml)
  && !/class="ccg-poker-card"/.test(spinHtml), spinHtml ? spinHtml.slice(0, 80) : null)
check('运行中旋转牌带每实例唯一 id（避免 mask/defs 复用）',
  !!spinHtml && /id="axis-deepseek-ccg-poker-spin-\d+"/.test(spinHtml), null)
check('运行中数字是滚轮里程表（ccg-roll-*）', !!findEl(out1, cls('ccg-roll-cell')) || !!findEl(out1, cls('ccg-roll-text')))

// ---------- 对齐：本条与顶部 turn-fold 回合栏共用同一个 transcript 列盒子 ----------
const alignBox = out1 && out1.props && out1.props.style
check('外层套的是 transcript 列盒子（max-width:var(--dsh-chat-content-width) + margin auto）',
  !!(alignBox
    && alignBox.width === '100%'
    && String(alignBox.maxWidth) === 'var(--dsh-chat-content-width,920px)'
    && alignBox.marginLeft === 'auto' && alignBox.marginRight === 'auto'
    && alignBox.boxSizing === 'border-box'),
  alignBox)
check('不再用负边距抵消 dock 内边距（旧的 -dsh-composer-dock-inset 手法已移除）',
  !!(alignBox && !/-var\(--dsh-composer-dock-inset/.test(String(alignBox.marginLeft) + String(alignBox.marginRight))
    && !/calc\(/.test(String(alignBox.marginLeft))),
  alignBox && alignBox.marginLeft)

// 对齐基准可切换（localStorage dsh-turn-stats-footer:align）
const savedLocalStorage = globalThis.window.localStorage
globalThis.window.localStorage = { getItem: (k) => (k === 'dsh-turn-stats-footer:align' ? 'card' : null) }
check('align=card → 用输入框卡片宽（--dsh-composer-card-max-width）',
  String(render().props.style.maxWidth) === 'var(--dsh-composer-card-max-width,952px)',
  render().props.style.maxWidth)
globalThis.window.localStorage = { getItem: (k) => (k === 'dsh-turn-stats-footer:align' ? 'pane' : null) }
check('align=pane → 不给缩进（max-width:none）', String(render().props.style.maxWidth) === 'none',
  render().props.style.maxWidth)
check('__DSH_TURN_STATS_FOOTER__.align() 报当前基准', __api.align() === 'pane', __api.align())
globalThis.window.localStorage = savedLocalStorage
check('align 复位 → 回到聊天内容列', __api.align() === 'content' && String(render().props.style.maxWidth) === 'var(--dsh-chat-content-width,920px)')

const tailComponent = registered.find(r => r.options.key === 'turn-tail').component
const tailText = toText(tailComponent({ useChat, useProjection, node: settledNode(), t: (k) => k }))
check('轮末统计行含轮号/token/缓存/模型',
  /第2轮 · 耗时1分00秒 · 首字0\.3s · 5,000 token · 60 tok\/s · 缓存95\.80% · deepseek-v4\.1-flash/.test(tailText), tailText)

// 结束：回合成 closed、step settled → 行必须**保留**，主栏变静态、牌面回叠
turnLoc.status = 'closed'
turnLoc.end = { time: 61000 }
sourceData = [STEP_SETTLED]
const out2 = render()
check('回合结束后仍常驻显示', !!(out2 && findEl(out2, cls('ccg-turn-wrap'))), out2)
check('结束后主栏为静态（data-tf-turn-bar=closed + 非 button 的运行标记）',
  !!findEl(out2, (n) => n.props && n.props['data-tf-turn-bar'] === 'closed'))
check('结束后齿轮仍在（设置面板可用）', !!findEl(out2, cls('ccg-gear-button')))
check('结束后牌面回落到静态 mask 牌堆（ccg-poker-card ×3 + mask ×3，无 SMIL 旋转）', (() => {
  const svg = findEl(out2, (n) => n.props && typeof n.props.dangerouslySetInnerHTML === 'object'
    && /ccg-poker-card/.test(n.props.dangerouslySetInnerHTML.__html))
  if (!svg) return false
  const html = svg.props.dangerouslySetInnerHTML.__html
  return (html.match(/class="ccg-poker-card"/g) || []).length === 3
    && (html.match(/<mask/g) || []).length === 3
    && !/axis-spin-card/.test(html)
})(), null)
const text2 = toText(out2)
check('结束后显示结算值（耗时吃 turn.end=1分0秒）',
  /耗时1分0秒/.test(text2) && /5,000 token/.test(text2), text2)

// 工具执行阶段（无 running step）：仍显示累计值
turnLoc.status = 'open'
sourceData = [STEP_SETTLED]
const out3 = render()
check('工具执行阶段（无 running step）仍显示累计值', out3 !== null && /5,000 token/.test(toText(out3)), toText(out3))

// ---------- 轮末统计行（回合结束后的①） ----------
function settledNode() {
  return {
    location: { kind: 'turn', turn: { turn: 2, status: 'closed', start: { time: 1000 }, end: { time: 61000 } } },
    data: {
      turn: 2,
      tokenUsage: {
        totalTokens: 5000, outputTokens: 240, cacheReadTokens: 4560,
        routes: [{ model: 'deepseek-v4.1-flash' }],
      },
    },
  }
}

// ---------- 齿轮设置面板（点击齿轮 → 弹出与 turn-fold 同一个面板） ----------
const gear = findEl(out2, cls('ccg-gear-button'))
check('齿轮可点击（有 onClick）', gear && typeof gear.props.onClick === 'function')
let popupAfterClick = null
try {
  gear.props.onClick()
  popupAfterClick = __api.popup()
} catch (e) { popupAfterClick = { error: String(e && e.message) } }
check('点击后打开共享面板状态', !!(popupAfterClick && popupAfterClick.open === true), popupAfterClick)

const withPanel = render()
check('打开后渲染出 ccg-gear-overlay + ccg-gear-popup（设置面板）',
  !!findEl(withPanel, cls('ccg-gear-overlay')) && !!findEl(withPanel, cls('ccg-gear-popup')))
const panelFields = allEls(withPanel, cls('ccg-gear-popup-field'))
check('面板含 5 个字段开关（耗时/首字/token/tok-s/缓存）', panelFields.length === 5, panelFields.length)
check('面板含图标风格选择（poker / native）',
  allEls(withPanel, cls('ccg-gear-icon-option')).length >= 2,
  allEls(withPanel, cls('ccg-gear-icon-option')).length)
// 关掉面板再验证字段开关（避免把面板文案算进栏文本）
__api.setPopup(false)
const setFieldVisible = __api.setField
setFieldVisible('ttft', false)
const hidden = toText(render())
check('关掉「首字」后该字段消失', !/首字/.test(hidden), hidden)
setFieldVisible('ttft', true)
check('再打开「首字」后回来', /首字/.test(toText(render())))
// 再验一次「Token」字段：关掉后不应再出现 token 计数
setFieldVisible('tokens', false)
const noTok = toText(render())
check('关掉 Token 字段后不再显示 token 计数', !/5,000 token/.test(noTok), noTok)
setFieldVisible('tokens', true)
check('恢复 Token 字段', /5,000 token/.test(toText(render())))
// 图标风格：native 时牌面换成官方风格箭头（不再有扑克牌）
const setIconStyle = __api.setIconStyle
setIconStyle('native')
const native = render()
check('切到 native 后牌面图标消失', !findEl(native, cls('ccg-poker-icon')), null)
setIconStyle('poker')
check('切回 poker 后牌面回来', !!findEl(render(), cls('ccg-poker-icon')))

// ---------- 位置开关（用独立的假宿主环境，避免第二次 apply 被已安装守卫挡住） ----------
function freshInstall(localValue) {
  const src2 = readFileSync(new URL('../client.js', import.meta.url), 'utf8')
  const savedWindow = globalThis.window
  const savedDocument = globalThis.document
  const reg2 = []
  globalThis.window = {
    __ModuleLoader__: { load: (d) => { globalThis.__def2 = d } },
    localStorage: { getItem: () => localValue },
  }
  globalThis.document = { documentElement: { lang: 'zh-CN' } }
  new Function(src2)()
  const ex2 = globalThis.__def2.factory(n => (n === 'react' ? react : null))
  ex2.apply({
    inject: (d, fn) => fn({ slots: { entries: () => [], inject: (n, f) => { const x = f(); return typeof x === 'function' ? x : () => {} }, register: (o, c) => { reg2.push({ o, c }); return () => {} } } }),
    on: () => () => {},
  })
  globalThis.window = savedWindow
  globalThis.document = savedDocument
  return reg2.find(r => r.o.id === 'turn-stats-footer')
}

check('设置 dock → 改挂输入框下方统计带',
  freshInstall('dock')?.o.name === 'conversation.composer.dock', freshInstall('dock')?.o.name)
check('设置 0 → 关闭该行（不注册 entry）', freshInstall('0') === undefined, freshInstall('0')?.o.name)
check('缺省 → 状态行区域', freshInstall(null)?.o.name === 'conversation.input.dock', freshInstall(null)?.o.name)

// ---------- 兜底路径 ----------
check('无快照面时，仅 durable 投影也能常驻显示', (() => {
  const out = composer({
    useConversation: () => undefined,
    useProjection: () => ({ turns: { 7: { ttftMs: 1200, decodeMs: 1000, decodeTokens: 300 } } }),
    t: (k) => k,
  })
  return !!findEl(out, cls('ccg-turn-wrap')) && /第7轮/.test(toText(out))
})(), null)

check('快照回落路径：locations.getTurn 数组也能出轮号', (() => {
  const out = composer({
    useConversation: (sel) => sel({ locations: { getTurn: () => [{ turn: 9, status: 'open', start: { time: 1000 } }] } }),
    useProjection: () => ({ turns: {} }),
    t: (k) => k,
  })
  return out !== null && /耗时/.test(toText(out))
})(), null)

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILED`)
process.exit(failures === 0 ? 0 : 1)
