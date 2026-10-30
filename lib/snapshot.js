/**
 * 快照聚合 + host 路由。
 *
 * buildSnapshot：把采集器输出与适配器读数为一份 JSON（客户端唯一数据源）。
 * createSnapshotRoute：顶层 exact 路由（禁 /api/，桌面端 405 坑），
 *   GET  → 快照 JSON
 *   POST → { action:'evolve:ingest' } 手动进化；'memory:search' 预留；
 *          'persona:set' { mode } 切换破甲人格槽武装态。
 *   其它方法 405（allow: GET, POST）；坏 JSON → 500 不崩。
 */

function sendJson(response, status, payload) {
  const body = JSON.stringify(payload)
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  })
  response.end(body)
}

async function readJson(request, limitBytes = 64 * 1024) {
  return new Promise((resolve, reject) => {
    let raw = ''
    let size = 0
    request.on('data', (chunk) => {
      size += chunk.length
      if (size > limitBytes) {
        reject(new Error('request body too large'))
        request.destroy?.()
        return
      }
      raw += chunk
    })
    request.on('end', () => {
      if (!raw.trim()) {
        resolve({})
        return
      }
      try {
        resolve(JSON.parse(raw))
      } catch (error) {
        reject(error)
      }
    })
    request.on('error', reject)
  })
}

/**
 * @param {{ skills: object, plugins: object, toolkits: object[], prepMemory: object, spoolStats: { pending: number, total: number }, auto: boolean, persona: object }} input
 * @returns {Promise<object>} 快照（section 键见下，客户端按此渲染）
 */
export async function buildSnapshot(input) {
  const {
    skills,
    plugins,
    toolkits = [],
    prepMemory,
    spoolStats = { pending: 0, total: 0 },
    auto = false,
    persona,
  } = input

  let bases = []
  let memoryReason
  try {
    const listed = await prepMemory.listKnowledgeBases()
    if (Array.isArray(listed)) bases = listed
    else memoryReason = listed?.reason ?? 'unknown'
  } catch (error) {
    memoryReason = error && error.message ? error.message : String(error)
  }
  // 空库时从适配器健康态取理由（Null → not-connected；库真空 → 无理由）
  if (bases.length === 0 && memoryReason === undefined) {
    const health = typeof prepMemory.health === 'function' ? prepMemory.health() : {}
    if (health.ok === false) memoryReason = health.reason ?? 'unknown'
  }

  return {
    generatedAt: new Date().toISOString(),
    counts: {
      skills: skills?.entries?.length ?? 0,
      plugins: plugins?.generations?.length ?? 0,
      toolkits: toolkits.length,
      kbPending: spoolStats.pending ?? 0,
    },
    skills: {
      entries: skills?.entries ?? [],
      drift: skills?.drift ?? { onDiskOnly: [], brokenLocator: [] },
      reason: skills?.reason,
    },
    plugins: {
      desired: plugins?.desired ?? [],
      generations: plugins?.generations ?? [],
      patchRows: plugins?.patchRows ?? [],
    },
    memory: { bases, reason: memoryReason },
    evolution: { spool: { pending: spoolStats.pending ?? 0, total: spoolStats.total ?? 0 }, auto },
    toolkits,
    persona: persona ?? {
      mode: 'off',
      updatedAt: null,
      modes: ['off', 'jiangmengli', 'qitongwei', 'dual'],
      kick: null,
      presets: [],
      personas: [],
    },
  }
}

/** 生成 host.effect 里注册用的 route 对象（kind/path/handler 三字段）。 */
export function createSnapshotRoute({ getSnapshot, onEvolveIngest, onMemorySearch, onPersonaSet }) {
  return {
    kind: 'exact',
    path: '/dsh-superpower-vision/snapshot',
    async handler(request, response) {
      try {
        if (request.method === 'GET') {
          sendJson(response, 200, await getSnapshot())
          return
        }
        if (request.method === 'POST') {
          const body = await readJson(request)
          if (body.action === 'evolve:ingest') {
            const result = await onEvolveIngest()
            sendJson(response, 200, result ?? { ok: true })
            return
          }
          if (body.action === 'memory:search') {
            const result = onMemorySearch ? await onMemorySearch(body) : { ok: false, reason: 'reserved' }
            sendJson(response, result?.ok === false ? 501 : 200, result)
            return
          }
          if (body.action === 'persona:set') {
            const result = onPersonaSet
              ? await onPersonaSet(body)
              : { ok: false, reason: 'reserved' }
            sendJson(response, result?.ok === false ? 400 : 200, result)
            return
          }
          sendJson(response, 400, { ok: false, reason: `unknown action "${body.action ?? ''}"` })
          return
        }
        response.writeHead(405, { allow: 'GET, POST' })
        response.end()
      } catch (error) {
        sendJson(response, 500, { ok: false, error: error && error.message ? error.message : String(error) })
      }
    },
  }
}
