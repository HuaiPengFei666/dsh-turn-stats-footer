// dsh-turn-stats-footer —— 每轮统计行的两处落点。
//
// ① 轮末统计行（本插件最初的形态）：
//    形态：第2轮 · 耗时20分4秒 · 首字2.5s · 4,980,464 token · 71 tok/s · 缓存97.70% · GLM-5.3
//    机制：以 priority -1 shadow 官方 conversation.chat.node 的 "turn-tail" 渲染器
//    （与 @winteries/dsh-turn-fold shadow "turn-process" 同一手法，key 不同互不冲突）。
//
// ② 输入框上方「执行中…/用时 N 秒」状态行区域的常驻「本轮」行
//    （2026-10-09 用户需求：跑着要有、跑完也要有，位置就在状态行那一行，不是输入框下方统计带）：
//    机制：向 conversation.input.dock 追加一个独立 entry（id 自取，官方状态行不受影响）。
//    显示内容 = 当前回合的同口径统计，**常驻**：
//      · 回合运行中 → 每秒刷新（耗时吃实时墙钟）
//      · 回合结束   → 保留结算值（耗时吃 TurnLocation.end）
//    口径（与 turn-fold 回合栏同一套真实数据）：
//      · 耗时 = turn/start → now（运行中）/ turn/end（已结束）
//      · 首字/ token / tok/s = assistant-step 的 usage.outputTokens 与
//        finalNode.timing（stepStartTime→firstTokenTime→completedTime）累加；
//        当前正在跑的 step 一旦拿到 usage/timing 即计入，数字随真实数据增长，
//        绝不伪造增长。整条数据面缺失时该行不渲染（官方 UI 无损）。
//
// 设置：localStorage `dsh-turn-stats-footer:composerLine`
//       缺省 / "input" → conversation.input.dock（状态行那行，用户选定位置）
//       "dock" / "below" → conversation.composer.dock（输入框下方统计带）
//       "0" / "off" / false → 关闭②，只留轮末①。
//
// 对齐（2026-10-09 二次修正）：② 的宽度必须与顶部 turn-fold 回合栏一致 ——
//   官方 transcript 节点是 `._1kaiZa_column{max-width:var(--dsh-chat-content-width);width:100%;margin:0 auto}`
//   这一层列盒子（回合栏就落在它里面）；而 ② 所在的 input.dock 容器是整条面板宽度
//   （截图实测：它的内容盒与 `._1kaiZa_scroll` 的内容盒同宽同位）。
//   所以这里自己套一层同款列盒子，左/右缩进才会与顶部回合栏重合。
//   localStorage `dsh-turn-stats-footer:align`：缺省/"content" → 聊天内容列（= 顶部回合栏）；
//   "card"/"composer" → 输入框卡片宽；"pane"/"full" → 整条面板（不给缩进）。
//
// 安全性：所有宿主交互三态探测 + 静默降级；任何异常不外泄、不影响官方渲染器。

