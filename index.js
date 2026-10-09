// dsh-turn-stats-footer: 宿主半边。
// 客户端逻辑全在 client.js（shadow 官方 turn-tail 渲染器，统计行垫在每轮最底部）。
// 宿主侧只做一件事：注册「调整统计行」技能（ctx.skills.registerProvider），
// 让 AI 代理在用户想改字段/样式时能加载完整流程。与 dsh-turn-fold 的技能注册
// 同一机制（@deepseek-ai/dsh-skill 的 BUNDLED_SKILL_RANK = 600，直接写死）。
//
// 注意：本文件必须「零外部依赖」——不 import 任何 @deepseek-ai/ 或第三方包，
// 避免在 DSH 不同版本/装配下因包解析失败导致整个插件加载崩溃。
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

export const name = 'dsh-turn-stats-footer'

// BUNDLED_SKILL_RANK 硬编码（来自 @deepseek-ai/dsh-skill，值 = 600）。
const BUNDLED_SKILL_RANK = 600

const SKILL_BODY_URL = new URL('assets/footer-skill.md', import.meta.url)
const RESOURCE_BASE = Object.freeze({
  kind: 'directory',
  path: fileURLToPath(new URL('.', import.meta.url)),
})
const INVOCATION = Object.freeze({ modelInvocable: true, userInvocable: true })
const DESCRIPTION = "调整 DSH 每轮回答最下方的统计行，以及输入框上方状态行区域那条常驻的「本轮」实时统计行（dsh-turn-stats-footer 插件：耗时 · 首字 · token · tok/s · 缓存 · 模型）。用户想增删/重排字段、改样式字号、改挂载位置、排查统计行不显示时使用。源码在 ~/.dsh/plugins/dsh-turn-stats-footer/client.js，离线自测 node tests/harness.test.mjs。"

const CANDIDATE = Object.freeze({
  name: 'dsh-turn-stats-footer',
  description: DESCRIPTION,
  invocation: INVOCATION,
  provider: 'dsh-turn-stats-footer',
  source: 'bundled',
  resourceBase: RESOURCE_BASE,
  rank: BUNDLED_SKILL_RANK,
  locator: SKILL_BODY_URL,
})

const provider = {
  name: 'dsh-turn-stats-footer',
  list: () => Promise.resolve([CANDIDATE]),
  async get(_candidate) {
    return {
      name: CANDIDATE.name,
      description: CANDIDATE.description,
      invocation: CANDIDATE.invocation,
      provider: CANDIDATE.provider,
      source: CANDIDATE.source,
      resourceBase: CANDIDATE.resourceBase,
      content: await readFile(SKILL_BODY_URL, 'utf8'),
    }
  },
}

/** @param {import('@deepseek-ai/cordis').Context} ctx */
export function apply(ctx) {
  // 用 ctx.inject 延迟注册：skills 服务就绪后回调执行。旧版 DSH（无 skills
  // 服务）不阻塞、不报错——统计行功能仍在前端正常工作，仅本技能不可用。
  const tryRegisterProvider = (scope) => {
    try {
      scope.skills.registerProvider(() => provider)
    } catch (error) {
      console.warn('[dsh-turn-stats-footer] skill provider registration skipped:', error)
    }
  }
  try {
    ctx.inject(['skills'], tryRegisterProvider)
  } catch (error) {
    console.warn('[dsh-turn-stats-footer] skill provider registration skipped:', error)
  }
}
