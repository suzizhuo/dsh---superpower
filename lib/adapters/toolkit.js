/**
 * Agent Toolkit 适配层（ToolkitAdapter 契约 + 采集 + 占位）。
 *
 * 设计目标（operator 追加要求③：适配以后的 agent toolkit）：
 *   · 现在：从 profile patch 的 MCP 行生成 toolkit 描述符， UI 展示健康状态；
 *   · 未来新 toolkit = 加一行 MCP 配置 + （可选）在 lib/adapters/ 丢一个
 *     toolkit-<name>.js 文件，向 registry 注册更丰富的行为；
 *   · invoke / tools() 在 0.1.0 为预留位，返回 { ok:false, reason:'reserved' }。
 */
import { existsSync } from 'node:fs'

/** MCP 行 → 面板描述符；stdio 行按 command 可执行判定健康。 */
export function describeToolkits(rows) {
  return (rows ?? []).map((row) => ({
    id: row.serverName ?? row.rowId,
    serverName: row.serverName,
    transport: row.transport,
    command: row.command,
    health: {
      ok: !(row.transport === 'stdio' && !row.command) && !(row.transport === 'stdio' && !existsSync(row.command)),
      reason: row.transport === 'stdio' && !existsSync(row.command) ? 'command-not-found' : undefined,
    },
  }))
}

export function createToolkitAdapter({ rows = [], rpc = null } = {}) {
  const descriptors = describeToolkits(rows)
  return {
    id: 'agent-toolkit',
    kind: 'toolkit',

    describe() {
      return { id: 'agent-toolkit', kind: 'toolkit', label: `Agent Toolkit（${descriptors.length} 个 MCP 行）` }
    },

    health() {
      const healthy = descriptors.filter((d) => d.health.ok).length
      return healthy > 0
        ? { ok: true, healthy, total: descriptors.length }
        : { ok: false, reason: descriptors.length === 0 ? 'not-connected' : 'no-healthy-toolkit', total: descriptors.length }
    },

    tools() {
      // 0.1.0 预留：远程工具枚举未接线；返回描述符级摘要供面板展示
      return descriptors.map((d) => ({ id: d.id, transport: d.transport, command: d.command, health: d.health }))
    },

    async invoke() {
      return { ok: false, reason: 'reserved' }
    },

    get descriptors() {
      return descriptors
    },
  }
}
