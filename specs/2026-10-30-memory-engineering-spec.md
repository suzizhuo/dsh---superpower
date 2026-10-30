# 记忆工程规范 v1（MemOS 本地化）

> 状态：已定稿并实施（2026-10-30）
> 参考：`/Volumes/MY_USB/Download/MemOS-2.0.34/MemOS-2.0.34-Complete-Technical-Reference.md`
> 落地：桌面 `~/Desktop/Memory/`（schema 见 `schema.json`）；宿主侧采集见 `lib/persona.js`、
> `lib/collectors/*`、`lib/adapters/*`；人格侧脚本见技能 `jiangmengli` / `qitongwei` 的 `scripts/memory.py`。
> 原则：**不用向量库、不用第三方依赖、全文可读、可迁移、可回滚**。MemOS 的机制照抄，
> 载体换成「一个 JSONL + 三个 Markdown」——够本地用，且任何工具都能 grep。

## 一、分层（照 MemOS 的 OS 隐喻，压到四层）

| 层 | 本地实现 | 对应 MemOS |
|---|---|---|
| 应用 / 客户端 | DSH 面板（破甲人格 / 记忆复用库页签）、人格技能回话 | Application / Client / MCP |
| 编排 | session 事件钩子、spool、预设探测 | mem_os / mem_scheduler |
| 容器 | `~/Desktop/Memory/`（MemCube 等价物）＋ 各技能 `<工作区>/Memory/` | GeneralMemCube |
| 引擎 | JSONL 追加 + grep/词面检索 + 归档轮转 | memories/textual · mem_reader |

依赖只准向下：应用可以调编排、编排可以调容器与引擎；**引擎永不反向 import 上层**。
（工程含义：`lib/persona.js` 只读文件与解析，不知道面板长什么样。）

## 二、记录类型（TextualMemoryItem 本地化）

一行一条 JSON，字段照 MemOS 的 metadata 链压平。必填 3 个：`text` `role` `at`；其余有默认。

| 字段 | 类型 | 默认 | 说明 |
|---|---|---|---|
| `id` | string(uuid) | 生成 | 全库唯一；重复 id 写入即拒（判 `voice/dup`） |
| `at` | ISO8601 | 生成 | 写入时间（本地时区） |
| `session` | string | `""` | 会话号；空＝跨会话长期条目 |
| `role` | `user`/`assistant`/`system` | — | 来源角色 |
| `kind` | `fact`/`preference`/`rule`/`event`/`task`/`trace` | `event` | 条目类别（MemOS `type`） |
| `text` | string | — | 正文；一条一事，越短越好 |
| `key` | string | `""` | 短标题（检索时优先命中） |
| `tags` | string[] | `[]` | `mode:fast` 为保留值（无 LLM 加工直写） |
| `status` | `activated`/`resolving`/`archived`/`deleted` | `activated` | 生命周期（见 五） |
| `confidence` | 0–1 | 0.7 | 可信度；低置信度排后 |
| `source` | `conversation`/`file`/`system`/`web` | `conversation` | 来源（MemOS `source`） |
| `visibility` | string | `private` | 共享范围 |
| `version` | int | 1 | 单调递增；更新时 +1 并把旧值写进 `history` |
| `covered_history` | string/null | null | 被本条目取代的旧条目 id（MemOS 同名） |
| `evolve_to` | string[] | `[]` | 本条目演化出的条目 id |
| `working_binding` | string/null | null | 关联工作区条目（MemOS 同名） |

规范来自 MemOS `TextualMemoryMetadata`（§6.2）：`extra="allow"` 的精神保留——**未登记字段不丢**，
但规范字段优先解析；`extra="forbid"` 的严格度只用于 `schema.json` 自检，不用于运行时（运行时宽容）。

## 三、三种记忆形态（本地映射）

| MemOS 形态 | 本地实现 | 说明 |
|---|---|---|
| textual（可寻址、带版本、可查） | `记忆.jsonl` | 唯一事实源；一切读写都落到这里 |
| activation（喂回模型的运行时产物） | `digest` / `recall` 的输出文本 | 每次开场贴进上下文的那段「记忆近况」 |
| parametric（加载进模型的参数/文件） | `画像.md` + `rule` 条目 | 长期画像与规矩，随提示词常驻 |

**三态同源**：activation 与 parametric 都由 textual 派生，不允许手改派生物而不改源——
改 `画像.md` 等于写一条 `role=system, kind=rule` 的条目，两者必成对。

## 四、写路径（add）

1. 每条记忆一行追加到 `记忆.jsonl`；**只追加，不重写**（MemOS `TreeTextMemory.add` 的追加语义）。
2. 写前查重：`text` 相同且 `status=activated` 已存在 ⇒ 不重复入库（抬 `confidence` 后跳过）。
3. 冲突判定走 NodeHandler 本地版：
   - **矛盾**（新条目与旧条目的 `key` 相同而 `text` 相反）⇒ 旧条目标 `archived`，
     新条目写 `covered_history=<旧id>`、`version=旧+1`；
   - **冗余**（语义等价）⇒ 合并：保留新 `text`，`tags`/`sources` 取并集，`version+1`；
   - **独立** ⇒ 直接追加。
