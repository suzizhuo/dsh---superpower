# 决策记录

- 2026-10-29 D2（builder call）：放弃 `{project}-{version}/Resource|Release` 包装器。
  理由：`dsh plugin add <dir>` 的安装单元必须是包根，包装器会让 generation 安装拿不到
  package.json。替代：包根即源码；产物 .tgz 进 Release/。详见 specs/2026-10-29-*-design.md D2。
- 2026-10-29 D3（builder call）：提交（git commit）推迟到 P6，须 operator 明确要求
  （house rule）。计划中的 Commit 步骤全部标注为 deferred。
- 2026-10-29 D4（来自 spec 已定项 D1–D7）：标识体系、host/client 结构、KB stdio 客户端、
  spool 路径、样式与 i18n 契约。spec 为准，不在此重复。
