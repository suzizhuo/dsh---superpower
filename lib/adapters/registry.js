/**
 * 适配器注册表：按槽位持有适配器，未注册的槽位返回 Null 默认实现。
 *
 * 契约：register(adapter) 的 adapter.id 必须等于目标槽位 id；
 * get(slot) 永远返回一个可调用对象（Null 兜底），调用方无需判空。
 */
import { SLOT_IDS, SLOTS } from './types.js'
import { createNullPrepMemoryRead, createNullEvolutionMemory, createNullToolkit } from './null.js'

const NULL_FACTORIES = {
  [SLOTS.PREP_MEMORY_READ]: createNullPrepMemoryRead,
  [SLOTS.EVOLUTION_MEMORY]: createNullEvolutionMemory,
  [SLOTS.AGENT_TOOLKIT]: createNullToolkit,
}

export function createRegistry() {
  const adapters = new Map()

  return {
    /** @param {{ id: string }} adapter */
    register(adapter) {
      if (!adapter || typeof adapter !== 'object' || typeof adapter.id !== 'string') {
        throw new TypeError('adapter must be an object with a string id')
      }
      if (!SLOT_IDS.includes(adapter.id)) {
        throw new Error(`unknown adapter slot "${adapter.id}"; expected one of ${SLOT_IDS.join(', ')}`)
      }
      adapters.set(adapter.id, adapter)
      return adapter
    },

    /** 取适配器；未注册时返回该槽位的 Null 实现（每次新建，避免跨实例污染）。 */
    get(slot) {
      if (!SLOT_IDS.includes(slot)) throw new Error(`unknown adapter slot "${slot}"`)
      return adapters.get(slot) ?? NULL_FACTORIES[slot]()
    },

    /** 已注册的适配器（不含 Null）。 */
    registered() {
      return [...adapters.values()]
    },

    /** 全槽位健康视图：{ id, ok, reason? , label? } */
    health() {
      return SLOT_IDS.map((slot) => {
        const adapter = adapters.get(slot) ?? NULL_FACTORIES[slot]()
        const health = adapter.health()
        return { id: slot, ok: health.ok === true, reason: health.reason, label: adapter.describe?.().label }
      })
    },
  }
}
