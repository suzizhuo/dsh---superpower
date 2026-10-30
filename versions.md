# 版本

- 当前版本：0.2.0（2026-10-30 融合破甲人格槽，静态+真机+安装全过）
- 插件包名：dsh-superpower-vision
- 安装通道：DSH Desktop generation（profiles/web）
- 已装 generation：`dsh-superpower-vision+0.2.0+674dda650b65`（desired.json 指向，2026-10-30）
- 测试：63/63 绿（node --test --test-force-exit）；verify.mjs 14/14（含记忆夹校验）
- 参考版本谱系：superpowers-max-7.0.1（18 skills）/ superpowers-dsh-0.3.0（15 skills）/ @wenaixi/dsh-superpower 7.4.1
- 变更记录：
  - 0.1.0 首个可安装版本：host 采集 + 三适配器预留位 + 快照路由 + 三槽位 UI
  - 0.2.0 记忆工程规范 v1（MemOS 本地化）：specs/2026-10-30-memory-engineering-spec.md +
    ~/Desktop/Memory（schema.json / 记忆.jsonl / 索引.md / 画像.md / 归档/）+ scripts/verify-memory-dir.mjs +
    tests/memory-dir.test.mjs；人格槽单指定排他规则同步进 purge-preset 四处载体
  - 0.2.0 融合破甲：assets/purge-preset.yml 正文资产 + cordis.patch.yml 第二条 insert 行
    （preset-superpower-purge / 「破甲 · 人格槽」）+ lib/persona.js 武装态与预设探测 +
    snapshot persona 段 + 路由 persona:set + 客户端第六页签「破甲人格」（身份切换 + 开槽令）
