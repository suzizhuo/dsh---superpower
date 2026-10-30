/**
 * MCP server 行采集器：从 profile patch 里找出 `@deepseek-ai/dsh-mcp-client` 行。
 *
 * 桌面端 MCP 行样例（本机唯一一条，ANYTHING-KB-MANAGED-BLOCK 内）：
 *   - id: mcp-anything-kb
 *     name: '@deepseek-ai/dsh-mcp-client'
 *     config:
 *       serverName: anything-kb
 *       transport: stdio
 *       command: '/Applications/AnyThingKB.app/Contents/MacOS/kb-mcp'
 *       env: { ANYTHING_KB_DEFAULT_OPERATOR: 'ai:mcp:dsh' }
 *
 * 返回给 Toolkit/PrepMemory 适配层做发现；解析失败一律返回 []（不抛）。
 */
import { collectInsertRows, readProfilePatch } from './plugins.js'

const MCP_CLIENT_PACKAGE = '@deepseek-ai/dsh-mcp-client'

/** @returns {{ rowId: string, serverName: string, transport: string, command: string, args: string[], env: Record<string,string> }[]} */
export function extractMcpRows(doc) {
  if (doc === null || doc === undefined) return []
  const rows = []
  for (const row of collectInsertRows(doc)) {
    if (row.name !== MCP_CLIENT_PACKAGE) continue
    const config = row.config ?? {}
    rows.push({
      rowId: row.id,
      serverName: typeof config.serverName === 'string' ? config.serverName : row.id,
      transport: typeof config.transport === 'string' ? config.transport : 'stdio',
      command: typeof config.command === 'string' ? config.command : '',
      args: Array.isArray(config.args) ? config.args.map(String) : [],
      env: config.env && typeof config.env === 'object' ? { ...config.env } : {},
    })
  }
  return rows
}

export function collectMcpServers(harnessHome) {
  const { doc } = readProfilePatch(harnessHome)
  return extractMcpRows(doc)
}