4. 批写上限 5 条一批（MemOS `batch_size=5`）；单次 `remember` 只写一条。
5. `mode:fast` 标记：未经加工的原话直写，不调 LLM 归类，`kind` 留默认 `event`。

## 五、生命周期（status 机）

```
activated ──被取代/合并──▶ archived ──超阈值轮转──▶ 归档/<file>-<ts>.jsonl
    │                                                    
    └──soft delete──▶ deleted（不出现在任何检索结果里，行仍在文件里）
resolving：待确认（低置信 / 等待 operator 定夺）—— 不进 digest，只进人工审核清单
```

- `archived` 不删除：MemOS 用墓碑 + `MERGED_TO` 边保血缘；本地用 `covered_history` 字段达到同样效果。
- 轮转阈值：单文件 > 4 MB（技能侧老约定）或条目 > 20,000 行；轮转时保留最新 2,000 行在原文件。
- `deleted` 只做软删除：行留着、检索过滤掉。物理删只有一种情况——operator 明说「这条删了」。

## 六、读路径（六条路径本地化）

| 路径 | MemOS | 本地做法 |
|---|---|---|
| A 工作记忆 | WorkingMemory | 取最近 N 条 `activated`（N=12），按 `at` 倒序，不打分 |
| B 长期 + 用户 | LongTermMemory/UserMemory | `recall <词>` 在 `记忆.jsonl` 与 `画像.md` 里做词面命中；用户画像优先 |
| C 互联网 | OuterMemory | 本机不接（无网络检索器）；需要时走 web 工具，结果以 `source=web` 落库 |
| D 工具记忆 | ToolSchema/Trajectory | Toolkit 描述符（`lib/adapters/toolkit.js`）与调用轨迹，不进本夹 |
| E 技能记忆 | SkillMemory | 技能清单（`lib/collectors/skills.js`）；技能本身改动不入本夹，只入 `kind=task` |
| F 偏好记忆 | PreferenceMemory | `kind=preference` 条目 + `rule` 条目；回复排序时加权 |

后处理（post_retrieve 本地版）：按 `text` 去重（保留置信度最高的一条）→ `kind` 分桶
（preference 与 rule 各取 top 6/3）→ 其余按 `confidence` 与新鲜度排序取 top_k → 丢掉 0 分项（等价 MemOS 的 `relativity` 归零即弃）。

**检索词构造**：先分词（中文按 2–4 字滑窗 + 停用词过滤；英文按词干），不要整句丢进去——
MemOS 的 `TaskGoalParser` fast 档就是这个路子。

## 七、遗忘与容量

- **容量**：`activated` 上限 5,000 条；超限按 `confidence × 新鲜度` 淘汰最旧的 20% 转 `archived`。
- **时间衰减**：`confidence` 每 30 天 ×0.95（下界 0.1），与情绪衰减同一节奏（技能 `mood.py decay`）。
- **工作记忆滚动**：WorkingMemory 概念 = digest 的最近 12 条；滚动只改 digest，不改源。

## 八、调度（何时写、何时读）

| 触发 | 动作 | 优先级 |
|---|---|---|
| 会话开场 | `digest`（读最近 12 条 + 画像抬头）贴进上下文 | 高 |
| 每跳结束 | `remember` 两条（user/assistant） | 中 |
| 会话结束（`session/disposed`） | spool 待写条目批量 ingest | 低（节流：同会话一次） |
| 手动 | `recall` / `index` / `export` / `import` | 按需 |

节流与队列语义照 MemOS 的 SchedulerDispatcher：**同会话一次、失败重试一次、失败落盘不丢**。

## 九、迁移与互操作

- **迁移 = 拷贝目录**：整个 `Memory/` 拷走即恢复（`export`/`import` 子命令只补不覆盖）。
- **人格技能共用**：`memory.py --dir ~/Desktop/Memory` 即把江梦璃/祁同伟的记忆指向桌面主夹；
  不传 `--dir` 时仍用 `<工作区>/Memory/`（向后兼容）。
- **宿主侧**：vision 插件的 prep-memory / evolution 适配器读的是 kb-mcp 知识库，
  与本夹是两条通道：本夹管人格记忆，kb-mcp 管工程知识；两者通过 `kind=task` 条目互相引用。

## 十、验收清单

1. `记忆.jsonl` 每行是合法 JSON，`text`/`role`/`at` 三个必填在；
2. `id` 无重复；`covered_history`/`evolve_to` 指向的 id 都真实存在（允许指向已归档）；
3. `索引.md` 条数与文件行数一致（`index` 重写后）；
4. `画像.md` 每条规矩都有对应 `kind=rule` 条目（三态同源）；
5. 超 4 MB 时已轮转，原文件保留最新 2,000 行；
6. 迁移演练：`export` 到临时目录 → 删源 → `import` 回来 → `recall` 命中不变。