(function () {
	if (typeof window === "undefined" || !window.__ModuleLoader__) return;
	window.__ModuleLoader__.load({
		id: "dsh-turn-stats-footer",
		factory: function (require) {
			"use strict";
			var module = { exports: {} };
			var exports = module.exports;

			// ---- React（宿主模块系统提供） ----
			var react = require("react");
			var useSyncExternalStore = react.useSyncExternalStore;

			function subscribeNothing() { return function () {}; }
			function getUndefinedSnapshot() { return undefined; }

			// ---- turn-fold 原样移植：样式表 + 组件 ----------------
			var TF_CSS = ".ccg-turn-wrap{display:flex;flex-direction:column;min-width:0}\n.ccg-turn-row{display:flex;align-items:center;gap:2px;width:100%;min-width:0}\n.ccg-turn-bar-main{flex:1 1 auto;display:flex;align-items:center;gap:6px;min-width:0;background:none;border:none;padding:0;margin:0;font:inherit;font-size:14px;line-height:24px;color:var(--dsw-alias-label-secondary,#9ca3af);cursor:pointer;text-align:left}\n.ccg-turn-bar-main:hover:not([data-tf-static]):not([data-tf-running]){color:var(--dsw-alias-label-primary,#1f2328)}\n.ccg-turn-bar-main[data-tf-static],.ccg-turn-bar-main[data-tf-running]{cursor:default}\n.ccg-turn-bar-label{flex:1 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}\n.ccg-turn-bar-status{flex:none;color:inherit}\n.ccg-turn-bar-status.ccg-turn-status-failed{color:var(--dsw-alias-state-error-primary,#ef4444)}\n.ccg-turn-bar-right{flex:none;display:inline-flex;align-items:center;gap:8px;white-space:nowrap}\n.ccg-gear-button{flex:none;display:inline-flex;align-items:center;justify-content:center;width:22px;height:24px;background:none;border:none;padding:0;margin:0;cursor:pointer;color:var(--dsw-alias-label-tertiary,#9ca3af);border-radius:4px;transition:color .15s ease}\n.ccg-gear-button:hover{color:var(--dsw-alias-label-primary,#1f2328)}\n.ccg-gear-button svg{transition:transform .45s cubic-bezier(.22,1,.36,1)}\n.ccg-gear-button:hover svg{transform:rotate(90deg)}\n.ccg-gear-button:focus-visible{outline:1px solid var(--dsw-alias-brand-primary,#4f6ef7)}\n@media (prefers-reduced-motion:reduce){.ccg-gear-button svg{transition:none!important}}\n.ccg-turn-divider{height:1px;flex:none;background:var(--dsw-alias-line-secondary,var(--dsw-alias-border-l1,#d1d5db));margin:4px 0 8px}\n.ccg-poker-icon{display:inline-flex;align-items:center;justify-content:center;position:relative;width:24px;height:24px;flex:none;color:var(--dsw-alias-label-secondary,#9ca3af)}\n.ccg-poker-svg{display:flex;align-items:center}\n.ccg-poker-motion,.ccg-poker-mask-card{transition:transform .45s cubic-bezier(.22,1,.36,1)}\n.ccg-poker-icon .ccg-axis-rest-rotation{transform-box:view-box;transform:rotate(0deg);transition:transform .45s cubic-bezier(.22,1,.36,1)}\n.ccg-poker-icon[data-spin-open] .ccg-axis-rest-rotation{transform:rotate(35.5377deg)}\n.anim-card{fill:transparent}\n.ccg-roll-cell{display:inline-block;width:1ch;height:1em;overflow:hidden;vertical-align:-0.15em;text-align:center}\n.ccg-roll-strip{display:flex;flex-direction:column}\n.ccg-roll-strip .ccg-roll-d{flex:none;width:1ch;height:1em;line-height:1em;text-align:center}\n.ccg-roll-text{display:inline}\n.ccg-sr-only{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap;border:0}\n.ccg-gear-overlay{position:fixed;inset:0;z-index:10000;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.32);animation:ccg-gear-fade .15s ease-out}\n.ccg-gear-popup{background:var(--dsw-alias-bg-layer-2,#ffffff);border:1px solid var(--dsw-alias-border-l2,#e5e7eb);border-radius:12px;box-shadow:0 8px 24px rgba(0,0,0,.14);padding:16px 18px;min-width:320px;max-width:400px;font-size:13px;line-height:1.5;color:var(--dsw-alias-label-primary,#1f2328)}\n.ccg-gear-popup:focus{outline:none}\n.ccg-gear-popup:focus-visible{outline:1px solid var(--dsw-alias-brand-primary,#4f6ef7)}\n.ccg-gear-popup-title{font-weight:600;font-size:14px;margin-bottom:4px}\n.ccg-gear-popup-hint{font-size:12px;color:var(--dsw-alias-label-tertiary,#9ca3af);margin-bottom:10px}\n.ccg-gear-popup-fields{display:flex;flex-direction:column;gap:2px}\n.ccg-gear-popup-field{display:flex;align-items:center;gap:8px;padding:4px 2px;cursor:pointer;border-radius:6px;color:var(--dsw-alias-label-primary,#1f2328)}\n.ccg-gear-popup-field:hover{background:var(--dsw-alias-bg-layer-3,#f3f4f6)}\n.ccg-gear-popup-field input[type=checkbox]{margin:0;flex:none;accent-color:var(--dsw-alias-brand-primary,#4f6ef7);cursor:pointer}\n.ccg-gear-popup-field label{flex:1;cursor:pointer;user-select:none;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}\n.ccg-gear-popup-field-desc{flex:none;font-size:11px;color:var(--dsw-alias-label-tertiary,#9ca3af)}\n.ccg-gear-popup-foot{display:flex;justify-content:flex-end;gap:8px;margin-top:12px}\n.ccg-gear-popup-btn{background:var(--dsw-alias-button-primary-fill,var(--dsw-alias-brand-primary,#4f6ef7));color:var(--dsw-alias-label-primary-foreground,#fff);border:none;border-radius:14px;padding:4px 14px;font-size:12px;line-height:18px;cursor:pointer}\n.ccg-gear-popup-btn:hover{background:var(--dsw-alias-button-primary-hover,var(--dsw-alias-brand-primary,#4f6ef7))}\n.ccg-gear-divider{height:1px;background:var(--dsw-alias-border-l2,#e5e7eb);margin:10px 0 8px}\n.ccg-gear-icon-selector{margin-bottom:2px}\n.ccg-gear-icon-selector-label{font-size:12px;font-weight:600;margin-bottom:6px;color:var(--dsw-alias-label-secondary,#6b7280)}\n.ccg-gear-icon-option{display:flex;align-items:center;gap:10px;padding:6px 8px;cursor:pointer;border-radius:8px;border:1.5px solid transparent;transition:border-color .15s ease,background .15s ease;margin-bottom:4px}\n.ccg-gear-icon-option:hover{background:var(--dsw-alias-bg-layer-3,#f3f4f6)}\n.ccg-gear-icon-option[data-selected]{border-color:var(--dsw-alias-brand-primary,#4f6ef7);background:var(--dsw-alias-bg-layer-3,#f3f4f6)}\n.ccg-gear-icon-option-text{flex:1;min-width:0}\n.ccg-gear-icon-option-title{font-size:13px;font-weight:500;line-height:1.3;color:var(--dsw-alias-label-primary,#1f2328)}\n.ccg-gear-icon-option-desc{font-size:11px;color:var(--dsw-alias-label-tertiary,#9ca3af)}\n.ccg-gear-icon-option-preview{flex:none;display:flex;align-items:center;gap:3px;color:var(--dsw-alias-label-secondary,#9ca3af)}\n.ccg-gear-icon-option-preview-item{flex:none;display:flex;align-items:center;justify-content:center;width:22px;height:24px}\n.ccg-gear-icon-option-preview-item svg{width:20px;height:20px}\n.ccg-gear-icon-option-preview-item .ccg-poker-icon{width:20px;height:20px}\n.ccg-preview-tooltip{position:relative;display:inline-flex}\n.ccg-preview-bubble{position:absolute;bottom:calc(100% + 8px);left:50%;transform:translateX(-50%) translateY(3px);z-index:11000;pointer-events:none;opacity:0;visibility:hidden;transition:opacity .12s ease,transform .12s ease}\n.ccg-preview-tooltip:hover .ccg-preview-bubble,.ccg-preview-tooltip:focus-within .ccg-preview-bubble{opacity:1;visibility:visible;transform:translateX(-50%) translateY(0)}\n.ccg-preview-bubble-body{background:var(--dsw-alias-bg-layer-2,#ffffff);border:1px solid var(--dsw-alias-border-l2,#e5e7eb);border-radius:10px;box-shadow:0 8px 24px rgba(0,0,0,.16);padding:14px;display:flex;align-items:center;justify-content:center;color:var(--dsw-alias-label-secondary,#9ca3af)}\n.ccg-preview-bubble-body svg{width:80px;height:80px;display:block}\n.ccg-preview-bubble-body .ccg-poker-icon{width:80px;height:80px}\n@media (prefers-reduced-motion:reduce){.ccg-preview-bubble{transition:none!important}}\n[data-tf-legacy-step=node]{display:flex;flex-direction:column;min-width:0}\n[data-tf-legacy-step=header] button{display:flex;align-items:center;gap:6px;width:100%;min-width:0;background:none;border:none;padding:0;margin:0;font:inherit;font-size:14px;line-height:24px;color:var(--dsw-alias-label-secondary,#9ca3af);cursor:pointer;text-align:left}\n[data-tf-legacy-step=header] button:hover{color:var(--dsw-alias-label-primary,#1f2328)}\n[data-tf-legacy-title]{flex:1 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}\n[data-tf-legacy-step=member][data-tf-legacy-hidden=true]{display:none}\n@media (prefers-reduced-motion:reduce){[data-tf-legacy-step=member]{display:none!important}}\n@keyframes ccg-gear-fade{from{opacity:0}to{opacity:1}}\n@media (prefers-reduced-motion:reduce){.ccg-gear-overlay{animation:none!important}}\n@media (prefers-reduced-motion:reduce){.ccg-roll-strip{transition:none!important}}";
// ============================================================================
// 以下整段来自 @winteries/dsh-turn-fold client.js（原样移植，仅去掉 Step 皮/官方 slot 注册等
// 与本插件无关的部分）。目的：本插件的「本轮」行与它**完全同源同貌**——同一套 CSS 类、
// 同一个扑克牌渲染器（含 mask 遮挡开合动画）、同一个齿轮设置面板与同一份设置存储
// （localStorage `dsh-turn-fold:settings`，两处开关联动）。
// 图标数据取自包内 icons/default.json（唯一真源）。
// ============================================================================
var TF = (function () {
var ICON_DEFAULTS = {"meta":{"version":1,"description":"dsh-turn-fold 图标唯一数据源","compat":">=0.3.1"},"pokerR":1.08,"pokerPips":{"spade":{"path":"<path d=\"M12 2.35 C10.25 5.05 4.15 8.65 4.15 13.05 C4.15 15.65 6.05 17.35 8.45 17.35 C9.75 17.35 10.75 16.82 11.35 15.88 C11.28 18.05 10.55 19.48 8.55 21.45 H15.45 C13.45 19.48 12.72 18.05 12.65 15.88 C13.25 16.82 14.25 17.35 15.55 17.35 C17.95 17.35 19.85 15.65 19.85 13.05 C19.85 8.65 13.75 5.05 12 2.35 Z\" fill=\"currentColor\"/>","cx":12,"cy":12,"factor":1},"heart":{"path":"<path d=\"M12 21.25 C10.35 19.35 4 15.1 4 9.65 C4 6.55 6.1 4.4 8.75 4.4 C10.25 4.4 11.35 5.18 12 6.45 C12.65 5.18 13.75 4.4 15.25 4.4 C17.9 4.4 20 6.55 20 9.65 C20 15.1 13.65 19.35 12 21.25 Z\" fill=\"currentColor\"/>","cx":12,"cy":12,"factor":1},"diamond":{"path":"<path d=\"M12 2.45 L20.1 12 L12 21.55 L3.9 12 Z\" fill=\"currentColor\"/>","cx":12,"cy":12,"factor":1},"club":{"path":"<circle cx=\"12\" cy=\"7.05\" r=\"4.15\" fill=\"currentColor\"/><circle cx=\"7.45\" cy=\"14.05\" r=\"4.15\" fill=\"currentColor\"/><circle cx=\"16.55\" cy=\"14.05\" r=\"4.15\" fill=\"currentColor\"/><path d=\"M10.25 13.65 C10.85 16.55 10.7 18.7 8.45 21.45 H15.55 C13.3 18.7 13.15 16.55 13.75 13.65 Z\" fill=\"currentColor\"/>","cx":12,"cy":12,"factor":1}},"pokerSVGBase":{"hThree":8.5,"hFive":8,"pokerRatio":0.7142857142857143,"pipScaleThree":0.28,"pipScaleFive":0.24},"pokerTransforms":{"stack3":{"1":"translate(1, 2.25)","2":"translate(0, 0.25)","3":"translate(-1, -1.75)"},"stack5":{"1":"translate(1.6, 1.6)","2":"translate(0.8, 0.8)","3":"translate(0, 0)","4":"translate(-0.8, -0.8)","5":"translate(-1.6, -1.6)"},"fan3":{"1":"translate(0, -0.18) rotate(-26 8 12)","2":"translate(0, -0.18)","3":"translate(0, -0.18) rotate(26 8 12)"},"fan5":{"1":"translate(0, -0.608) rotate(-32 8 12)","2":"translate(0, -0.608) rotate(-16 8 12)","3":"translate(0, -0.608)","4":"translate(0, -0.608) rotate(16 8 12)","5":"translate(0, -0.608) rotate(32 8 12)"}},"pokerSpin":{"h":9.6,"pokerRatio":0.7142857142857143,"r":1.296,"pipScale":0.2347826086956522,"strokeW":0.84,"restAngle":35.5377,"scaleKeys":"1 1;0.996195 1;0.984808 1;0.965926 1;0.939693 1;0.906308 1;0.866025 1;0.819152 1;0.766044 1;0.707107 1;0.642788 1;0.573576 1;0.5 1;0.422618 1;0.34202 1;0.258819 1;0.173648 1;0.087156 1;0 1;-0.087156 1;-0.173648 1;-0.258819 1;-0.34202 1;-0.422618 1;-0.5 1;-0.573576 1;-0.642788 1;-0.707107 1;-0.766044 1;-0.819152 1;-0.866025 1;-0.906308 1;-0.939693 1;-0.965926 1;-0.984808 1;-0.996195 1;-1 1;-0.996195 1;-0.984808 1;-0.965926 1;-0.939693 1;-0.906308 1;-0.866025 1;-0.819152 1;-0.766044 1;-0.707107 1;-0.642788 1;-0.573576 1;-0.5 1;-0.422618 1;-0.34202 1;-0.258819 1;-0.173648 1;-0.087156 1;0 1;0.087156 1;0.173648 1;0.258819 1;0.34202 1;0.422618 1;0.5 1;0.573576 1;0.642788 1;0.707107 1;0.766044 1;0.819152 1;0.866025 1;0.906308 1;0.939693 1;0.965926 1;0.984808 1;0.996195 1;1 1","scaleKeyTimes":"0;0.013889;0.027778;0.041667;0.055556;0.069444;0.083333;0.097222;0.111111;0.125;0.138889;0.152778;0.166667;0.180556;0.194444;0.208333;0.222222;0.236111;0.25;0.263889;0.277778;0.291667;0.305556;0.319444;0.333333;0.347222;0.361111;0.375;0.388889;0.402778;0.416667;0.430556;0.444444;0.458333;0.472222;0.486111;0.5;0.513889;0.527778;0.541667;0.555556;0.569444;0.583333;0.597222;0.611111;0.625;0.638889;0.652778;0.666667;0.680556;0.694444;0.708333;0.722222;0.736111;0.75;0.763889;0.777778;0.791667;0.805556;0.819444;0.833333;0.847222;0.861111;0.875;0.888889;0.902778;0.916667;0.930556;0.944444;0.958333;0.972222;0.986111;1"},"pokerSpinDeepseek":"<path id=\"axis-deepseek-UID\" d=\"M23.748 4.482c-.254-.124-.364.113-.512.234-.051.039-.094.09-.137.136-.372.397-.806.657-1.373.626-.829-.046-1.537.214-2.163.848-.133-.782-.575-1.248-1.247-1.548-.352-.156-.708-.311-.955-.65-.172-.241-.219-.51-.305-.774-.055-.16-.11-.323-.293-.35-.2-.031-.278.136-.356.276-.313.572-.434 1.202-.422 1.84.027 1.436.633 2.58 1.838 3.393.137.093.172.187.129.323-.082.28-.18.552-.266.833-.055.179-.137.217-.329.14a5.526 5.526 0 0 1-1.736-1.18c-.857-.828-1.631-1.742-2.597-2.458a11.365 11.365 0 0 0-.689-.471c-.985-.957.13-1.743.388-1.836.27-.098.093-.432-.779-.428-.872.004-1.67.295-2.687.684a3.055 3.055 0 0 1-.465.137 9.597 9.597 0 0 0-2.883-.102c-1.885.21-3.39 1.102-4.497 2.623C.082 8.606-.231 10.684.152 12.85c.403 2.284 1.569 4.175 3.36 5.653 1.858 1.533 3.997 2.284 6.438 2.14 1.482-.085 3.133-.284 4.994-1.86.47.234.962.327 1.78.397.63.059 1.236-.03 1.705-.128.735-.156.684-.837.419-.961-2.155-1.004-1.682-.595-2.113-.926 1.096-1.296 2.746-2.642 3.392-7.003.05-.347.007-.565 0-.845-.004-.17.035-.237.23-.256a4.173 4.173 0 0 0 1.545-.475c1.396-.763 1.96-2.015 2.093-3.517.02-.23-.004-.467-.247-.588zM11.581 18c-2.089-1.642-3.102-2.183-3.52-2.16-.392.024-.321.471-.235.763.09.288.207.486.371.739.114.167.192.416-.113.603-.673.416-1.842-.14-1.897-.167-1.361-.802-2.5-1.86-3.301-3.307-.774-1.393-1.224-2.887-1.298-4.482-.02-.386.093-.522.477-.592a4.696 4.696 0 0 1 1.529-.039c2.132.312 3.946 1.265 5.468 2.774.868.86 1.525 1.887 2.202 2.891.72 1.066 1.494 2.082 2.48 2.914.348.292.625.514.891.677-.802.09-2.14.11-3.054-.614zm1-6.44a.306.306 0 0 1 .415-.287.302.302 0 0 1 .2.288.306.306 0 0 1-.31.307.303.303 0 0 1-.304-.308zm3.11 1.596c-.2.081-.399.151-.59.16a1.245 1.245 0 0 1-.798-.254c-.274-.23-.47-.358-.552-.758a1.73 1.73 0 0 1 .016-.588c.07-.327-.008-.537-.239-.727-.187-.156-.426-.199-.688-.199a.559.559 0 0 1-.254-.078.253.253 0 0 1-.114-.358c.028-.054.16-.186.192-.21.356-.202.767-.136 1.146.016.352.144.618.408 1.001.782.391.451.462.576.685.914.176.265.336.537.445.848.067.195-.019.354-.25.452z\"/>"};
		function currentLocale() {
			var lang = "";
			try {
				if (typeof document !== "undefined" && document.documentElement && document.documentElement.lang) {
					lang = document.documentElement.lang;
				}
			} catch (e) { /* 忽略 */ }
			if (!lang && typeof navigator !== "undefined" && navigator) {
				var langList = (navigator.languages && navigator.languages.length ? navigator.languages : [navigator.language]);
				for (var li = 0; li < langList.length; li++) {
					if (langList[li] && String(langList[li]).indexOf("zh") !== -1) { lang = "zh"; break; }
				}
			}
			return String(lang).toLowerCase().indexOf("zh") !== -1 ? "zh" : "en";
		}
		var TEXTS = {
			zh: {
				ariaTurn: "展开回合",
				ariaTurnExpanded: "折叠回合",
				statusStopped: "已停止",
				statusFailed: "运行失败",
				statusInterrupted: "已中断",
				// 回合折叠栏字段设置弹窗
				fieldSettings: "回合折叠栏字段",
				fieldSettingsHint: "选择要在回合折叠栏中显示的字段",
				fieldDuration: "耗时",
				fieldDurationDesc: "回合总时长",
				fieldTtft: "首字",
				fieldTtftDesc: "TTFT 首字延迟",
				fieldTokens: "Token",
				fieldTokensDesc: "官方计费 token 总数",
				fieldTps: "tok/s",
				fieldTpsDesc: "生成速率",
				fieldCacheHit: "缓存命中",
				fieldCacheHitDesc: "缓存命中百分比",
				fieldSettingsDone: "完成",
				// 统一折叠栏图标模式（Turn 前导图标 + Step 皮共用一个设置）
				foldIconLabel: "折叠栏图标",
				foldIconPoker: "动态扑克牌",
				foldIconPokerDesc: "回合栏与步骤栏使用扑克牌动画",
				foldIconNative: "官方图标",
				foldIconNativeDesc: "回合栏使用官方折叠箭头风格，步骤栏恢复官方活动图标",
			},
			en: {
				ariaTurn: "Expand turn",
				ariaTurnExpanded: "Collapse turn",
				statusStopped: "Stopped",
				statusFailed: "Failed",
				statusInterrupted: "Interrupted",
				// Turn fold bar field settings popup
				fieldSettings: "Turn bar fields",
				fieldSettingsHint: "Choose which fields to show on the turn bar",
				fieldDuration: "Duration",
				fieldDurationDesc: "Turn elapsed time",
				fieldTtft: "TTFT",
				fieldTtftDesc: "Time to first token",
				fieldTokens: "Tokens",
				fieldTokensDesc: "Official billed token total",
				fieldTps: "tok/s",
				fieldTpsDesc: "Generation rate",
				fieldCacheHit: "Cache hit",
				fieldCacheHitDesc: "Cache hit percentage",
				fieldSettingsDone: "Done",
				// Unified fold-icon mode (one setting drives Turn leading icon + Step skin)
				foldIconLabel: "Fold icons",
				foldIconPoker: "Poker",
				foldIconPokerDesc: "Turn and Step bars use the poker animation",
				foldIconNative: "Native",
				foldIconNativeDesc: "Turn keeps enhanced fields with an official-style chevron; Step restores official activity icons",
			}
		};
		function _T(key) {
			var dict = TEXTS[currentLocale()] || TEXTS.en;
			return dict[key] !== undefined ? dict[key] : key;
		}
		var react = require("react");
		var useSyncExternalStore = react.useSyncExternalStore;
		var NOTICE_VERSION = "0.5.4";
		function NativeChevronIcon(props) {
			var open = props.open === true;
			return react.createElement("svg", {
				viewBox: "0 0 16 16",
				width: props.size || 14,
				height: props.size || 14,
				fill: "none",
				stroke: "currentColor",
				strokeWidth: props.strokeWidth || 1,
				strokeLinecap: "round",
				strokeLinejoin: "round",
				"aria-hidden": "true",
				style: props.open === undefined ? undefined : {
					transform: open ? "rotate(180deg)" : undefined,
					transition: "transform 100ms ease"
				}
			},
				// 官方 down 折线（展开由 rotate(180deg) 翻成向上，与官方 CSS 同机制）
				react.createElement("path", { d: "M4 6L7.29289 9.29289C7.68342 9.68342 8.31658 9.68342 8.70711 9.29289L12 6" })
			);
		}
		var SETTINGS_KEY = "dsh-turn-fold:settings";
		var FIELD_DEFAULTS = { duration: true, ttft: true, tokens: true, tokensPerSecond: true, cacheHit: true };
		var ICON_STYLES = ["poker", "native"];
		var settings = { fields: Object.assign({}, FIELD_DEFAULTS), iconStyle: "poker" };
		function saveSettings() {
			try {
				var store = typeof window !== "undefined" && window.localStorage;
				if (!store) return;
				// 合并保存：不主动清空用户 localStorage 里的其它未知字段，
				// 只覆盖本插件管理的两个键（fields / iconStyle）。
				var merged = {};
				try {
					var previous = store.getItem(SETTINGS_KEY);
					if (previous) {
						var parsedPrevious = JSON.parse(previous);
						if (parsedPrevious && typeof parsedPrevious === "object") merged = parsedPrevious;
					}
				} catch (e) { /* 旧值损坏：直接覆盖 */ }
				// 旧双字段（foldIcon / stepSkin）在 load 层已迁移进 iconStyle，这里一次性
				// 删除——下一次真实保存后不再永久残留（未知字段保留）。
				delete merged.foldIcon;
				delete merged.stepSkin;
				merged.fields = settings.fields;
				merged.iconStyle = settings.iconStyle;
				store.setItem(SETTINGS_KEY, JSON.stringify(merged));
			} catch (e) { /* 忽略写入失败 */ }
		}
		var fieldVisibilityListeners = new Set();
		var fieldVisibilityVersion = 0;
		function subscribeFieldVisibility(fn) {
			fieldVisibilityListeners.add(fn);
			return function () { fieldVisibilityListeners.delete(fn); };
		}
		function notifyFieldVisibility() {
			fieldVisibilityVersion++;
			var fns = [];
			fieldVisibilityListeners.forEach(function (fn) { fns.push(fn); });
			for (var i = 0; i < fns.length; i++) fns[i]();
		}
		function getFieldVisibilityVersion() { return fieldVisibilityVersion; }
		function setFieldVisible(key, visible) {
			if (!settings.fields.hasOwnProperty(key)) return;
			if (settings.fields[key] === !!visible) return;
			settings.fields[key] = !!visible;
			saveSettings();
			notifyFieldVisibility();
		}
		function useFieldVisibility() {
			useSyncExternalStore(subscribeFieldVisibility, getFieldVisibilityVersion);
			return settings.fields;
		}
		function filterVisibleMetrics(metrics) {
			if (!metrics) return metrics;
			var m = metrics;
			var result = null;
			if (settings.fields.duration) { result = result || {}; result.durationMs = m.durationMs; }
			if (settings.fields.ttft) { result = result || {}; result.ttftMs = m.ttftMs; }
			if (settings.fields.tokens) { result = result || {}; result.tokens = m.tokens; }
			if (settings.fields.tokensPerSecond) { result = result || {}; result.tokensPerSecond = m.tokensPerSecond; }
			if (settings.fields.cacheHit) { result = result || {}; result.cacheHitPercent = m.cacheHitPercent; }
			if (!result) return {};
			if (m.outputTokens !== undefined) result.outputTokens = m.outputTokens;
			return result;
		}
		var iconStyleListeners = new Set();
		var iconStyleVersion = 0;
		function subscribeIconStyle(fn) {
			iconStyleListeners.add(fn);
			return function () { iconStyleListeners.delete(fn); };
		}
		function notifyIconStyle() {
			iconStyleVersion++;
			var fns = [];
			iconStyleListeners.forEach(function (fn) { fns.push(fn); });
			for (var i = 0; i < fns.length; i++) fns[i]();
		}
		function getIconStyleVersion() { return iconStyleVersion; }
		function setIconStyle(style) {
			if (ICON_STYLES.indexOf(style) === -1) return;
			if (settings.iconStyle === style) return;
			settings.iconStyle = style;
			saveSettings();
			applyIconStyle();
			notifyIconStyle();
		}
		function useIconStyle() {
			useSyncExternalStore(subscribeIconStyle, getIconStyleVersion);
			return settings.iconStyle;
		}
		function applyIconStyle() {
			try {
				var native = settings.iconStyle !== "poker";
				if (skinStyleEl !== null) skinStyleEl.disabled = native;
				// 牌数桥样式表同受总闸控制（native = 官方图标原样，桥规则一并停用）
				if (stepCardStyleEl) stepCardStyleEl.disabled = native;
			} catch (e) { /* 忽略 */ }
		}
		var ICONS_STORAGE_KEY = "dsh-turn-fold:icons";
		function loadIconConfig() {
			var fallback = ICON_DEFAULTS || {};
			try {
				// 在浏览器 / jsdom 中用 window.localStorage（Node 无全局 localStorage）
				var storage = typeof window !== "undefined" && window.localStorage;
				if (storage) {
					var raw = storage.getItem(ICONS_STORAGE_KEY);
					if (raw) {
						var parsed = JSON.parse(raw);
						if (parsed && typeof parsed === "object") {
							// compat 校验：图标包声明 ">=x.y.z" 时与插件版本（NOTICE_VERSION）逐段
							// 比较——某段大于即兼容、小于即不兼容、相等继续比下一段。注意不能
							// 逐段只判"小于"：0.4.0 满足 ">=0.3.1"（minor 4>3 已定局，patch 0<1
							// 不能翻案），否则升版后 localStorage 图标包会被误判不兼容。
							var compat = parsed.meta && parsed.meta.compat;
							var ok = true;
							if (typeof compat === "string" && /^>=/.test(compat)) {
								var need = compat.slice(2).split(".").map(Number);
								var have = String(NOTICE_VERSION || "0").split(".").map(Number);
								for (var ci = 0; ci < Math.max(need.length, have.length); ci++) {
									var nv = need[ci] || 0, hv = have[ci] || 0;
									if (hv > nv) break;
									if (hv < nv) { ok = false; break; }
								}
							}
							if (ok) return parsed;
						}
					}
				}
			} catch (e) { /* localStorage 不可用或数据损坏：走内置默认 */ }
			return fallback;
		}
		var iconConfig = loadIconConfig();
		var POKER_PIPS = (iconConfig && iconConfig.pokerPips) || {
			spade: { path: "", cx: 12, cy: 12, factor: 1 },
			heart: { path: "", cx: 12, cy: 12, factor: 1 },
			diamond: { path: "", cx: 12, cy: 12, factor: 1 },
			club: { path: "", cx: 12, cy: 12, factor: 1 }
		};
		var POKER_SPIN_DEEPSEEK = (iconConfig && iconConfig.pokerSpinDeepseek) || "";
		var skinStyleEl = null;
		var liveTickMs = 1000;
		var tickListeners = new Set();
		var tickVersion = 0;
		var tickTimer = null;
		var tickRunning = false;
		function scheduleTick() {
			tickTimer = setTimeout(function () {
				tickTimer = null;
				tickRunning = true;
				tickVersion++;
				// 逐个监听者兜异常：单个订阅者抛错（React 的 uSES 通知链路异常）不能
				// 带走时钟本身——否则耗时秒表静默停死到刷新页面为止。
				// 用 try/finally 保证 tickRunning 一定复位，状态机不会卡在"回调中"。
				try {
					var fns = [];
					tickListeners.forEach(function (fn) { fns.push(fn); });
					for (var i = 0; i < fns.length; i++) {
						try { fns[i](); } catch (errOne) {
							try {
								if (typeof console !== "undefined" && console.warn) {
									console.warn("[dsh-turn-fold] 直播时钟监听者抛错（已跳过该监听者）：", errOne);
								}
							} catch (e) { /* 忽略 */ }
						}
					}
				} finally {
					tickRunning = false;
					// 回调期间无人持有新链，这里按"是否还有订阅者"决定续订——无订阅者即停表。
					if (tickListeners.size > 0 && tickTimer === null) scheduleTick();
				}
			}, liveTickMs);
		}
		function subscribeTicks(fn) {
			tickListeners.add(fn);
			if (tickTimer === null && !tickRunning) scheduleTick();
			return function () {
				tickListeners.delete(fn);
				if (tickListeners.size === 0 && tickTimer !== null) {
					clearTimeout(tickTimer);
					tickTimer = null;
				}
			};
		}
		function subscribeNothing() { return function () {}; }
		function getTickVersion() { return tickVersion; }
		function useLiveNow(active) {
			useSyncExternalStore(active ? subscribeTicks : subscribeNothing, getTickVersion);
			return active ? Date.now() : undefined;
		}
		function cacheHitPercent(uncachedInputTokens, cacheReadTokens, cacheWriteTokens) {
			var denominator = uncachedInputTokens + cacheReadTokens + cacheWriteTokens;
			if (denominator === 0) return null;
			return (cacheReadTokens / denominator * 100).toFixed(2);
		}
		function turnClockOf(node) {
			var loc = node && node.location;
			var turn = loc && (loc.kind === "turn" || loc.kind === "step") ? loc.turn : undefined;
			if (!turn) return null;
			var startMs = turn.start && typeof turn.start.time === "number" ? turn.start.time : undefined;
			var endMs = turn.end && typeof turn.end.time === "number" ? turn.end.time : undefined;
			var reason = turn.end && turn.end.data && turn.end.data.reason && turn.end.data.reason.kind;
			return {
				turn: turn,
				number: turn.turn,
				startMs: startMs,
				endMs: endMs,
				status: turn.status,
				reason: typeof reason === "string" ? reason : undefined,
				/** Turn-scoped 业务数据读取器（官方 ConversationLocationDataStore）。 */
				data: typeof turn.data === "object" && turn.data ? turn.data : null,
				/** 已解析的 Step 定位序列（每步带 data store）。 */
				steps: Array.isArray(turn.steps) ? turn.steps : []
			};
		}
		function stepStartMsOf(clock, stepNo) {
			if (typeof stepNo !== "number") return undefined;
			for (var j = 0; j < clock.steps.length; j++) {
				var loc = clock.steps[j];
				if (loc && loc.step === stepNo) {
					return loc.start && typeof loc.start.time === "number" ? loc.start.time : undefined;
				}
			}
			return undefined;
		}
		function outputTokensOf(usage) {
			if (typeof usage !== "object" || usage === null) return null;
			var v = usage.outputTokens;
			return typeof v === "number" && isFinite(v) && v >= 0 ? v : null;
		}
		function readStepUsage(data, acc, stepStartMs) {
			if (!data || acc.counted.has(data)) return;
			acc.counted.add(data);
			var u = data.usage;
			if (u && typeof u === "object") {
				// 计费输入：官方 wire usage 用 inputTokens；容忍 uncachedInputTokens 命名
				if (typeof u.inputTokens === "number" && isFinite(u.inputTokens)) acc.input += u.inputTokens;
				else if (typeof u.uncachedInputTokens === "number" && isFinite(u.uncachedInputTokens)) acc.input += u.uncachedInputTokens;
				if (typeof u.outputTokens === "number" && isFinite(u.outputTokens)) { acc.output += u.outputTokens; acc.has = true; }
				if (typeof u.cacheReadTokens === "number" && isFinite(u.cacheReadTokens)) { acc.cacheRead += u.cacheReadTokens; acc.has = true; }
				if (typeof u.cacheWriteTokens === "number" && isFinite(u.cacheWriteTokens)) { acc.cacheWrite += u.cacheWriteTokens; acc.has = true; }
			}
			// TTFT 候选（exact 优先，provisional 兜底；step 号最小者生效）
			var candidate = null, exact = false;
			var fn = data.finalNode;
			var timing = fn && fn.timing;
			if (timing && typeof timing.stepStartTime === "number" && typeof timing.firstTokenTime === "number") {
				candidate = Math.max(0, timing.firstTokenTime - timing.stepStartTime);
				exact = true;
			} else if (data.status === "running" && typeof data.time === "number" && data.time > 0
				&& typeof stepStartMs === "number") {
				candidate = Math.max(0, data.time - stepStartMs);
			}
			if (candidate !== null) {
				var stepNum = typeof data.step === "number" ? data.step : -1;
				if (stepNum < acc.ttftStep || (stepNum === acc.ttftStep && exact && !acc.ttftExact)) {
					acc.ttftStep = stepNum;
					acc.ttft = candidate;
					acc.ttftExact = exact;
				}
			}
			// decode 聚合（官方 assistantStepReading 语义）：只计 settled 且
			// firstTokenTime 与 outputTokens 齐备的 step——running/缺一项都不进分母
			if (fn && timing && typeof timing.firstTokenTime === "number" && typeof timing.completedTime === "number") {
				var out = outputTokensOf(fn.usage);
				if (out !== null) {
					acc.decodeMs += Math.max(0, timing.completedTime - timing.firstTokenTime);
					acc.decodeTokens += out;
				}
			}
		}
		var OBSERVED_TTFT_MAX = 500;
		var observedTtft = new Map();
		function observedTtftKey(sessionId, turn) {
			return String(sessionId === undefined ? "" : sessionId) + ":" + String(turn);
		}
		function rememberObservedTtft(sessionId, turn, ms) {
			if (typeof ms !== "number" || !isFinite(ms) || ms < 0 || typeof turn !== "number") return;
			var key = observedTtftKey(sessionId, turn);
			if (observedTtft.has(key)) observedTtft.delete(key);
			observedTtft.set(key, ms);
			while (observedTtft.size > OBSERVED_TTFT_MAX) {
				var oldest = observedTtft.keys().next();
				if (oldest.done) break;
				observedTtft.delete(oldest.value);
			}
		}
		function readObservedTtft(sessionId, turn) {
			if (typeof turn !== "number") return null;
			var value = observedTtft.get(observedTtftKey(sessionId, turn));
			return typeof value === "number" ? value : null;
		}
		function computeTurnMetrics(clock, stepDataList, tail, liveNow, durable, sessionId) {
			if (!clock) return null;
			var durationMs;
			if (typeof clock.startMs === "number") {
				var end = typeof clock.endMs === "number" ? clock.endMs
					: (clock.status !== "closed" && typeof liveNow === "number" ? liveNow : undefined);
				if (typeof end === "number") durationMs = Math.max(0, end - clock.startMs);
			}
			var acc = {
				input: 0, output: 0, cacheRead: 0, cacheWrite: 0, has: false,
				ttft: null, ttftStep: Infinity, ttftExact: false,
				decodeMs: 0, decodeTokens: 0, counted: new Set()
			};
			for (var i = 0; i < stepDataList.length; i++) {
				var sd = stepDataList[i];
				readStepUsage(sd, acc, stepStartMsOf(clock, sd && sd.step));
			}
			var billedInput = acc.input + acc.cacheRead + acc.cacheWrite;
			var hasUsage = acc.has && (billedInput > 0 || acc.output > 0);
			var tokens, outputTokens, cacheHit;
			if (tail && tail.tokenUsage && typeof tail.tokenUsage.totalTokens === "number") {
				// 官方聚合值优先（TurnUsagePanel 同款语义）：totalTokens = 全部 attempt 的
				// 精确 prompt+output；缓存命中率分母 = prompt 侧总量；cacheRead 缺报时
				// 回退 step 累加值。
				tokens = tail.tokenUsage.totalTokens;
				outputTokens = typeof tail.tokenUsage.outputTokens === "number" ? tail.tokenUsage.outputTokens : undefined;
				var promptSide = outputTokens !== undefined ? tokens - outputTokens : undefined;
				cacheHit = typeof tail.tokenUsage.cacheReadTokens === "number" && promptSide > 0
					? (tail.tokenUsage.cacheReadTokens / promptSide * 100).toFixed(2)
					: (hasUsage && billedInput > 0 ? cacheHitPercent(acc.input, acc.cacheRead, acc.cacheWrite) : undefined);
			} else if (hasUsage) {
				// 消耗 = 计费输入（uncached + cacheRead + cacheWrite）+ 输出
				tokens = billedInput + acc.output;
				outputTokens = acc.output;
				cacheHit = billedInput > 0 ? cacheHitPercent(acc.input, acc.cacheRead, acc.cacheWrite) : undefined;
			}
			// decode 证据：durable（官方 projection）优先，客户端 step 聚合兜底
			var decodeMs = acc.decodeMs, decodeTokens = acc.decodeTokens;
			if (durable && (durable.decodeMs > 0 || durable.decodeTokens > 0)) {
				decodeMs = durable.decodeMs;
				decodeTokens = durable.decodeTokens;
			}
			// TTFT：durable exact → 客户端 exact → running provisional → 运行时缓存
			var ttftMs = null;
			if (durable && typeof durable.ttftMs === "number") ttftMs = durable.ttftMs;
			else if (acc.ttft !== null) ttftMs = acc.ttft;
			if (ttftMs === null) ttftMs = readObservedTtft(sessionId, clock.number);
			else rememberObservedTtft(sessionId, clock.number, ttftMs);
			// tok/s：官方 decode-speed 语义（与整个 Turn 墙钟时长无关）
			var tps = decodeMs > 0 ? decodeTokens / (decodeMs / 1000) : undefined;
			if (durationMs === undefined && tokens === undefined && ttftMs === null && tps === undefined) return null;
			var result = { durationMs: durationMs, tokens: tokens, outputTokens: outputTokens, tokensPerSecond: tps, cacheHitPercent: cacheHit };
			if (ttftMs !== null) result.ttftMs = ttftMs;
			return result;
		}
		function formatTurnDuration(ms) {
			var total = Math.floor(ms / 1000);
			if (total >= 3600) {
				var h = Math.floor(total / 3600);
				var m = Math.floor((total % 3600) / 60);
				var s = total % 60;
				if (currentLocale() === "zh") return h + "时" + m + "分" + s + "秒";
				return h + "h " + m + "m " + s + "s";
			}
			if (total >= 60) {
				var mm = Math.floor(total / 60);
				var ss = total % 60;
				if (currentLocale() === "zh") return mm + "分" + ss + "秒";
				return mm + "m " + ss + "s";
			}
			if (currentLocale() === "zh") return total + "秒";
			return total + "s";
		}
		function formatTokPerSec(tps) {
			var v = Math.max(0, tps);
			return v >= 10 ? String(Math.round(v)) : String(Math.round(v * 10) / 10);
		}
		function formatTokenCount(n) {
			if (typeof n !== "number" || !isFinite(n)) return String(n);
			var neg = n < 0 ? "-" : "";
			var digits = String(Math.floor(Math.abs(n)));
			var out = digits.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
			return neg + out;
		}
		function turnHeaderLabel(metrics) {
			if (!metrics) return "";
			var zh = currentLocale() === "zh";
			var parts = [];
			if (metrics.durationMs !== undefined) {
				parts.push(zh ? "耗时" + formatTurnDuration(metrics.durationMs) : formatTurnDuration(metrics.durationMs));
			} else if ("durationMs" in metrics) {
				parts.push(zh ? "耗时—" : "—");
			}
			if (metrics.ttftMs !== undefined) {
				var ttftSec = (metrics.ttftMs / 1000).toFixed(1);
				parts.push(zh ? "首字" + ttftSec + "s" : "TTFT " + ttftSec + "s");
			} else if ("ttftMs" in metrics) {
				parts.push(zh ? "首字—" : "TTFT —");
			}
			if (metrics.tokens !== undefined) {
				parts.push(zh ? formatTokenCount(metrics.tokens) + " token" : formatTokenCount(metrics.tokens) + " tokens");
			} else if ("tokens" in metrics) {
				parts.push(zh ? "— token" : "— tokens");
			}
			if (metrics.tokensPerSecond !== undefined) {
				parts.push(formatTokPerSec(metrics.tokensPerSecond) + (zh ? "tok/s" : " tok/s"));
			} else if ("tokensPerSecond" in metrics) {
				parts.push("— tok/s");
			}
			if (metrics.cacheHitPercent !== undefined) {
				parts.push(zh ? "缓存" + metrics.cacheHitPercent + "%" : "Cache " + metrics.cacheHitPercent + "%");
			} else if ("cacheHitPercent" in metrics) {
				parts.push(zh ? "缓存—" : "Cache —");
			}
			return parts.join(" · ");
		}
		function turnStatusLabel(reason) {
			if (reason === "aborted") return _T("statusStopped");
			if (reason === "error") return _T("statusFailed");
			if (reason === "max-tokens") return _T("statusInterrupted");
			return null;
		}
		function turnRoundLabel(turn) {
			if (turn === undefined || turn === null) return "";
			return currentLocale() === "zh" ? "第" + turn + "轮" : "Turn " + turn;
		}
		var POKER_SUITS = ["spade", "heart", "diamond", "club"];
		function pokerFacePool() {
			return POKER_SPIN_DEEPSEEK ? POKER_SUITS.concat(["deepseek"]) : POKER_SUITS;
		}
		var pokerFaceAssigned = new Map();   // "<sessionKey>|turn:N" → 牌面
		var pokerBags = new Map();           // "<sessionKey>" → { remaining, previous, pool }
		function shufflePokerFaces(faces, random) {
			var rnd = typeof random === "function" ? random : Math.random;
			var out = faces.slice();
			for (var i = out.length - 1; i > 0; i--) {
				var j = Math.floor(rnd() * (i + 1));
				var swap = out[i]; out[i] = out[j]; out[j] = swap;
			}
			return out;
		}
		function nextTurnPokerFace(state, random) {
			var pool = pokerFacePool();
			var signature = pool.join(",");
			if (state.remaining.length === 0 || state.pool !== signature) {
				var shuffled = shufflePokerFaces(pool, random);
				if (shuffled.length > 1 && shuffled[0] === state.previous) {
					for (var k = 1; k < shuffled.length; k++) {
						if (shuffled[k] !== state.previous) {
							var swap = shuffled[0]; shuffled[0] = shuffled[k]; shuffled[k] = swap;
							break;
						}
					}
				}
				state.remaining = shuffled;
				state.pool = signature;
			}
			var face = state.remaining.shift();
			state.previous = face;
			return face;
		}
		function sessionKeyOf(sessionId) {
			return sessionId === undefined || sessionId === null ? "" : String(sessionId);
		}
		function foldSuitFor(sessionId, turn) {
			var sessionKey = sessionKeyOf(sessionId);
			var turnKey = sessionKey + "|turn:" + String(turn);
			if (pokerFaceAssigned.has(turnKey)) return pokerFaceAssigned.get(turnKey);
			var state = pokerBags.get(sessionKey);
			if (!state) {
				state = { remaining: [], previous: undefined, pool: "" };
				pokerBags.set(sessionKey, state);
			}
			var face = nextTurnPokerFace(state, Math.random);
			pokerFaceAssigned.set(turnKey, face);
			return face;
		}
		var POKER_R = (iconConfig && iconConfig.pokerR) || 1.08;  // 圆角半径（真实扑克牌 5:7 比例）
		var pokerSVGSeq = 0;                     // mask id 唯一性计数器
		var POKER_SPIN_REST = (iconConfig && iconConfig.pokerSpin && iconConfig.pokerSpin.restAngle) || 35.5377;   // 竖直对角线轴倾角 ≈ 35.54°
		var POKER_SPIN_H = (iconConfig && iconConfig.pokerSpin && iconConfig.pokerSpin.h) || 9.6;
		var POKER_SPIN_W = POKER_SPIN_H * ((iconConfig && iconConfig.pokerSpin && iconConfig.pokerSpin.pokerRatio) || 0.7142857142857143);                 // ≈ 6.8571（5:7 比例）
		var POKER_SPIN_X = 8 - POKER_SPIN_W / 2;
		var POKER_SPIN_Y = 8 - POKER_SPIN_H / 2;
		var POKER_SPIN_R = (iconConfig && iconConfig.pokerSpin && iconConfig.pokerSpin.r) || 1.296;                                 // 5:7 比例圆角
		var POKER_SPIN_STROKE = 0.84;
		var POKER_SPIN_PIP = (iconConfig && iconConfig.pokerSpin && iconConfig.pokerSpin.pipScale) || 0.2347826086956522;
		var POKER_SPIN_LOGO_SCALE = (Math.min(POKER_SPIN_W * 0.72, POKER_SPIN_H * 0.58)) / 24;
		var POKER_SPIN_SCALE = '1 1;0.996195 1;0.984808 1;0.965926 1;0.939693 1;0.906308 1;0.866025 1;0.819152 1;0.766044 1;0.707107 1;0.642788 1;0.573576 1;0.5 1;0.422618 1;0.34202 1;0.258819 1;0.173648 1;0.087156 1;0 1;-0.087156 1;-0.173648 1;-0.258819 1;-0.34202 1;-0.422618 1;-0.5 1;-0.573576 1;-0.642788 1;-0.707107 1;-0.766044 1;-0.819152 1;-0.866025 1;-0.906308 1;-0.939693 1;-0.965926 1;-0.984808 1;-0.996195 1;-1 1;-0.996195 1;-0.984808 1;-0.965926 1;-0.939693 1;-0.906308 1;-0.866025 1;-0.819152 1;-0.766044 1;-0.707107 1;-0.642788 1;-0.573576 1;-0.5 1;-0.422618 1;-0.34202 1;-0.258819 1;-0.173648 1;-0.087156 1;0 1;0.087156 1;0.173648 1;0.258819 1;0.34202 1;0.422618 1;0.5 1;0.573576 1;0.642788 1;0.707107 1;0.766044 1;0.819152 1;0.866025 1;0.906308 1;0.939693 1;0.965926 1;0.984808 1;0.996195 1;1 1';
		var POKER_SPIN_KEYS = '0;0.013889;0.027778;0.041667;0.055556;0.069444;0.083333;0.097222;0.111111;0.125;0.138889;0.152778;0.166667;0.180556;0.194444;0.208333;0.222222;0.236111;0.25;0.263889;0.277778;0.291667;0.305556;0.319444;0.333333;0.347222;0.361111;0.375;0.388889;0.402778;0.416667;0.430556;0.444444;0.458333;0.472222;0.486111;0.5;0.513889;0.527778;0.541667;0.555556;0.569444;0.583333;0.597222;0.611111;0.625;0.638889;0.652778;0.666667;0.680556;0.694444;0.708333;0.722222;0.736111;0.75;0.763889;0.777778;0.791667;0.805556;0.819444;0.833333;0.847222;0.861111;0.875;0.888889;0.902778;0.916667;0.930556;0.944444;0.958333;0.972222;0.986111;1';
		var pokerSpinSeq = 0;
		var POKER_SPIN_SUIT_VIS = {
			spade:   { initial: "visible", values: "visible;hidden;visible;visible", keyTimes: "0;0.0625;0.9375;1" },
			heart:   { initial: "hidden",  values: "hidden;visible;hidden;hidden",  keyTimes: "0;0.1875;0.3125;1" },
			diamond: { initial: "hidden",  values: "hidden;visible;hidden;hidden",  keyTimes: "0;0.4375;0.5625;1" },
			club:    { initial: "hidden",  values: "hidden;visible;hidden;hidden",  keyTimes: "0;0.6875;0.8125;1" }
		};
		var POKER_SPIN_BACK_VIS = "hidden;visible;hidden;visible;hidden;visible;hidden;visible;hidden;hidden";
		var POKER_SPIN_BACK_KEYS = "0;0.0625;0.1875;0.3125;0.4375;0.5625;0.6875;0.8125;0.9375;1";
		function buildPokerSpinSVG(uid) {
			var faceRect = '<rect class="anim-card axis-spin-card" x="' + POKER_SPIN_X + '" y="' + POKER_SPIN_Y +
				'" width="' + POKER_SPIN_W + '" height="' + POKER_SPIN_H + '" rx="' + POKER_SPIN_R +
				'" stroke="currentColor" stroke-width="' + POKER_SPIN_STROKE + '"/>';
			var deepseek = POKER_SPIN_DEEPSEEK.replace("axis-deepseek-UID", "axis-deepseek-" + uid);
			// 四种花色正面
			var faces = "";
			var suits = ["spade", "heart", "diamond", "club"];
			for (var fi = 0; fi < suits.length; fi++) {
				var suit = suits[fi];
				var info = POKER_PIPS[suit];
				var vis = POKER_SPIN_SUIT_VIS[suit];
				var scale = POKER_SPIN_PIP * info.factor;
				faces += '<g visibility="' + vis.initial + '">' +
					'<animate attributeName="visibility" values="' + vis.values + '" keyTimes="' + vis.keyTimes +
					'" dur="6.4s" repeatCount="indefinite" calcMode="discrete"/>' +
					faceRect +
					'<g transform="translate(8 8) scale(' + scale + ') translate(' + (-info.cx) + ' ' + (-info.cy) + ')">' +
					info.path + '</g></g>';
			}
			return '<svg viewBox="0 0 16 16" width="24" height="24" style="color:var(--dsw-alias-label-secondary,#9ca3af)">' +
				'<defs>' + deepseek + '</defs>' +
				'<g transform="translate(8 8)">' +
				'<g>' +
				'<animateTransform attributeName="transform" type="scale" values="' + POKER_SPIN_SCALE +
				'" keyTimes="' + POKER_SPIN_KEYS + '" dur="1.6s" repeatCount="indefinite" calcMode="linear"/>' +
				'<g class="ccg-axis-rest-rotation" transform="rotate(' + POKER_SPIN_REST + ')">' +
				'<g transform="translate(-8 -8)">' +
				faces +
				'<g visibility="hidden">' +
				'<animate attributeName="visibility" values="' + POKER_SPIN_BACK_VIS +
				'" keyTimes="' + POKER_SPIN_BACK_KEYS + '" dur="6.4s" repeatCount="indefinite" calcMode="discrete"/>' +
				faceRect +
				'<g transform="translate(8 8) scale(' + POKER_SPIN_LOGO_SCALE + ') translate(12 -12) scale(-1 1)">' +
				'<use href="#axis-deepseek-' + uid + '" fill="currentColor"/></g></g>' +
				'</g></g></g></g></svg>';
		}
		function PokerSpinIcon() {
			var uidRef = react.useRef(null);
			if (uidRef.current === null) uidRef.current = "ccg-poker-spin-" + (++pokerSpinSeq);
			var html = react.useMemo(function () { return buildPokerSpinSVG(uidRef.current); }, []);
			return react.createElement("span", { className: "ccg-poker-icon" },
				react.createElement("span", { className: "ccg-poker-svg", dangerouslySetInnerHTML: { __html: html } })
			);
		}
		function pokerDynamicMask(maskId, owner, n, x, y, w, h) {
			var cuts = "";
			for (var j = 1; j <= n; j++) {
				if (j === owner) continue;
				cuts += '<g class="ccg-poker-mask-card" data-i="' + j + '" data-mask-owner="' + owner +
					'" visibility="hidden" transform="translate(0, 0)">' +
					'<rect x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '" rx="' + POKER_R +
					'" fill="black" stroke="black" stroke-width="0.7"/></g>';
			}
			return '<mask id="' + maskId + '" x="-4" y="-4" width="24" height="24" ' +
				'maskUnits="userSpaceOnUse" maskContentUnits="userSpaceOnUse" style="mask-type:luminance">' +
				'<rect x="-4" y="-4" width="24" height="24" fill="white"/>' + cuts + '</mask>';
		}
		function buildPokerSVGBase(count, suit) {
			var five = count > 3;
			// suit = "deepseek"：牌面用 DeepSeek 鲸鱼 Logo（与四花色一起入随机池）。
			// Logo path 与花色同为 24 单位空间、几何中心 (12,12)，无 fill 属性（继承
			// currentColor）；defs 里以每实例唯一 id 注入一次，pip 处 <use> 引用。
			var isLogo = suit === "deepseek" && !!POKER_SPIN_DEEPSEEK;
			var info = isLogo ? { cx: 12, cy: 12, factor: 1 } : (POKER_PIPS[suit] || POKER_PIPS.spade);
			var cfg = iconConfig && iconConfig.pokerSVGBase;
			// 真实扑克牌比例 5:7：高不变，宽 = 高 × 5/7，中心对齐
			var h = five ? (cfg && cfg.hFive) || 8 : (cfg && cfg.hThree) || 8.5;
			var w = h * ((cfg && cfg.pokerRatio) || 0.7142857142857143);
			var x = 8 - w / 2, y = five ? 4 : 3.5;
			var pipScale = (five ? (cfg && cfg.pipScaleFive) || 0.24 : (cfg && cfg.pipScaleThree) || 0.28) * info.factor;
			var n = five ? 5 : 3;
			var seq = (++pokerSVGSeq);
			var maskBase = "ccg-poker-mask-" + seq;
			var logoId = null;
			var defs = "";
			if (isLogo) {
				logoId = "ccg-poker-logo-" + seq;
				defs += POKER_SPIN_DEEPSEEK.replace("axis-deepseek-UID", logoId);
			}
			var parts = [];
			for (var ci = 1; ci <= n; ci++) {
				var mid = maskBase + "-" + ci;
				defs += pokerDynamicMask(mid, ci, n, x, y, w, h);
				var hasPip = five ? (ci === 5 || ci === 3) : (ci === 2 || ci === 3);
				var pip = "";
				if (hasPip) {
					// Logo 不用花色的 pipScale：花色 glyph 的 24 盒自带内边距，而鲸鱼墨迹
					// 几乎填满 24 盒，同 scale 会撑出卡边。按卡牌几何独立取缩放（与翻牌
					// 动画 POKER_SPIN_LOGO_SCALE 同款公式），宽度向约束自然留出描边余量。
					var pipScaleUsed = isLogo ? (Math.min(w * 0.72, h * 0.58) / 24) * info.factor : pipScale;
					var pipInner = isLogo ? '<use href="#' + logoId + '" fill="currentColor"/>' : info.path;
					pip = '<g class="ccg-poker-pip" transform="translate(' + (x + w / 2) + ', ' + (y + h / 2) + ') scale(' + pipScaleUsed + ') translate(' + (-info.cx) + ', ' + (-info.cy) + ')">' + pipInner + '</g>';
				}
				parts.push(
					'<g class="ccg-poker-card" data-i="' + ci + '" data-mask-id="' + mid + '">' +
					'<g class="ccg-poker-motion" transform="translate(0, 0)">' +
					'<rect class="ccg-poker-rect" x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '" rx="' + POKER_R + '" fill="none" stroke="currentColor" stroke-width="0.7"/>' +
					pip + '</g></g>'
				);
			}
			return '<svg viewBox="0 0 16 16" width="24" height="24" style="display:block">' +
				'<defs>' + defs + '</defs>' + parts.join("") + '</svg>';
		}
		function pokerTransforms(count, fan) {
			var five = count > 3;
			var t = (iconConfig && iconConfig.pokerTransforms) || {};
			if (fan) {
				return five
					? t.fan5 || { 1: "translate(0, -0.608) rotate(-32 8 12)", 2: "translate(0, -0.608) rotate(-16 8 12)", 3: "translate(0, -0.608)", 4: "translate(0, -0.608) rotate(16 8 12)", 5: "translate(0, -0.608) rotate(32 8 12)" }
					: t.fan3 || { 1: "translate(0, -0.18) rotate(-26 8 12)", 2: "translate(0, -0.18)", 3: "translate(0, -0.18) rotate(26 8 12)" };
			}
			return five
				? t.stack5 || { 1: "translate(1.6, 1.6)", 2: "translate(0.8, 0.8)", 3: "translate(0, 0)", 4: "translate(-0.8, -0.8)", 5: "translate(-1.6, -1.6)" }
				: t.stack3 || { 1: "translate(1, 2.25)", 2: "translate(0, 0.25)", 3: "translate(-1, -1.75)" };
		}
		function pokerPaintOrder(count) {
			var n = count > 3 ? 5 : 3;
			var order = [];
			for (var i = 1; i <= n; i++) order.push(i);
			return order;
		}
		function PokerIcon(props) {
			var count = props.count, suit = props.suit, open = props.open;
			var svgRef = react.useRef(null);
			// __html 用 useMemo 缓存：栏重渲染（指标刷新、开合切换）时字符串稳定 →
			// React 不重设 innerHTML，layout effect 设置的 transform/mask/visibility 得以
			// 保留；只有 count/suit 变化才重新生成（此时 layout effect 同依赖重跑，
			// 重新应用全部状态）。
			var html = react.useMemo(function () { return buildPokerSVGBase(count, suit); }, [count, suit]);
			react.useLayoutEffect(function () {
				var holder = svgRef.current;
				// svgRef 指向包裹 span；牌张 g 必须在 <svg> 内才会渲染，先定位 svg 元素
				var svg = holder ? holder.querySelector("svg") : null;
				if (!svg) return;
				var five = count > 3;
				var n = five ? 5 : 3;
				// 叠放顺序 = 牌身份序（1 < 2 < 3 / 1 … 5），开合两态一致：
				// stack 的顶牌与 fan 最右的牌是同一张（最大 id），morph 全程不换身份。
				var order = pokerPaintOrder(count);
				// z-order 映射：index 越大越在上（越后画）
				var z = {};
				for (var zi = 0; zi < order.length; zi++) z[order[zi]] = zi;
				var tfs = pokerTransforms(count, !!open);
				// 首次应用（新挂载 / innerHTML 重建后）：模板 transform 是 translate(0,0)，
				// 直接设目标值会从中心"滑入"牌堆（0.45s 内看起来像单张牌）。先禁用过渡
				// 提交最终位姿再恢复 CSS 过渡 → 只有后续 open 切换才播放形变动画。
				var fresh = svg.getAttribute('data-ccg-ready') !== '1';
				if (fresh) {
					var freshEls = svg.querySelectorAll('.ccg-poker-motion,.ccg-poker-mask-card');
					for (var fi = 0; fi < freshEls.length; fi++) freshEls[fi].style.transition = 'none';
				}
				for (var i = 0; i < order.length; i++) {
					var g = svg.querySelector('.ccg-poker-card[data-i="' + order[i] + '"]');
					if (g) svg.appendChild(g);
				}
				// 强制同步布局：DOM 移动后先提交当前样式，transform 变化才能触发 transition
				void svg.getBoundingClientRect();
				// 更新真实牌 + 本牌 mask 的 occluder
				for (var j = 1; j <= n; j++) {
					var card = svg.querySelector('.ccg-poker-card[data-i="' + j + '"]');
					if (!card) continue;
					var motion = card.querySelector('.ccg-poker-motion');
					if (motion) {
						motion.style.transitionDelay = '0ms';
						motion.setAttribute('transform', tfs[j]);
					}
					var mid = card.getAttribute('data-mask-id');
					if (mid) card.setAttribute('mask', 'url(#' + mid + ')');
					var cuts = svg.querySelectorAll('.ccg-poker-mask-card[data-mask-owner="' + j + '"]');
					for (var k = 0; k < cuts.length; k++) {
						var cut = cuts[k];
						var ci = Number(cut.getAttribute('data-i'));
						cut.style.transitionDelay = '0ms';
						cut.setAttribute('transform', tfs[ci]);
						// 只有绘制顺序在 owner 之上的牌（z 更大）才挖空 owner
						cut.setAttribute('visibility', (z[ci] > z[j]) ? 'visible' : 'hidden');
					}
				}
				if (fresh) {
					// 无过渡地提交最终位姿后恢复 CSS 过渡（后续 open 切换正常动画）
					svg.setAttribute('data-ccg-ready', '1');
					void svg.getBoundingClientRect();
					var restored = svg.querySelectorAll('.ccg-poker-motion,.ccg-poker-mask-card');
					for (var ri = 0; ri < restored.length; ri++) restored[ri].style.transition = '';
				}
			}, [open, count, suit]);
			return react.createElement("span", { className: "ccg-poker-icon" },
				react.createElement("span", { ref: svgRef, className: "ccg-poker-svg", dangerouslySetInnerHTML: { __html: html } })
			);
		}
		function turnPokerIcon(iconStyle, cardCount, running, open, turn, canCollapse, sessionId) {
			if (iconStyle !== "poker") {
				if (running || !canCollapse) return undefined;
				// 元素带 key（进 TurnBarView 的 kids 数组）——React 数组子元素必须有 key
				return react.createElement(NativeChevronIcon, { key: "native", open: open });
			}
			if (running) return react.createElement(PokerSpinIcon, { key: "poker" });
			return react.createElement(PokerIcon, { key: "poker", count: cardCount, suit: foldSuitFor(sessionId, turn), open: open });
		}
		function RollDigit(props) {
			var digit = props.digit;
			var stripRef = react.useRef(null);
			var animRef = react.useRef(null);
			var prevRef = react.useRef(0);
			var lastChangeRef = react.useRef(0);
			react.useEffect(function () {
				var el = stripRef.current;
				if (!el) return undefined;
				var prev = prevRef.current;
				prevRef.current = digit;
				var nowMs = (typeof performance !== "undefined" && typeof performance.now === "function") ? performance.now() : Date.now();
				var sinceLast = lastChangeRef.current ? nowMs - lastChangeRef.current : 1e9;
				lastChangeRef.current = nowMs;
				var target = "translateY(" + (-digit * 10) + "%)";
				var reduced = false;
				try { reduced = typeof window !== "undefined" && window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches; } catch (e) {}
				if (reduced || prev === digit || typeof el.animate !== "function") {
					el.style.transform = target;
					return undefined;
				}
				if (animRef.current) { try { animRef.current.cancel(); } catch (e) {} animRef.current = null; }
				// 快速连续变化（<500ms）用短动画（200ms）：指标刷新快时每拍也能完整走完；
				// 慢速变化（如耗时秒数）保持 350ms 回弹滚动。
				var dur = sinceLast < 500 ? 200 : 350;
				var anim = el.animate(
					[
						{ transform: "translateY(" + (-prev * 10) + "%)" },
						{ transform: target }
					],
					{ duration: dur, easing: "cubic-bezier(.34,1.56,.64,1)" }
				);
				animRef.current = anim;
				anim.onfinish = function () { animRef.current = null; };
				return function () {
					if (animRef.current) { try { animRef.current.cancel(); } catch (e) {} animRef.current = null; }
				};
			}, [digit]);
			var kids = [];
			for (var d = 0; d < 10; d++) {
				kids.push(react.createElement("span", { key: d, className: "ccg-roll-d" }, String(d)));
			}
			return react.createElement(
				"div",
				{ className: "ccg-roll-cell", "data-digit": String(digit) },
				react.createElement(
					"div",
					{
						ref: stripRef,
						className: "ccg-roll-strip",
						style: { transform: "translateY(" + (-digit * 10) + "%)" }
					},
					kids
				)
			);
		}
		function AnimatedLabel(props) {
			var label = props.label;
			var kids = [];
			var re = /(\d+(?:\.\d+)?)/g;
			var last = 0;
			var m;
			var textIdx = 0;
			var numIdx = 0;
			while ((m = re.exec(label)) !== null) {
				if (m.index > last) {
					kids.push(react.createElement("span", { key: "t" + textIdx++, className: "ccg-roll-text" }, label.slice(last, m.index)));
				}
				var digits = [];
				for (var i = 0; i < m[1].length; i++) {
					var ch = m[1].charAt(i);
					if (ch >= "0" && ch <= "9") {
						digits.push(react.createElement(RollDigit, { key: "d" + i, digit: Number(ch) }));
					} else {
						digits.push(react.createElement("span", { key: "d" + i, className: "ccg-roll-text" }, ch));
					}
				}
				kids.push(react.createElement("span", { key: "n" + numIdx++, className: "ccg-roll-num", "aria-hidden": "true" }, digits));
				last = re.lastIndex;
			}
			if (last < label.length) {
				kids.push(react.createElement("span", { key: "t" + textIdx++, className: "ccg-roll-text" }, label.slice(last)));
			}
			// 滚动窗口（0-9 数字条）只是视觉装饰：数字段 aria-hidden；
			// 完整最终文案放在 sr-only 文本里，读屏/断言拿到的是最终值。
			return react.createElement(
				"span",
				{ className: "ccg-roll-label" },
				react.createElement("span", { className: "ccg-sr-only" }, typeof props.srLabel === "string" ? props.srLabel : label),
				kids
			);
		}
		var popupState = { open: false, openerId: null };
		var popupListeners = new Set();
		var popupVersion = 0;
		function subscribePopup(fn) { popupListeners.add(fn); return function () { popupListeners.delete(fn); }; }
		function notifyPopup() {
			popupVersion++;
			var fns = [];
			popupListeners.forEach(function (fn) { fns.push(fn); });
			for (var i = 0; i < fns.length; i++) fns[i]();
		}
		function getPopupState() { return popupState; }
		function setPopupOpen(open, openerId) {
			var nextOpen = open === true && openerId !== undefined && openerId !== null;
			var nextOpener = nextOpen ? openerId : null;
			if (popupState.open === nextOpen && popupState.openerId === nextOpener) return;
			popupState = { open: nextOpen, openerId: nextOpener };
			notifyPopup();
		}
		var turnBarSeq = 0;
		function TurnBarView(props) {
			var running = props.running === true;
			var open = props.open === true;
			var canToggle = props.canToggle === true;
			var onToggle = props.onToggle;
			var label = props.label || "";
			var statusText = props.statusText;
			var statusFailed = props.statusFailed === true;
			var poker = props.poker;
			var round = props.round;
			var ariaLabel = (open ? _T("ariaTurnExpanded") : _T("ariaTurn")) + (label ? "：" + label : "");
			// 面板共享状态订阅 + 本栏身份：只有"打开者"渲染面板
			var popup = useSyncExternalStore(subscribePopup, getPopupState);
			var uidRef = react.useRef(null);
			if (uidRef.current === null) uidRef.current = "tf-bar-" + (++turnBarSeq);
			var gearRef = react.useRef(null);
			var isOpener = popup.open && popup.openerId === uidRef.current;
			// 卸载时若面板由本栏打开 → 关闭（会话切换不留僵尸 open 状态）
			react.useEffect(function () {
				var uid = uidRef.current;
				return function () {
					var s = getPopupState();
					if (s.open && s.openerId === uid) setPopupOpen(false, uid);
				};
			}, []);
			var titleContent = running ? react.createElement(AnimatedLabel, { label: label, srLabel: props.srLabel }) : label;
			var kids = [];
			if (poker) kids.push(poker);
			if (statusText) {
				kids.push(react.createElement(
					"span",
					{ key: "status", className: "ccg-turn-bar-status" + (statusFailed ? " ccg-turn-status-failed" : "") },
					statusText
				));
				kids.push(" · ");
			}
			kids.push(react.createElement("span", { key: "label", className: "ccg-turn-bar-label" }, titleContent));
			var rightKids = [];
			if (round) rightKids.push(react.createElement("span", { key: "round" }, round));
			if (rightKids.length > 0) {
				kids.push(react.createElement("span", { key: "right", className: "ccg-turn-bar-right" }, rightKids));
			}
			// 主区域：closed → button（fold toggle）；running / 不可折叠 → div（静态）。
			// 不用 disabled 属性——用 data-tf-static（样式回退默认光标）+ aria-disabled，
			// onClick 只在 canToggle 时挂载，点击天然无效果。
			var main = react.createElement(running ? "div" : "button", {
				className: "ccg-turn-bar-main",
				type: running ? undefined : "button",
				"data-tf-turn-bar": running ? "running" : "closed",
				"data-tf-running": running ? "true" : undefined,
				"data-tf-static": !running && !canToggle ? "true" : undefined,
				"data-open": !running && open ? "true" : undefined,
				"data-turn-process": props.turnNumber !== undefined ? String(props.turnNumber) : undefined,
				"aria-disabled": !running && !canToggle ? "true" : undefined,
				"aria-expanded": !running && canToggle ? open : undefined,
				"aria-label": running ? undefined : ariaLabel,
				onClick: canToggle ? onToggle : undefined,
				onKeyDown: canToggle ? function (e) {
					if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onToggle(); }
				} : undefined
			}, kids);
			// 齿轮：独立 <button>（主按钮的兄弟节点），只负责设置面板
			var gear = react.createElement("button", {
				ref: gearRef,
				type: "button",
				className: "ccg-gear-button",
				title: _T("fieldSettings"),
				"aria-label": _T("fieldSettings"),
				"aria-haspopup": "dialog",
				"aria-expanded": isOpener ? "true" : "false",
				onClick: function () {
					var s = getPopupState();
					var mine = s.open && s.openerId === uidRef.current;
					setPopupOpen(!mine, uidRef.current);
				}
			}, GearIconSvg());
			return react.createElement(
				"div",
				{ className: "ccg-turn-wrap", "data-tf-turn": props.turnNumber !== undefined ? String(props.turnNumber) : undefined },
				react.createElement("div", { className: "ccg-turn-row" }, main, gear),
				isOpener ? react.createElement(SettingsDialog, { openerRef: gearRef }) : null,
				react.createElement("div", { className: "ccg-turn-divider", "aria-hidden": "true" })
			);
		}
		function GearIconSvg() {
			return react.createElement("svg", { viewBox: "0 0 24 24", width: "14", height: "14", fill: "currentColor", "aria-hidden": "true" },
				react.createElement("path", { d: "M19.14,12.94c0.04-0.3,0.06-0.61,0.06-0.94c0-0.32-0.02-0.64-0.07-0.94l2.03-1.58c0.18-0.14,0.23-0.41,0.12-0.61 l-1.92-3.32c-0.12-0.22-0.37-0.29-0.59-0.22l-2.39,0.96c-0.5-0.38-1.03-0.7-1.62-0.94L14.4,2.81c-0.04-0.24-0.24-0.41-0.48-0.41 h-3.84c-0.24,0-0.43,0.17-0.47,0.41L9.25,5.35C8.66,5.59,8.12,5.92,7.63,6.29L5.24,5.33c-0.22-0.08-0.47,0-0.59,0.22L2.74,8.87 C2.62,9.08,2.66,9.34,2.86,9.48l2.03,1.58C4.84,11.36,4.8,11.69,4.8,12s0.02,0.64,0.07,0.94l-2.03,1.58 c-0.18,0.14-0.23,0.41-0.12,0.61l1.92,3.32c0.12,0.22,0.37,0.29,0.59,0.22l2.39-0.96c0.5,0.38,1.03,0.7,1.62,0.94l0.36,2.54 c0.05,0.24,0.24,0.41,0.48,0.41h3.84c0.24,0,0.44-0.17,0.47-0.41l0.36-2.54c0.59-0.24,1.13-0.56,1.62-0.94l2.39,0.96 c0.22,0.08,0.47,0,0.59-0.22l1.92-3.32c0.12-0.22,0.07-0.47-0.12-0.61L19.14,12.94z M12,15.6c-1.98,0-3.6-1.62-3.6-3.6 s1.62-3.6,3.6-3.6s3.6,1.62,3.6,3.6S13.98,15.6,12,15.6z" })
			);
		}
		var FIELD_CONFIG = [
			{ key: "duration", labelKey: "fieldDuration", descKey: "fieldDurationDesc" },
			{ key: "ttft", labelKey: "fieldTtft", descKey: "fieldTtftDesc" },
			{ key: "tokens", labelKey: "fieldTokens", descKey: "fieldTokensDesc" },
			{ key: "tokensPerSecond", labelKey: "fieldTps", descKey: "fieldTpsDesc" },
			{ key: "cacheHit", labelKey: "fieldCacheHit", descKey: "fieldCacheHitDesc" }
		];
		function GearOptionSelector(props) {
			var current = props.current;
			var labelKey = props.labelKey;
			var options = props.options;
			var opts = [];
			for (var oi = 0; oi < options.length; oi++) {
				var opt = options[oi];
				var selected = current === opt.value;
				var previewEls = opt.previews ? opt.previews() : [];
				var previewItems = [];
				for (var pi = 0; pi < previewEls.length; pi++) {
					// 每个预览项外包一层 .ccg-preview-tooltip：悬浮时在其上方弹出放大气泡。
					previewItems.push(react.createElement(
						"span",
						{ key: "p" + pi, className: "ccg-preview-tooltip" },
						react.createElement("span", { className: "ccg-gear-icon-option-preview-item" }, previewEls[pi]),
						react.createElement(
							"span",
							{ className: "ccg-preview-bubble" },
							react.createElement("span", { className: "ccg-preview-bubble-body" }, previewEls[pi])
						)
					));
				}
				opts.push(react.createElement("div", {
					key: opt.value,
					className: "ccg-gear-icon-option",
					"data-selected": selected ? "true" : undefined,
					onClick: function (v) { return function () { props.onSelect(v); }; }(opt.value),
					role: "radio",
					"aria-checked": selected ? "true" : "false",
					tabIndex: 0,
					onKeyDown: function (v) { return function (e) {
						if (e.key === "Enter" || e.key === " ") { e.preventDefault(); props.onSelect(v); }
					}; }(opt.value)
				},
					react.createElement("span", { className: "ccg-gear-icon-option-text" },
						react.createElement("div", { className: "ccg-gear-icon-option-title" }, _T(opt.labelKey)),
						react.createElement("div", { className: "ccg-gear-icon-option-desc" }, _T(opt.descKey))
					),
					react.createElement("span", { className: "ccg-gear-icon-option-preview", "aria-hidden": "true" }, previewItems)
				));
			}
			return react.createElement("div", { className: "ccg-gear-icon-selector" },
				react.createElement("div", { className: "ccg-gear-icon-selector-label" }, _T(labelKey)),
				opts
			);
		}
		function pokerPreviews() {
			var pool = pokerFacePool();
			var items = [];
			for (var fi = 0; fi < 4; fi++) {
				var five = fi >= 2;
				var open = fi % 2 === 1;
				items.push(react.createElement(PokerIcon, {
					key: "s" + fi,
					count: five ? 5 : 3,
					suit: pool[fi % pool.length],
					open: open
				}));
			}
			items.push(react.createElement(PokerSpinIcon, { key: "spin" }));
			return items;
		}
		function IconStyleSelector() {
			var current = useIconStyle();
			return react.createElement(GearOptionSelector, {
				current: current,
				labelKey: "foldIconLabel",
				onSelect: setIconStyle,
				options: [
					{ value: "poker", labelKey: "foldIconPoker", descKey: "foldIconPokerDesc", previews: pokerPreviews },
					{
						value: "native", labelKey: "foldIconNative", descKey: "foldIconNativeDesc",
						previews: function () {
							// 官方语义：收起 = down chevron；展开 = 同一图标 rotate(180deg) 朝上
							return [
								react.createElement(NativeChevronIcon, { key: "down", size: 14 }),
								react.createElement(NativeChevronIcon, { key: "up", size: 14, open: true })
							];
						}
					}
				]
			});
		}
		function SettingsDialog(props) {
			var openerRef = props.openerRef;
			// 注意 Hooks 顺序：useFieldVisibility() 等必须在条件 return 之前调用——
			// 本组件只在打开时挂载、关闭即卸载，hooks 数量恒定。
			var visibility = useFieldVisibility();
			var dialogRef = react.useRef(null);
			// 焦点往返：挂载时焦点移入面板；卸载（关闭）时焦点还给齿轮按钮
			react.useEffect(function () {
				var el = dialogRef.current;
				if (el && typeof el.focus === "function") { try { el.focus(); } catch (e) { /* 忽略 */ } }
				return function () {
					var opener = openerRef && openerRef.current;
					if (opener && typeof opener.focus === "function") { try { opener.focus(); } catch (e) { /* 忽略 */ } }
				};
			}, []);
			// Escape 关闭 + Tab 圈定：document 级捕获监听（监听器不是 DOM 写入，卸载即移除）
			react.useEffect(function () {
				function onKeyDown(e) {
					if (e.key === "Escape") {
						e.preventDefault();
						setPopupOpen(false, null);
						return;
					}
					if (e.key !== "Tab") return;
					var overlay = dialogRef.current ? dialogRef.current.parentNode : null;
					if (!overlay) return;
					var focusables = overlay.querySelectorAll('button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])');
					if (focusables.length === 0) { e.preventDefault(); return; }
					var first = focusables[0];
					var last = focusables[focusables.length - 1];
					var active = document.activeElement;
					if (e.shiftKey && (active === first || !overlay.contains(active))) {
						e.preventDefault(); last.focus();
					} else if (!e.shiftKey && (active === last || !overlay.contains(active))) {
						e.preventDefault(); first.focus();
					}
				}
				document.addEventListener("keydown", onKeyDown, true);
				return function () { document.removeEventListener("keydown", onKeyDown, true); };
			}, []);
			var fields = [];
			for (var fi = 0; fi < FIELD_CONFIG.length; fi++) {
				var cfg = FIELD_CONFIG[fi];
				var checked = visibility[cfg.key];
				var fieldKey = cfg.key;
				fields.push(react.createElement("div", { key: fieldKey, className: "ccg-gear-popup-field" },
					react.createElement("input", {
						type: "checkbox",
						id: "ccg-field-" + fieldKey,
						checked: checked,
						onChange: function (k, v) { return function () { setFieldVisible(k, !v); }; }(fieldKey, checked)
					}),
					react.createElement("label", { htmlFor: "ccg-field-" + fieldKey }, _T(cfg.labelKey)),
					react.createElement("span", { className: "ccg-gear-popup-field-desc" }, _T(cfg.descKey))
				));
			}
			return react.createElement("div", {
				className: "ccg-gear-overlay",
				onClick: function (e) { if (e.target === e.currentTarget) setPopupOpen(false, null); },
				onKeyDown: function (e) { if (e.key === "Escape") { e.preventDefault(); setPopupOpen(false, null); } }
			},
				react.createElement("div", {
					ref: dialogRef,
					className: "ccg-gear-popup",
					role: "dialog",
					"aria-modal": "true",
					"aria-label": _T("fieldSettings"),
					tabIndex: -1
				},
					react.createElement("div", { className: "ccg-gear-popup-title" }, _T("fieldSettings")),
					react.createElement("div", { className: "ccg-gear-popup-hint" }, _T("fieldSettingsHint")),
					react.createElement("div", { className: "ccg-gear-popup-fields" }, fields),
					react.createElement("div", { className: "ccg-gear-divider", "aria-hidden": "true" }),
					react.createElement(IconStyleSelector, null),
					react.createElement("div", { className: "ccg-gear-popup-foot" },
						react.createElement("button", {
							className: "ccg-gear-popup-btn",
							type: "button",
							onClick: function () { setPopupOpen(false, null); }
						}, _T("fieldSettingsDone"))
					)
				)
			);
		}
return {
	TurnBarView: typeof TurnBarView !== "undefined" ? TurnBarView : undefined,
	SettingsDialog: typeof SettingsDialog !== "undefined" ? SettingsDialog : undefined,
	computeTurnMetrics: typeof computeTurnMetrics !== "undefined" ? computeTurnMetrics : undefined,
	turnHeaderLabel: typeof turnHeaderLabel !== "undefined" ? turnHeaderLabel : undefined,
	filterVisibleMetrics: typeof filterVisibleMetrics !== "undefined" ? filterVisibleMetrics : undefined,
	turnPokerIcon: typeof turnPokerIcon !== "undefined" ? turnPokerIcon : undefined,
	settings: typeof settings !== "undefined" ? settings : undefined,
	useFieldVisibility: typeof useFieldVisibility !== "undefined" ? useFieldVisibility : undefined,
	setFieldVisible: typeof setFieldVisible !== "undefined" ? setFieldVisible : undefined,
	useIconStyle: typeof useIconStyle !== "undefined" ? useIconStyle : undefined,
	setIconStyle: typeof setIconStyle !== "undefined" ? setIconStyle : undefined,
	loadIconConfig: typeof loadIconConfig !== "undefined" ? loadIconConfig : undefined,
	POKER_SUITS: typeof POKER_SUITS !== "undefined" ? POKER_SUITS : undefined,
	turnStatusLabel: typeof turnStatusLabel !== "undefined" ? turnStatusLabel : undefined,
	turnRoundLabel: typeof turnRoundLabel !== "undefined" ? turnRoundLabel : undefined,
	formatTurnDuration: typeof formatTurnDuration !== "undefined" ? formatTurnDuration : undefined,
	formatTokPerSec: typeof formatTokPerSec !== "undefined" ? formatTokPerSec : undefined,
	formatTokenCount: typeof formatTokenCount !== "undefined" ? formatTokenCount : undefined,
	useLiveNow: typeof useLiveNow !== "undefined" ? useLiveNow : undefined,
	subscribeTicks: typeof subscribeTicks !== "undefined" ? subscribeTicks : undefined,
	getTickVersion: typeof getTickVersion !== "undefined" ? getTickVersion : undefined,
	subscribeFieldVisibility: typeof subscribeFieldVisibility !== "undefined" ? subscribeFieldVisibility : undefined,
	getFieldVisibilityVersion: typeof getFieldVisibilityVersion !== "undefined" ? getFieldVisibilityVersion : undefined,
	applyIconStyle: typeof applyIconStyle !== "undefined" ? applyIconStyle : undefined,
	FIELD_KEYS: typeof FIELD_KEYS !== "undefined" ? FIELD_KEYS : undefined,
	getPopupState: typeof getPopupState !== "undefined" ? getPopupState : undefined,
	setPopupOpen: typeof setPopupOpen !== "undefined" ? setPopupOpen : undefined
};
})();

			// ---- 语言 ----
			function currentLocale() {
				try {
					if (typeof document !== "undefined" && document.documentElement && document.documentElement.lang) {
						return document.documentElement.lang.toLowerCase();
					}
				} catch (e) { /* ignore */ }
				try {
					if (typeof navigator !== "undefined" && navigator.language) return navigator.language.toLowerCase();
				} catch (e) { /* ignore */ }
				return "en";
			}
			function isZh() { return currentLocale().indexOf("zh") === 0; }

			// ---- 设置（客户端本地，不经官方设置面） ----
			// 默认挂在 conversation.input.dock —— 输入框上方、"执行中…/用时 N 秒"状态行所在的整行区域。
			var SETTING_KEY = "dsh-turn-stats-footer:composerLine";
			function composerMode() {
				var raw = null;
				try { raw = window.localStorage.getItem(SETTING_KEY); } catch (e) { return "input"; }
				if (raw === "0" || raw === "off" || raw === "false") return "off";
				if (raw === "dock" || raw === "below") return "dock";
				return "input";
			}

			// 对齐基准：顶部 turn-fold 回合栏所在的是 transcript 列
			// （._1kaiZa_column = max-width:var(--dsh-chat-content-width) + margin:0 auto）。
			// 这里复用同一个 CSS 变量，套在同款列盒子里，左/右缩进随之完全一致。
			var ALIGN_KEY = "dsh-turn-stats-footer:align";
			function composerAlign() {
				var raw = null;
				try { raw = window.localStorage.getItem(ALIGN_KEY); } catch (e) { return "content"; }
				if (raw === "card" || raw === "composer") return "card";
				if (raw === "pane" || raw === "full") return "pane";
				return "content";
			}
			function alignMaxWidth() {
				var a = composerAlign();
				if (a === "card") return "var(--dsh-composer-card-max-width,952px)";
				if (a === "pane") return "none";
				return "var(--dsh-chat-content-width,920px)";
			}

			// ---- 格式化（对齐 dsh-turn-fold 回合栏的展示口径） ----
			function fmtDurationZh(ms) {
				var t = Math.max(0, Math.floor(ms / 1000));
				if (t < 60) return t + "秒";
				var m = Math.floor(t / 60), s = t % 60;
				if (m < 60) return m + "分" + String(s).padStart(2, "0") + "秒";
				var h = Math.floor(m / 60);
				return h + "小时" + String(m % 60).padStart(2, "0") + "分" + String(s).padStart(2, "0") + "秒";
			}
			function fmtDurationEn(ms) {
				var t = Math.max(0, Math.floor(ms / 1000));
				if (t < 60) return t + "s";
				var m = Math.floor(t / 60), s = t % 60;
				if (m < 60) return m + "m" + String(s).padStart(2, "0") + "s";
				var h = Math.floor(m / 60);
				return h + "h" + String(m % 60).padStart(2, "0") + "m" + String(s).padStart(2, "0") + "s";
			}
			function fmtLatencySeconds(ms) {
				var s = Math.max(0, (ms || 0)) / 1000;
				return s < 10 ? String(+s.toFixed(1)) : String(Math.round(s));
			}
			function fmtTokens(n) {
				if (typeof n !== "number" || !isFinite(n)) return "—";
				try { return Number(n).toLocaleString("en-US"); } catch (e) { return String(n); }
			}
			function fmtTps(v) {
				if (typeof v !== "number" || !isFinite(v) || v < 0) return null;
				return v >= 10 ? String(Math.round(v)) : String(+v.toFixed(1));
			}

			// ---- 数据读取 ----

			/** useChat selector：本 (turn, kind) 的 identity-stable 增量数据源
			 *  （dsh-turn-fold selectTurnNodeSource 同款；绝不返回整个 snapshot）。 */
			function selectTurnNodeSource(turn, kind) {
				return function (s) {
					if (turn === undefined) return null;
					try {
						if (s && s.nodes && typeof s.nodes.turnDataSource === "function") {
							return s.nodes.turnDataSource(turn, kind);
						}
					} catch (e) { /* store 未就绪 */ }
					return null;
				};
			}

			/** useProjection selector：turnFoldMetrics 里本回合那条 durable 记录。 */
			function selectDurableTurn(turn) {
				return function (state) {
					try {
						if (state && state.turns && turn !== undefined) return state.turns[turn] || null;
					} catch (e) { /* ignore */ }
					return null;
				};
			}

			/** 把 useProjection 的返回值当「已选中」或「整表」两态归一成本回合记录。 */
			function durableOf(value, turn) {
				try {
					if (!value || typeof value !== "object") return null;
					if (value.turns && typeof value.turns === "object") {
						return turn === undefined ? null : (value.turns[turn] || null);
					}
					return value;
				} catch (e) { return null; }
			}

			/** 整表里最大的回合号（运行中判定与轮号的兜底来源）。 */
			function lastProjectedTurn(value) {
				try {
					var turns = value && value.turns;
					if (!turns) return undefined;
					var keys = Object.keys(turns), best;
					for (var i = 0; i < keys.length; i++) {
						var n = Number(keys[i]);
						if (isFinite(n) && (best === undefined || n > best)) best = n;
					}
					return best;
				} catch (e) { return undefined; }
			}

			/** 一个 assistant-step 数据的 timing 证据（官方 assistantStepReading 谓词）。 */
			function stepTimingOf(stepData) {
				try {
					if (!stepData) return null;
					var fn = stepData.finalNode;
					var t = fn && fn.timing;
					if (t && typeof t.firstTokenTime === "number" && typeof t.completedTime === "number") {
						return {
							ttftMs: typeof t.stepStartTime === "number" ? Math.max(0, t.firstTokenTime - t.stepStartTime) : null,
							decodeMs: Math.max(0, t.completedTime - t.firstTokenTime),
							exact: true,
							step: typeof stepData.step === "number" ? stepData.step : -1,
						};
					}
					// 运行中、官方 timing 未就绪：data.time = 首个可见 block 的事件时间
					if (stepData.status !== "running") return null;
					if (typeof stepData.time !== "number" || stepData.time <= 0) return null;
					var startMs = stepData.stepStartTime;
					if (typeof startMs !== "number") return null;
					return {
						ttftMs: Math.max(0, stepData.time - startMs),
						decodeMs: null,
						exact: false,
						step: typeof stepData.step === "number" ? stepData.step : -1,
					};
				} catch (e) { return null; }
			}

			/** 一个 assistant-step 的 output token 证据（官方 usageOutputTokens 同款守卫）。 */
			function stepOutputTokens(stepData) {
				try {
					var u = stepData && stepData.usage;
					if (u && typeof u.outputTokens === "number" && isFinite(u.outputTokens) && u.outputTokens >= 0) {
						return u.outputTokens;
					}
				} catch (e) { /* ignore */ }
				return null;
			}

			/**
			 * 汇总「本回合」指标（轮末 ① 与统计带 ② 共用同一口径）。
			 * @param turnNo 回合号
			 * @param startMs 回合开始时间（运行中用于实时耗时）
			 * @param endMs 回合结束时间（已结束时）
			 * @param stepDataList assistant-step 数据数组（含隐藏节点）
			 * @param durable turnFoldMetrics 的 durable 记录（TTFT/decode 的可靠来源）
			 * @param nowMs 运行中的实时时钟
			 * @returns 指标对象；无任何可显示字段时返回 null
			 */
			function aggregateTurnMetrics(turnNo, startMs, endMs, stepDataList, durable, nowMs) {
				var durationMs;
				var end = typeof endMs === "number" ? endMs
					: (typeof nowMs === "number" ? nowMs : undefined);
				if (typeof startMs === "number" && typeof end === "number") durationMs = Math.max(0, end - startMs);

				var tokens, outputTokens;
				var decodeMs = 0, decodeTokens = 0, hasDecode = false;
				var ttftMs, ttftStep = Infinity, ttftExact = false;
				var seen = {};

				if (Array.isArray(stepDataList)) {
					for (var i = 0; i < stepDataList.length; i++) {
						var sd = stepDataList[i];
						if (!sd || typeof sd !== "object" || seen[sd] === 1) continue;
						seen[sd] = 1;
						var out = stepOutputTokens(sd);
						if (out !== null) {
							if (outputTokens === undefined) outputTokens = 0;
							outputTokens += out;
						}
						var tm = stepTimingOf(sd);
						if (tm) {
							if (tm.ttftMs !== null && (tm.step < ttftStep || (tm.step === ttftStep && tm.exact && !ttftExact))) {
								ttftStep = tm.step; ttftMs = tm.ttftMs; ttftExact = tm.exact;
							}
							if (tm.exact && tm.decodeMs !== null && out !== null) {
								decodeMs += tm.decodeMs; decodeTokens += out; hasDecode = true;
							}
						}
					}
				}
				if (outputTokens !== undefined) tokens = outputTokens;

				// durable（turnFoldMetrics）优先：reload / 历史会话下唯一可靠的 TTFT 与 decode
				if (durable && typeof durable === "object") {
					if (typeof durable.ttftMs === "number") ttftMs = Math.max(0, durable.ttftMs);
					if (typeof durable.decodeMs === "number" && durable.decodeMs > 0 &&
						typeof durable.decodeTokens === "number" && durable.decodeTokens > 0) {
						decodeMs = durable.decodeMs; decodeTokens = durable.decodeTokens; hasDecode = true;
					}
				}
				var tps;
				if (hasDecode && decodeMs > 0 && decodeTokens > 0) tps = (decodeTokens / decodeMs) * 1000;

				if (durationMs === undefined && tokens === undefined && ttftMs === undefined && tps === undefined) {
					return null;
				}
				return { turnNo: turnNo, durationMs: durationMs, ttftMs: ttftMs, tokens: tokens, tps: tps };
			}

			function formatMetricParts(m, opts) {
				opts = opts || {};
				var zh = isZh();
				var parts = [];
				if (opts.withTurn && m.turnNo !== undefined) parts.push(zh ? "第" + m.turnNo + "轮" : "Turn " + m.turnNo);
				if (m.durationMs !== undefined) parts.push((zh ? "耗时" : "") + (zh ? fmtDurationZh(m.durationMs) : fmtDurationEn(m.durationMs)));
				if (m.ttftMs !== undefined) parts.push((zh ? "首字" : "TTFT ") + fmtLatencySeconds(m.ttftMs) + "s");
				if (m.tokens !== undefined) parts.push(fmtTokens(m.tokens) + " token");
				var tpsText = m.tps !== undefined ? fmtTps(m.tps) : null;
				if (tpsText) parts.push(tpsText + " tok/s");
				return parts;
			}

			// ---- 轮末统计行（①，shadow 官方 turn-tail） ----

			function TurnStatsFooterLine(props) {
				var node = props.node;

				var useChat = props.useChat;
				var loc = node && node.location;
				var turnLoc = loc && (loc.kind === "turn" || loc.kind === "step") ? loc.turn : undefined;
				var turnNo = turnLoc && typeof turnLoc.turn === "number" ? turnLoc.turn
					: (node && node.data && typeof node.data.turn === "number" ? node.data.turn : undefined);
				var stepsSource = typeof useChat === "function" ? useChat(selectTurnNodeSource(turnNo, "assistant-step")) : null;
				var stepDataList = useSyncExternalStore(
					stepsSource && typeof stepsSource.subscribe === "function" ? stepsSource.subscribe : subscribeNothing,
					stepsSource && typeof stepsSource.getSnapshot === "function" ? stepsSource.getSnapshot : getUndefinedSnapshot
				);

				var durable = null;
				if (typeof props.useProjection === "function") {
					try { durable = props.useProjection("turnFoldMetrics", selectDurableTurn(turnNo)); }
					catch (e) { durable = null; }
				}

				var data = (node && node.data) || {};
				var tu = data.tokenUsage;
				var tokens, cachePercent, models;
				if (tu && typeof tu.totalTokens === "number") {
					tokens = tu.totalTokens;
					var outputTokens = typeof tu.outputTokens === "number" ? tu.outputTokens : undefined;
					var promptSide = outputTokens !== undefined ? tokens - outputTokens : undefined;
					if (typeof tu.cacheReadTokens === "number" && promptSide > 0) {
						cachePercent = (tu.cacheReadTokens / promptSide) * 100;
					}
					if (Array.isArray(tu.routes)) {
						var seen = {}, list = [];
						for (var ri = 0; ri < tu.routes.length; ri++) {
							var r = tu.routes[ri];
							var m = r && r.model;
							if (m && !seen[m]) { seen[m] = 1; list.push(m); }
						}
						if (list.length) models = list.join("/");
					}
				}

				var startMs, endMs;
				try {
					var st = turnLoc && turnLoc.start, en = turnLoc && turnLoc.end;
					if (st && typeof st.time === "number") startMs = st.time;
					if (en && typeof en.time === "number") endMs = en.time;
				} catch (e) { /* ignore */ }

				var agg = aggregateTurnMetrics(turnNo, startMs, endMs, stepDataList, durable, undefined);
				var m = agg || { turnNo: turnNo };
				if (tokens !== undefined) m.tokens = tokens;
				if (cachePercent !== undefined) m.cachePercent = cachePercent;
				if (models !== undefined) m.models = models;

				var zh = isZh();
				var parts = formatMetricParts(m, { withTurn: true });
				if (m.cachePercent !== undefined) parts.push((zh ? "缓存" : "cache ") + m.cachePercent.toFixed(2) + "%");
				if (m.models) parts.push(m.models);
				if (parts.length < 2) return null; // 只有轮号没有数据 → 不渲染

				return react.createElement("div", {
					"data-turn-stats-footer": "1",
					style: {
						fontSize: "12px",
						lineHeight: "20px",
						opacity: "0.55",
						marginTop: "6px",
						padding: "0",
						userSelect: "none",
						whiteSpace: "nowrap",
						overflow: "hidden",
						textOverflow: "ellipsis",
						textAlign: "left",
					},
					title: parts.join(" · "),
				}, parts.join(" · "));
			}

			var officialTurnTailComponent = null;

			function ShadowTurnTailView(props) {
				return react.createElement(react.Fragment, null,
					officialTurnTailComponent
						? react.createElement(officialTurnTailComponent, props)
						: null,
					react.createElement(TurnStatsFooterLine, props)
				);
			}

			// ---- 统计带里的「本轮」行（②） ----

			/** 一个回合定位对象 → {number,startMs,endMs}（判定与取值都用它）。 */
			function turnFromLocation(turn, loc) {
				var st = loc && loc.start, en = loc && loc.end;
				var startMs, endMs;
				if (loc && typeof loc.startMs === "number") startMs = loc.startMs; // legacy turnTimings 形态
				else if (st && typeof st.time === "number") startMs = st.time;
				else if (loc && typeof loc.time === "number") startMs = loc.time;
				if (loc && typeof loc.endMs === "number") endMs = loc.endMs;
				else if (en && typeof en.time === "number") endMs = en.time;
				return {
					number: typeof turn === "number" ? turn : (loc && typeof loc.turn === "number" ? loc.turn : undefined),
					startMs: startMs,
					endMs: endMs,
				};
			}

			/** 从任意快照面找「当前回合」：优先 status==='open'，其次回合定位表的最后一项。 */
			function readTurnState(snapshot) {
				try {
					if (!snapshot || typeof snapshot !== "object") return null;
					// 主路径：timeline.turns 定位表（Map 或普通表）
					var timeline = snapshot.timeline;
					var turns = timeline && timeline.turns;
					var best = null, last = null;
					if (turns) {
						// Map.forEach 回调是 (value, key)；Object/普通表则按 (key, value) 调用。
						var consider = function (a, b) {
							var loc = (a && typeof a === "object") ? a : b;
							var turn = (a && typeof a === "object") ? b : a;
							if (!loc) return;
							var info = turnFromLocation(typeof turn === "number" ? turn : undefined, loc);
							if (info.number === undefined && info.startMs === undefined) return;
							if (loc.status === "open" && (!best || (info.number !== undefined && info.number > best.number))) best = info;
							if (!last || (info.number !== undefined && info.number > last.number)) last = info;
						};
						if (typeof turns.forEach === "function") turns.forEach(consider);
						else {
							var keys = Object.keys(turns);
							for (var i = 0; i < keys.length; i++) consider(Number(keys[i]), turns[keys[i]]);
						}
					}
					if (best) return { turnNo: best.number, startMs: best.startMs, endMs: best.endMs, running: true };
					if (last) return { turnNo: last.number, startMs: last.startMs, endMs: last.endMs, running: false };
				} catch (e) { /* ignore */ }
				// 兜底：标准快照面的 locations.getTurn（数组 / 迭代器 / 单值三种形态）
				try {
					var getTurn = snapshot.locations && snapshot.locations.getTurn;
					if (typeof getTurn === "function") {
						var seen = getTurn();
						if (seen && typeof seen.length === "number") {
							var fromList = lastTurnOf(seen);
							if (fromList) return { turnNo: fromList.number, startMs: fromList.startMs, endMs: fromList.endMs, running: fromList.open === true };
						} else if (seen && typeof seen[Symbol.iterator] === "function") {
							var it = seen[Symbol.iterator]();
							var stepIt = it.next(), tail = null;
							while (!stepIt.done) {
								var loc = stepIt.value;
								var info = turnFromLocation(null, loc);
								if (info.number !== undefined || info.startMs !== undefined) {
									tail = { turnNo: info.number, startMs: info.startMs, endMs: info.endMs, running: !!(loc && loc.status === "open") };
								}
								stepIt = it.next();
							}
							if (tail) return tail;
						}
					}
				} catch (e) { /* ignore */ }
				return null;
			}

			/** 回合定位数组 → 最后一项（locations.getTurn 兜底）。 */
			function lastTurnOf(list) {
				try {
					for (var i = list.length - 1; i >= 0; i--) {
						var loc = list[i];
						var info = turnFromLocation(null, loc);
						if (info.number !== undefined || info.startMs !== undefined) {
							return { number: info.number, startMs: info.startMs, endMs: info.endMs, open: !!(loc && loc.status === "open") };
						}
					}
				} catch (e) { /* ignore */ }
				return null;
			}

			/** 本回合是否有 step 正在跑。 */
			function anyStepRunning(stepDataList) {
				try {
					if (!Array.isArray(stepDataList)) return false;
					for (var i = 0; i < stepDataList.length; i++) {
						var sd = stepDataList[i];
						if (sd && sd.status === "running") return true;
					}
				} catch (e) { /* ignore */ }
				return false;
			}

			/** useChat selector：本回合 turn-tail 数据里的「牌面」字段（总 token / 缓存 / 模型）。
			 *  官方 turn-tail 数据可能挂在 turn 级或回合内某个 step 级
			 *  （dsh-turn-fold 的 turnClockOf 同款：先取 node.data，再回落到 steps[].data.get）。
			 */
			function selectTurnCards(turn) {
				return function (s) {
					if (turn === undefined) return null;
					try {
						var loc = null;
						var timeline = s && s.timeline;
						if (timeline && timeline.turns && typeof timeline.turns.get === "function") loc = timeline.turns.get(turn);
						var data = loc && typeof loc.data === "object" && typeof loc.data.get === "function" ? loc.data.get("turn-tail") : null;
						if (!data) data = readStepTail(loc);
						if (!data || typeof data.tokenUsage !== "object" || data.tokenUsage === null) return null;
						var tu = data.tokenUsage;
						var models;
						if (Array.isArray(tu.routes)) {
							var seen = {}, list = [];
							for (var i = 0; i < tu.routes.length; i++) {
								var mm = tu.routes[i] && tu.routes[i].model;
								if (mm && !seen[mm]) { seen[mm] = 1; list.push(mm); }
							}
							if (list.length) models = list.join("/");
						}
						var cachePercent;
						if (typeof tu.totalTokens === "number" && typeof tu.outputTokens === "number"
							&& typeof tu.cacheReadTokens === "number") {
							var promptSide = tu.totalTokens - tu.outputTokens;
							if (promptSide > 0) cachePercent = tu.cacheReadTokens / promptSide * 100;
						}
						return {
							totalTokens: typeof tu.totalTokens === "number" ? tu.totalTokens : undefined,
							cachePercent: cachePercent,
							models: models,
						};
					} catch (e) { /* ignore */ }
					return null;
				};
			}

			/** turn.steps[].data.get("turn-tail") 兜底（turn 级没有时）。 */
			function readStepTail(loc) {
				try {
					var steps = loc && loc.steps;
					if (!Array.isArray(steps)) return null;
					for (var i = 0; i < steps.length; i++) {
						var st = steps[i];
						var store = st && st.data;
						if (store && typeof store.get === "function") {
							var v = store.get("turn-tail");
							if (v && typeof v.tokenUsage === "object" && v.tokenUsage !== null) return v;
						}
					}
				} catch (e) { /* ignore */ }
				return null;
			}

			function getEmptyList() { return EMPTY_LIST; }
			var EMPTY_LIST = [];

			// ================= 常驻「本轮」行（挂在 conversation.input.dock） =================
			// 数据面沿用本插件原有实现；**外观与交互 100% 用 TF（turn-fold 原样移植）**：
			// 同一个 TurnBarView（扑克牌图标 + 指标串 + 第N轮·M步 + 齿轮），
			// 同一个 SettingsDialog（字段显隐 / 图标风格），同一份设置存储。

			var TF_STYLE_ID = "dsh-turn-stats-footer/tf-port";

			/** 注入 turn-fold 的那份样式表（原样；类名 ccg-* 与移植代码一一对应）。 */
			function injectTfStyle() {
				if (injectTfStyle.done) return;
				injectTfStyle.done = true;
				try {
					if (typeof document === "undefined") return;
					if (document.querySelector('style[data-plugin-css="' + TF_STYLE_ID + '"]') !== null) return;
					var tag = document.createElement("style");
					tag.dataset.plugin = "dsh-turn-stats-footer";
					tag.dataset.pluginCss = TF_STYLE_ID;
					tag.textContent = TF_CSS;
					(document.head || document.documentElement).appendChild(tag);
				} catch (e) { /* ignore */ }
			}

			/** 读取本回合 turn-tail（总 token / 缓存 / 模型）——与轮末①同一数据源。 */
			function selectTurnTail(turn) {
				return function (s) {
					if (turn === undefined) return null;
					try {
						var timeline = s && s.timeline;
						var loc = timeline && timeline.turns && typeof timeline.turns.get === "function"
							? timeline.turns.get(turn) : null;
						var data = loc && loc.data && typeof loc.data.get === "function" ? loc.data.get("turn-tail") : null;
						if (!data) data = readStepTail(loc);
						return data || null;
					} catch (e) { return null; }
				};
			}

			/** 官方 turn-tail tokenUsage → TF 指标口径（与轮末①一致）。 */
			function metricsFromTail(tail) {
				if (!tail || typeof tail.tokenUsage !== "object" || tail.tokenUsage === null) return null;
				var tu = tail.tokenUsage;
				var out = {};
				if (typeof tu.totalTokens === "number") out.tokens = tu.totalTokens;
				if (typeof tu.totalTokens === "number" && typeof tu.outputTokens === "number"
					&& typeof tu.cacheReadTokens === "number") {
					var promptSide = tu.totalTokens - tu.outputTokens;
					if (promptSide > 0) out.cacheHitPercent = (tu.cacheReadTokens / promptSide * 100).toFixed(2);
				}
				return out;
			}

			/** 回合定位表里本回合的 start/end（运行中 end 由 liveNow 顶替）。 */
			function turnSpanOf(snapshot, turn) {
				try {
					var loc = snapshot && snapshot.timeline && snapshot.timeline.turns
						&& typeof snapshot.timeline.turns.get === "function" ? snapshot.timeline.turns.get(turn) : null;
					if (!loc) return {};
					return {
						startMs: loc.start && typeof loc.start.time === "number" ? loc.start.time : undefined,
						endMs: loc.end && typeof loc.end.time === "number" ? loc.end.time : undefined,
						status: loc.status,
					};
				} catch (e) { return {}; }
			}

			function TurnStatsComposerLine(props) {
				injectTfStyle();
				var zh = isZh();
				var live = null;
				if (typeof props.useConversation === "function") {
					try { live = props.useConversation(readTurnState); } catch (e) { live = null; }
				}
				if (!live && typeof props.useChat === "function") {
					try { live = props.useChat(readTurnState); } catch (e) { live = null; }
				}
				var turnNo = live ? live.turnNo : undefined;
				var snapshotRunning = !!(live && live.running);

				var durableAll = null;
				if (typeof props.useProjection === "function") {
					try { durableAll = props.useProjection("turnFoldMetrics"); } catch (e) { durableAll = null; }
				}
				if (durableAll && !durableAll.turns) durableAll = { turns: { [String(turnNo)]: durableAll } };
				if (turnNo === undefined) turnNo = lastProjectedTurn(durableAll);
				var durable = durableOf(durableAll, turnNo);

				var source = null;
				if (typeof props.useChat === "function" && turnNo !== undefined) {
					try { source = props.useChat(selectTurnNodeSource(turnNo, "assistant-step")); } catch (e) { source = null; }
				}
				var sourceSnapshot = useSyncExternalStore(
					source && typeof source.subscribe === "function" ? source.subscribe : subscribeNothing,
					source && typeof source.getSnapshot === "function" ? source.getSnapshot : getEmptyList
				);

				var tail = null;
				if (typeof props.useChat === "function" && turnNo !== undefined) {
					try { tail = props.useChat(selectTurnTail(turnNo)); } catch (e) { tail = null; }
				}
				var span = { startMs: live ? live.startMs : undefined, endMs: live ? live.endMs : undefined };

				var stepCount = Array.isArray(sourceSnapshot) && sourceSnapshot.length > 0 ? sourceSnapshot.length : undefined;

				// 运行中判定（与之前一致）：快照 open / 有 running step
				var running = snapshotRunning || anyStepRunning(sourceSnapshot);
				var liveNow = TF.useLiveNow(running);
				var visibility = TF.useFieldVisibility();
				var iconStyle = TF.useIconStyle();

				if (turnNo === undefined) return null;
				var tailMetrics = metricsFromTail(tail);
				if (!tailMetrics && !durable && typeof span.startMs !== "number"
					&& !(Array.isArray(sourceSnapshot) && sourceSnapshot.length > 0)) return null;

				// 真实指标：step 聚合（TTFT/decode）优先做底，turn-tail 覆盖 token/缓存
				var stepMetrics = TF.computeTurnMetrics(
					{ number: turnNo, startMs: span.startMs, endMs: span.endMs, status: running ? "open" : "closed", steps: [] },
					sourceSnapshot, tail, running ? liveNow : undefined, durable, props.sessionId
				) || {};
				var metrics = {};
				for (var mk in stepMetrics) { if (Object.prototype.hasOwnProperty.call(stepMetrics, mk)) metrics[mk] = stepMetrics[mk]; }
				if (tailMetrics) {
					if (tailMetrics.tokens !== undefined) metrics.tokens = tailMetrics.tokens;
					if (tailMetrics.cacheHitPercent !== undefined) metrics.cacheHitPercent = tailMetrics.cacheHitPercent;
				}
				var filtered = TF.filterVisibleMetrics(metrics);
				var label = TF.turnHeaderLabel(filtered) || "";
				var round = (zh ? "第" + turnNo + "轮" : "Turn " + turnNo);
				if (stepCount !== undefined) round += zh ? " · " + stepCount + " 步" : " · " + stepCount + " steps";
				// 指标被字段设置关掉 / 全部无值时：至少显示「第N轮 · M 步」，不留空白
				if (!label) label = round;
				void visibility;

				// 运行中 = turn-fold 原版的 PokerSpinIcon（SMIL 主轴旋转 + 花色轮换），
				// 跑完才回落到静态牌堆/扇形。这里必须把真实 running 传进去（曾误传 false → 图标不动）。
				// canToggle 仍为 false：本条不支持展开收起，牌面只做「运行中旋转」这一个动作。
				var poker = TF.turnPokerIcon(iconStyle, stepCount || 1, running, false, turnNo, false, props.sessionId);
				var bar = react.createElement(TF.TurnBarView, {
					running: running,
					open: false,
					canToggle: false,
					label: label,
					srLabel: label,
					round: round,
					turnNumber: turnNo,
					poker: poker,
				});
				// 与顶部回合栏同宽同位：transcript 节点就是「max-width:var(--dsh-chat-content-width)
				// + margin:0 auto」这一层列盒子（见文件头「对齐」注释）。input.dock 容器是整条
				// 面板宽度，所以这里自己补齐这层，左缩进/右缩进才会跟顶部回合栏一致。
				return react.createElement("div", {
					"data-dsh-tsf-line": "composer",
					style: {
						boxSizing: "border-box",
						width: "100%",
						maxWidth: alignMaxWidth(),
						marginLeft: "auto",
						marginRight: "auto",
						minWidth: 0,
					},
				}, bar);
			}

			// ---- 注册（dsh-turn-fold 同款 preflight + shadow 手法） ----

			var SLOT = "conversation.chat.node";
			var KEY = "turn-tail";
			var installDispose = null;
			var installed = false;
			var composerDispose = null;
			var composerInstalled = false;
			var composerProbed = false;

			function warnOnce(tag, message) {
				try {
					if (warnOnce._seen === undefined) warnOnce._seen = {};
					if (warnOnce._seen[tag]) return;
					warnOnce._seen[tag] = 1;
					if (typeof console !== "undefined" && console.warn) {
						console.warn("[dsh-turn-stats-footer] " + message);
					}
				} catch (e) { /* ignore */ }
			}

			/** 严格 builtin 查找：key 命中 + priority 恰好 0 + component 非空。
			 *  必须在注册 shadow 之前调用（否则 entries 会先看到自己的 shadow）。 */
			function findOfficialTurnTail(slots) {
				if (!slots || typeof slots.entries !== "function") return null;
				var entries = null;
				try { entries = slots.entries(SLOT); } catch (e) { return null; }
				for (var i = 0; entries && i < entries.length; i++) {
					var e = entries[i];
					if (e && e.options && e.options.key === KEY && (e.options.priority || 0) === 0 && e.component != null) {
						return e.component;
					}
				}
				return null;
			}

			/** priority -1 是否已被其他插件占用（占用 → 本插件弃权，尊重既有 owner）。 */
			function shadowPriorityTaken(slots) {
				if (!slots || typeof slots.entries !== "function") return false;
				var entries = null;
				try { entries = slots.entries(SLOT); } catch (e) { return false; }
				for (var i = 0; entries && i < entries.length; i++) {
					var e = entries[i];
					if (e && e.options && e.options.key === KEY &&
						typeof e.options.priority === "number" && e.options.priority < 0 && e.component != null) {
						return true;
					}
				}
				return false;
			}

			function safeRegisterSlot(slots, options, component) {
				try {
					var d = slots.inject(options.name, function () {
						return slots.register(options, component);
					});
					return function () { try { if (typeof d === "function") d(); } catch (e) { /* ignore */ } };
				} catch (err) {
					warnOnce("register:" + options.name, 'slot "' + options.name + '" registration failed: ' + (err && err.message));
					return null;
				}
			}

			function tryInstall(slots) {
				if (installed) return true;
				var official = findOfficialTurnTail(slots);
				if (!official) return false; // 官方 ui-chat 的 turn-tail 尚未声明（bundle 时序）→ 稍后重试
				if (shadowPriorityTaken(slots)) {
					warnOnce("taken", 'another plugin already shadows "' + SLOT + '" key "' + KEY + '"; giving up (respect existing owner)');
					installed = true;
					return true;
				}
				officialTurnTailComponent = official;
				installDispose = safeRegisterSlot(slots, {
					name: SLOT,
					key: KEY,
					priority: -1,
					locale: "chat",
				}, ShadowTurnTailView);
				installed = !!installDispose;
				if (installed) {
					try {
						if (typeof console !== "undefined" && console.info) {
							console.info("[dsh-turn-stats-footer] installed: shadowing official turn-tail renderer (priority -1)");
						}
					} catch (e) { /* ignore */ }
				}
				return installed;
			}

			/** 状态行区域 entry：默认 conversation.input.dock（"执行中…/用时 N 秒"那一行）。 */
			function tryInstallComposerLine(slots) {
				if (composerInstalled) return true;
				var mode = composerMode();
				if (mode === "off") { composerInstalled = true; return true; }
				var slotName = mode === "input" ? "conversation.input.dock" : "conversation.composer.dock";
				composerDispose = safeRegisterSlot(slots, {
					name: slotName,
					id: "turn-stats-footer",
					order: -10,
					locale: "chat",
				}, TurnStatsComposerLine);
				composerInstalled = !!composerDispose;
				if (composerInstalled) {
					try {
						if (typeof console !== "undefined" && console.info) {
							console.info("[dsh-turn-stats-footer] installed: live turn line in " + slotName);
						}
					} catch (e) { /* ignore */ }
				}
				return composerInstalled;
			}

			/** 重装（设置改变后调用；先解绑再按当前设置注册）。 */
			function reinstallComposerLine(slots) {
				if (typeof composerDispose === "function") {
					try { composerDispose(); } catch (e) { /* ignore */ }
				}
				composerDispose = null;
				composerInstalled = false;
				return tryInstallComposerLine(slots);
			}

			// ---- Cordis 插件入口 ----
			exports.inject = ["slots"];
			// 调试面：改了 localStorage 位置开关又不想刷新页面时，控制台里
			// __DSH_TURN_STATS_FOOTER__.reinstall() 即可按当前设置重挂那一行。
			try {
				window.__DSH_TURN_STATS_FOOTER__ = {
					reinstall: function () { try { return reinstallComposerLine(activeSlots); } catch (e) { return false; } },
					mode: function () { return composerMode(); },
					align: function () { return composerAlign(); },
					// 对齐基准：切完立刻按新基准重挂那一行（无需刷新）
					setAlign: function (align) {
						try {
							var v = String(align == null ? "content" : align);
							if (v === "content" || v === "card" || v === "pane") window.localStorage.setItem(ALIGN_KEY, v);
							else window.localStorage.removeItem(ALIGN_KEY);
						} catch (e) { /* ignore */ }
						return reinstallComposerLine(activeSlots);
					},
					// 现场量尺：比对②的盒子与顶部回合栏所在的 transcript 列（完全相同才对）
					alignInfo: function () {
						try {
							var mine = document.querySelector('[data-dsh-tsf-line="composer"]');
							var node = document.querySelector('[data-slot="conversation.chat.node"]');
							var col = node && node.parentElement;
							var r = function (el) {
								if (!el || typeof el.getBoundingClientRect !== "function") return null;
								var b = el.getBoundingClientRect();
								return { left: Math.round(b.left * 100) / 100, right: Math.round(b.right * 100) / 100, width: Math.round(b.width * 100) / 100 };
							};
							var a = r(mine), c = r(col);
							return {
								align: composerAlign(),
								composerLine: a,
								column: c,
								delta: (a && c) ? { left: Math.round((a.left - c.left) * 100) / 100, right: Math.round((a.right - c.right) * 100) / 100 } : null,
							};
						} catch (e) { return { error: String(e && e.message) }; }
					},
					// 设置面板（turn-fold 同一份实现/同一份存储）的调试入口
					popup: function () { return TF.getPopupState ? TF.getPopupState() : null; },
					setPopup: function (open) { if (TF.setPopupOpen) TF.setPopupOpen(!!open, "debug"); },
					setField: function (key, visible) { if (TF.setFieldVisible) TF.setFieldVisible(key, visible); },
					setIconStyle: function (style) { if (TF.setIconStyle) TF.setIconStyle(style); },
					fieldVisibility: function () { return TF.useFieldVisibility ? null : null; },
				};
			} catch (e) { /* ignore */ }
			var activeSlots = null;
			exports.apply = function (ctx) {
				ctx.inject(["slots"], function (scope) {
					var slotsSvc = scope.slots;
					activeSlots = slotsSvc;
					tryInstallComposerLine(slotsSvc);
					if (tryInstall(slotsSvc)) return;
					// bundle 装载时序竞态：官方 conversation 层可能尚未声明该 slot。
					// slots/changed 事件驱动补装（dsh-turn-fold deferred resolution 同款思路）。
					var attempts = 0;
					var off = null;
					try {
						off = ctx.on("slots/changed", function () {
							attempts++;
							tryInstallComposerLine(slotsSvc);
							if (tryInstall(slotsSvc) || attempts > 200) {
								if (typeof off === "function") off();
								if (!installed && attempts > 200) warnOnce("timeout", "official turn-tail renderer never appeared; footer disabled");
							}
						});
					} catch (e) {
						warnOnce("listen", "slots/changed unavailable; footer may miss registration window: " + (e && e.message));
					}
				});
				return function () {
					if (typeof installDispose === "function") installDispose();
					installed = false;
					officialTurnTailComponent = null;
					if (typeof composerDispose === "function") composerDispose();
					composerInstalled = false;
				};
			};

			return module.exports;
		},
	});
})();
