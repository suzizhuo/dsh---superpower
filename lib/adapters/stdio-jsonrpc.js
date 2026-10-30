/**
 * 换行分隔 JSON-RPC 2.0 stdio 客户端（MCP over stdio 最小实现）。
 *
 * - spawn 目标进程，请求写 stdin、响应按行读 stdout；
 * - 首请求前自动 initialize 握手（收到 result 后才放行队列中的请求）；
 * - 超时拒绝；进程退出/断流时拒绝全部在途请求；
 * - close() 杀进程并拒后续请求。
 */
import { spawn } from 'node:child_process'
import { createInterface } from 'node:readline'

export function createStdioJsonRpc(options = {}) {
  const {
    command,
    args = [],
    env = {},
    timeoutMs = 5000,
    cwd,
  } = options

  const child = spawn(command, args, {
    cwd,
    env: { ...process.env, ...env },
    stdio: ['pipe', 'pipe', 'pipe'],
  })
  // 不阻塞宿主事件循环退出（测试与 host 侧都可能只持有 transport）
  child.unref()

  const pending = new Map() // id → { resolve, reject, timer }
  const readyQueue = []
  let nextId = 1
  let initialized = false
  let closed = false
  let stderrTail = ''

  child.stderr?.on('data', (chunk) => {
    stderrTail = (stderrTail + String(chunk)).slice(-2000)
  })

  const failAll = (error) => {
    for (const [, entry] of pending) {
      clearTimeout(entry.timer)
      entry.reject(error)
    }
    pending.clear()
    readyQueue.length = 0
  }

  child.on('exit', (code) => {
    if (closed) return
    failAll(new Error(`stdio process exited (code ${code ?? 'null'})${stderrTail ? `: ${stderrTail.slice(0, 200)}` : ''}`))
  })
  child.on('error', (error) => failAll(error))

  const rl = createInterface({ input: child.stdout, terminal: false })
  rl.on('line', (line) => {
    let msg
    try {
      msg = JSON.parse(line)
    } catch {
      return
    }
    const entry = pending.get(msg.id)
    if (!entry) return
    pending.delete(msg.id)
    clearTimeout(entry.timer)
    if (msg.error) {
      entry.reject(new Error(`rpc error ${msg.error.code}: ${msg.error.message}`))
    } else {
      entry.resolve(msg.result)
    }
  })

  const writeLine = (payload) => {
    if (closed || child.stdin.destroyed) throw new Error('stdio transport is closed')
    child.stdin.write(`${JSON.stringify(payload)}\n`)
  }

  const send = (method, params) =>
    new Promise((resolve, reject) => {
      if (closed) {
        reject(new Error('stdio transport is closed'))
        return
      }
      const id = nextId++
      const timer = setTimeout(() => {
        pending.delete(id)
        reject(new Error(`rpc timeout after ${timeoutMs}ms: ${method}`))
      }, timeoutMs)
      pending.set(id, { resolve, reject, timer })
      writeLine({ jsonrpc: '2.0', id, method, ...(params === undefined ? {} : { params }) })
    })

  const flushQueue = () => {
    initialized = true
    while (readyQueue.length > 0) {
      const { method, params, resolve, reject } = readyQueue.shift()
      send(method, params).then(resolve, reject)
    }
  }

  async function request(method, params) {
    if (closed) throw new Error('stdio transport is closed')
    if (!initialized) {
      return new Promise((resolve, reject) => {
        readyQueue.push({ method, params, resolve, reject })
      })
    }
    return send(method, params)
  }

  // initialize 握手（带超时；失败即整个 transport 不可用）
  const initializePromise = send('initialize', {
    protocolVersion: '2024-11-05',
    capabilities: {},
    clientInfo: { name: 'dsh-superpower-vision', version: '0.1.0' },
  })
  initializePromise.then(
    () => {
      try {
        writeLine({ jsonrpc: '2.0', method: 'notifications/initialized' })
      } catch {
        /* 断流时 initialize 已失败，队列会随之拒绝 */
      }
      flushQueue()
    },
    () => {
      // 握手失败（超时/单实例锁/进程即退）：自毁传输，防孤儿进程与事件循环悬挂
      closed = true
      failAll(new Error('initialize failed; stdio transport unusable'))
      try {
        child.kill('SIGKILL')
      } catch {
        /* ignore */
      }
      try {
        child.stdout?.destroy()
        child.stdin?.destroy()
      } catch {
        /* ignore */
      }
    },
  )

  return {
    request,
    get ready() {
      return initialized
    },
    close() {
      if (closed) return
      closed = true
      failAll(new Error('stdio transport closed by client'))
      for (const stream of [child.stdin, child.stdout, child.stderr]) {
        try {
          stream?.destroy()
        } catch {
          /* ignore */
        }
      }
      try {
        child.kill('SIGTERM')
      } catch {
        /* ignore */
      }
    },
  }
}
