/**
 * 假 kb-mcp：换行分隔 JSON-RPC 的服务端，用于 T5 测试（子进程运行）。
 *
 * 支持方法：
 *   initialize           → 协议声明
 *   tools/list           → 四个 kb 工具名
 *   tools/call           → 按 params.name 返回 fixture；特殊 query 触发 timeout 用例
 */
import { createInterface } from 'node:readline'

const rl = createInterface({ input: process.stdin, terminal: false })

function send(payload) {
  process.stdout.write(`${JSON.stringify(payload)}\n`)
}

rl.on('line', (line) => {
  let msg
  try {
    msg = JSON.parse(line)
  } catch {
    return
  }
  if (msg.method === 'initialize') {
    send({ jsonrpc: '2.0', id: msg.id, result: { protocolVersion: '2024-11-05', serverInfo: { name: 'fake-kb-mcp' } } })
    return
  }
  if (msg.method === 'notifications/initialized') return
  if (msg.method === 'tools/list') {
    send({
      jsonrpc: '2.0',
      id: msg.id,
      result: {
        tools: [
          { name: 'list_knowledge_bases' },
          { name: 'kb_stats' },
          { name: 'search_knowledge' },
          { name: 'search_deep' },
        ],
      },
    })
    return
  }
  if (msg.method === 'tools/call') {
    const name = msg.params?.name
    if (name === 'list_knowledge_bases') {
      send({ jsonrpc: '2.0', id: msg.id, result: { content: [{ type: 'text', text: JSON.stringify({ bases: [{ key: 'ai', name: 'ai', items: 135 }, { key: 'user', name: 'about user', items: 0 }] }) }] } })
      return
    }
    if (name === 'kb_stats') {
      send({ jsonrpc: '2.0', id: msg.id, result: { content: [{ type: 'text', text: JSON.stringify({ base: msg.params?.arguments?.base ?? 'ai', approved: 98, pending: 11 }) }] } })
      return
    }
    if (name === 'search_knowledge') {
      const args = msg.params?.arguments ?? {}
      if (args.query === '__trigger_timeout__') return // 故意不回 → 客户端超时用例
      send({ jsonrpc: '2.0', id: msg.id, result: { content: [{ type: 'text', text: JSON.stringify({ hits: [{ id: 1, title: `hit-for:${args.query}`, base: args.base, topK: args.top_k }] }) }] } })
      return
    }
    if (name === 'search_deep') {
      send({ jsonrpc: '2.0', id: msg.id, result: { content: [{ type: 'text', text: JSON.stringify({ task_id: 't-1', hits: [{ id: 2, title: 'deep-hit' }] }) }] } })
      return
    }
    send({ jsonrpc: '2.0', id: msg.id, error: { code: -32601, message: `unknown tool ${name}` } })
    return
  }
  send({ jsonrpc: '2.0', id: msg.id ?? null, error: { code: -32601, message: `method not found: ${msg.method}` } })
})
