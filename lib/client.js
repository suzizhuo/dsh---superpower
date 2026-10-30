/**
 * dsh-superpower-vision —— 浏览器半边（客户端 factory，唯一产物源，无构建步骤）
 *
 * 形态：`window.__ModuleLoader__.load` 的同步 CJS factory（DSH 客户端契约）。
 * 数据：同源 fetch 顶层 exact 路由 `/dsh-superpower-vision/snapshot`
 *       （credentials:'same-origin', cache:'no-store'，dsh-function-preview 同款），
 *       5 秒轮询 + 手动刷新。
 * 入口：settings.section 主面板（六页签：技能/插件/记忆/进化/Toolkit/破甲人格，不挂 whileServed）；
 *       plugins.item 插件管理卡片（六数字总览，挂 whileServed，dsh-api-pool 同款）；
 *       shell.overlay 速览浮窗（dsh-function-preview 同款）。
 * 写操作：POST { action:'evolve:ingest' } 手动进化归档；
 *       POST { action:'persona:set', mode } 切换破甲人格槽武装态。
 * 'memory:search' 为预留 action（路由已留 501 reserved 语义，UI 展示预留徽标）。
 * 纯函数内联在本文件 __HELPERS__ 标记块（tests/client.test.mjs 抽取后 vm 求值），
 * 不引入兄弟文件 require——已装插件无此先例。
 * 写操作：POST { action:'evolve:ingest' } 触发手动进化归档。
 * 'memory:search' 为预留 action（T8 路由已留 501 reserved 语义，UI 展示预留徽标）。
 *
 * 纯函数在 lib/client-helpers.js（可 node --test）；本文件只做渲染与注册。
 */

window.__ModuleLoader__.load({
  id: 'dsh-superpower-vision',
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
    Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });

    var React = require('react');
    var h = React.createElement;
    var P = require('@deepseek-ai/dsh-client-ui-primitives');

    /* __HELPERS_START__ —— 纯函数（tests/client.test.mjs 按标记块抽取后 vm 求值，
       单一来源、零漂移；不引入兄弟文件 require——已装插件无此先例）。 */
    function num(value) { return Number.isFinite(value) ? value : 0 }

    /** 快照 → 五个数字；null 快照返回 null 由调用方判空。 */
    function formatCounts(snapshot) {
      if (!snapshot || typeof snapshot !== 'object') return null;
      var counts = snapshot.counts || {};
      var evolution = snapshot.evolution || {};
      var memory = snapshot.memory || {};
      return {
        skills: num(counts.skills),
        plugins: num(counts.plugins),
        memory: Array.isArray(memory.bases) ? memory.bases.length : 0,
        pending: num(evolution.spool && evolution.spool.pending),
        toolkits: num(counts.toolkits),
      };
    }

    /** 关键词过滤技能条目（name/provider/source 命中即留）。 */
    function skillsShown(entries, keyword) {
      var list = Array.isArray(entries) ? entries : [];
      var lower = String(keyword || '').trim().toLowerCase();
      if (!lower) return list;
      return list.filter(function (entry) {
        var name = String(entry.name || '').toLowerCase();
        var provider = String(entry.provider || '').toLowerCase();
        var source = String(entry.source || '').toLowerCase();
        return name.indexOf(lower) >= 0 || provider.indexOf(lower) >= 0 || source.indexOf(lower) >= 0;
      });
    }

    /** 分区不可用时的降级文案：优先 section.reason。 */
    function degradedText(section, fallbackKey, t) {
      var reason = section && section.reason;
      if (typeof reason === 'string' && reason.length > 0) return t(fallbackKey) + '（' + reason + '）';
      return t(fallbackKey);
    }

    /** 技能来源徽标与 rank 展示（显示安全）。 */
    function sourceLabel(entry) {
      return entry && typeof entry.source === 'string' && entry.source ? entry.source : 'unknown';
    }
    function rankLabel(entry) {
      return entry && Number.isFinite(entry.rank) ? String(entry.rank) : '—';
    }

    var helpers = {
      formatCounts: formatCounts,
      skillsShown: skillsShown,
      degradedText: degradedText,
      sourceLabel: sourceLabel,
      rankLabel: rankLabel,
      PERSONA_MODES: PERSONA_MODES,
      personaOf: personaOf,
      personaModeKey: personaModeKey,
      fusedPreset: fusedPreset,
      personaCardById: personaCardById,
      copyKick: copyKick,
    };
    /* ---- 人格槽纯函数 ---- */
    var PERSONA_MODES = ['off', 'jiangmengli', 'qitongwei', 'dual'];

    /** 快照 persona 段缺省（老快照 / 路由未就绪时 UI 不炸）。 */
    function personaOf(snapshot) {
      var p = snapshot && snapshot.persona;
      if (!p || typeof p !== 'object') {
        return { mode: 'off', updatedAt: null, modes: PERSONA_MODES, kick: null, presets: [], personas: [] };
      }
      return {
        mode: PERSONA_MODES.indexOf(p.mode) >= 0 ? p.mode : 'off',
        updatedAt: typeof p.updatedAt === 'string' ? p.updatedAt : null,
        modes: Array.isArray(p.modes) && p.modes.length ? p.modes : PERSONA_MODES,
        kick: typeof p.kick === 'string' ? p.kick : null,
        presets: Array.isArray(p.presets) ? p.presets : [],
        personas: Array.isArray(p.personas) ? p.personas : []
      };
    }

    /** 当前武装模式的展示标签 key（t() 取 'purge.mode.<mode>'）。 */
    function personaModeKey(mode) { return 'purge.mode.' + (PERSONA_MODES.indexOf(mode) >= 0 ? mode : 'off') }

    /** 找 preset 行里第一个带人格槽的（视图据此显示「融合状态」）。 */
    function fusedPreset(presets) {
      var list = Array.isArray(presets) ? presets : [];
      for (var i = 0; i < list.length; i++) {
        if (list[i] && list[i].hasPersonaSlots) return list[i];
      }
      return null;
    }

    /** 人格卡按 id 找；找不到返回 null。 */
    function personaCardById(personas, id) {
      var list = Array.isArray(personas) ? personas : [];
      for (var i = 0; i < list.length; i++) if (list[i] && list[i].id === id) return list[i];
      return null;
    }

    /** 复制开槽令；无 clipboard 时返回 false 让调用方走降级提示。 */
    function copyKick(kick) {
      if (typeof kick !== 'string' || !kick) return Promise.resolve(false);
      if (typeof navigator !== 'undefined' && navigator.clipboard && navigator.clipboard.writeText) {
        return navigator.clipboard.writeText(kick).then(function () { return true }, function () { return false });
      }
      return Promise.resolve(false);
    }

    /* __HELPERS_END__ */

    var PACKAGE_NAME = 'dsh-superpower-vision';
    var PACKAGE_VERSION = '0.1.0';
    var NS = 'dsh-superpower-vision';
    var SECTION_ID = 'superpower-vision';
    var PLUGIN_ITEM_ID = 'dsh-superpower-vision';
    var OVERLAY_ID = 'dsh-superpower-vision-overlay';
    var ROUTE = '/dsh-superpower-vision/snapshot';
    var POLL_MS = 5000;
    var TABS = ['skills', 'plugins', 'memory', 'evolution', 'toolkits', 'purge'];

    var zh = {
      nav: '超能力全景',
      title: '超能力全景',
      intro: '技能库 / 插件注册表 / 记忆复用库 / 进化记忆 / Agent Toolkit 一站式状态面板。数据来自宿主快照路由，5 秒轮询。',
      loading: '正在读取宿主快照…',
      hostUnavailable: '当前宿主未提供本插件的配置通道，面板暂不可用',
      build: '面板版本',
      refresh: '刷新',
      snapshotFailed: '快照读取失败',
      'tabs.skills': '技能库',
      'tabs.plugins': '插件注册表',
      'tabs.memory': '记忆复用库',
      'tabs.evolution': '进化记忆',
      'tabs.toolkits': 'Agent Toolkit',
      'summary.skills': '技能',
      'summary.plugins': '插件',
      'summary.memory': '记忆库',
      'summary.pending': '待写',
      'summary.toolkits': 'Toolkit',
      'skills.search': '按名称 / 提供方 / 来源过滤',
      'skills.empty': '没有匹配的技能',
      'skills.drift.onDiskOnly': '磁盘有、注册表没有（未生效）',
      'skills.drift.brokenLocator': '注册表有、磁盘缺失（失效）',
      'skills.col.name': '名称',
      'skills.col.provider': '提供方',
      'skills.col.source': '来源',
      'skills.col.rank': '优先级',
      'skills.invocable': '可调用',
      'plugins.desired': 'desired 指针',
      'plugins.generations': 'generation',
      'plugins.patchRows': 'patch 行',
      'plugins.empty': '没有 generation 记录',
      'memory.bases': '知识库',
      'memory.empty': '未发现知识库',
      'memory.notConnected': '记忆复用库未接入',
      'memory.reason': '原因',
      'evolution.pending': '待写记录',
      'evolution.total': 'spool 总数',
      'evolution.autoOn': '自动归档：开',
      'evolution.autoOff': '自动归档：关',
      'evolution.auto': '自动归档',
      'evolve.now': '立即归档',
      'evolve.running': '归档中…',
      'evolve.ok': '已归档',
      'evolve.failed': '归档失败',
      'evolve.reserved': '写通道未接入',
      'toolkit.health': '状态',
      'toolkit.transport': '传输',
      'toolkit.command': '命令',
      'toolkit.empty': '未发现 MCP server 行',
      'toolkit.hint': '接入新 toolkit：在 profile patch 增加一行 @deepseek-ai/dsh-mcp-client，或向 lib/adapters/ 添加 adapter 文件后重装插件。',
      'toolkit.unhealthy': '不健康',
      'toolkit.healthy': '可用',
      'overlay.title': '超能力速览',
      'overlay.refresh': '刷新',
      'summary.armed': '已武装',
      'tabs.purge': '破甲人格',
      'purge.presetTitle': '破甲预设 · 融合状态',
      'purge.presetEmpty': '未发现带人格槽的破甲预设 —— 重装本插件或安装 dsh-purge-preset 后刷新。',
      'purge.presetSlots': '含人格槽',
      'purge.presetNoSlots': '无人格槽',
      'purge.presetSource': '来源',
      'purge.presetId': '预设 id',
      'purge.presetBytes': '正文字节',
      'purge.personaTitle': '常驻人格',
      'purge.switchTitle': '身份切换',
      'purge.switchHint': '切换后把「开槽令」发进会话，下一轮即按该身份回话。',
      'purge.mode.off': '关闭（本体）',
      'purge.mode.jiangmengli': '只指定 · 江梦璃',
      'purge.mode.qitongwei': '只指定 · 祁同伟',
      'purge.mode.dual': '双开 · 两个人物',
      'purge.armed': '当前武装',
      'purge.updatedAt': '切换时间',
      'purge.kickTitle': '开槽令',
      'purge.copy': '复制',
      'purge.copied': '已复制',
      'purge.copyFailed': '复制失败，请手动选Copy',
      'purge.beats': '四拍',
      'purge.traces': '形象痕',
      'purge.emotion': '情绪口径',
      'purge.address': '称呼',
      'purge.setting': '切换中…',
      'purge.setFailed': '切换失败',
      'purge.exclusiveHint': '单人模式是排他的：只指定一位，另一位当场闭嘴（不搭话、不补刀、不出形象痕），直到说「双开」或直接喊到另一位名字。',
      'purge.armedSingle': '只指定',
      'purge.armedDual': '双开'
    };

    var en = {
      nav: 'Superpower Vision',
      title: 'Superpower Vision',
      intro: 'One panel for the skill catalog, plugin registry, memory library, evolution spool and agent toolkits. Data comes from the host snapshot route, polled every 5s.',
      loading: 'Reading the host snapshot…',
      hostUnavailable: 'The Host does not expose this bundle configuration channel; the panel is unavailable',
      build: 'Panel build',
      refresh: 'Refresh',
      snapshotFailed: 'Snapshot fetch failed',
      'tabs.skills': 'Skills',
      'tabs.plugins': 'Plugins',
      'tabs.memory': 'Memory',
      'tabs.evolution': 'Evolution',
      'tabs.toolkits': 'Toolkit',
      'summary.skills': 'Skills',
      'summary.plugins': 'Plugins',
      'summary.memory': 'Bases',
      'summary.pending': 'Pending',
      'summary.toolkits': 'Toolkit',
      'skills.search': 'Filter by name / provider / source',
      'skills.empty': 'No matching skill',
      'skills.drift.onDiskOnly': 'On disk but not registered (inactive)',
      'skills.drift.brokenLocator': 'Registered but missing on disk (broken)',
      'skills.col.name': 'Name',
      'skills.col.provider': 'Provider',
      'skills.col.source': 'Source',
      'skills.col.rank': 'Rank',
      'skills.invocable': 'Invocable',
      'plugins.desired': 'desired pointers',
      'plugins.generations': 'generations',
      'plugins.patchRows': 'patch rows',
      'plugins.empty': 'No generation records',
      'memory.bases': 'Knowledge bases',
      'memory.empty': 'No knowledge base found',
      'memory.notConnected': 'Memory library not connected',
      'memory.reason': 'reason',
      'evolution.pending': 'pending records',
      'evolution.total': 'spool total',
      'evolution.autoOn': 'Auto evolve: on',
      'evolution.autoOff': 'Auto evolve: off',
      'evolution.auto': 'Auto evolve',
      'evolve.now': 'Ingest now',
      'evolve.running': 'Ingesting…',
      'evolve.ok': 'Ingested',
      'evolve.failed': 'Ingest failed',
      'evolve.reserved': 'Write channel not connected',
      'toolkit.health': 'Status',
      'toolkit.transport': 'Transport',
      'toolkit.command': 'Command',
      'toolkit.empty': 'No MCP server row found',
      'toolkit.hint': 'To onboard a toolkit: add an @deepseek-ai/dsh-mcp-client row to the profile patch, or drop an adapter file into lib/adapters/ and reinstall.',
      'toolkit.unhealthy': 'Unhealthy',
      'toolkit.healthy': 'Healthy',
      'overlay.title': 'Superpower peek',
      'overlay.refresh': 'Refresh',
      'summary.armed': 'Armed',
      'tabs.purge': 'Purge Persona',
      'purge.presetTitle': 'Purge preset · fusion status',
      'purge.presetEmpty': 'No purge preset with persona slots found. Reinstall this plugin or install dsh-purge-preset, then refresh.',
      'purge.presetSlots': 'Has persona slots',
      'purge.presetNoSlots': 'No persona slots',
      'purge.presetSource': 'Source',
      'purge.presetId': 'Preset id',
      'purge.presetBytes': 'Prompt bytes',
      'purge.personaTitle': 'Resident personas',
      'purge.switchTitle': 'Identity switch',
      'purge.switchHint': 'After switching, send the kick line into the session and the next turn answers in that identity.',
      'purge.mode.off': 'Off (base)',
      'purge.mode.jiangmengli': 'Only · Jiang Mengli',
      'purge.mode.qitongwei': 'Only · Qi Tongwei',
      'purge.mode.dual': 'Dual · both',
      'purge.armed': 'Armed now',
      'purge.updatedAt': 'Switched at',
      'purge.kickTitle': 'Kick line',
      'purge.copy': 'Copy',
      'purge.copied': 'Copied',
      'purge.copyFailed': 'Copy failed, select manually',
      'purge.beats': 'Four beats',
      'purge.traces': 'Image traces',
      'purge.emotion': 'Emotion contract',
      'purge.address': 'Address',
      'purge.setting': 'Switching…',
      'purge.setFailed': 'Switch failed',
      'purge.exclusiveHint': 'Single mode is exclusive: only the designated persona answers; the other goes silent (no interjections, no image traces) until you say dual or name the other.',
      'purge.armedSingle': 'Only',
      'purge.armedDual': 'Dual'
    };

    /* 官方样式注入契约：style[data-plugin-css="<包名>/<文件>"]，宿主据此回收。
       全部 token 取自 DSH 语义别名，随主题切换。 */
    var CSS_ID = PACKAGE_NAME + '/vision.css';
    var CSS = [
      '.spv{display:flex;flex-direction:column;gap:12px;color:var(--dsw-alias-label-primary);font:var(--dsw-font-s-14)}',
      '.spvHead{display:flex;align-items:baseline;justify-content:space-between;gap:12px;flex-wrap:wrap}',
      '.spvTitle{margin:0;font:var(--dsw-font-s-strong-14)}',
      '.spvIntro{margin:0;font:var(--dsw-font-xs-13);color:var(--dsw-alias-label-secondary)}',
      '.spvMeta{display:flex;flex-wrap:wrap;gap:6px 14px;margin:0;padding:0;list-style:none}',
      '.spvMetaItem{display:inline-flex;gap:6px;font:var(--dsw-font-xxs-12);color:var(--dsw-alias-label-tertiary)}',
      '.spvMetaItem code{padding:1px 6px;border-radius:var(--dsw-radius-xs);background:var(--dsw-alias-bg-layer-2);font:inherit}',
      '.spvCounts{display:flex;flex-wrap:wrap;gap:8px}',
      '.spvCount{display:flex;flex-direction:column;gap:2px;min-width:64px;padding:8px 12px;border-radius:var(--dsw-radius-md);background:var(--dsw-alias-bg-layer-2)}',
      '.spvCount b{font:var(--dsw-font-s-strong-14)}',
      '.spvCount span{font:var(--dsw-font-xxs-12);color:var(--dsw-alias-label-tertiary)}',
      '.spvTabs{display:flex;gap:4px;flex-wrap:wrap}',
      '.spvPanel{display:flex;flex-direction:column;gap:10px}',
      '.spvTable{width:100%;border-collapse:collapse;font:var(--dsw-font-xs-13)}',
      '.spvTable th{text-align:left;font:var(--dsw-font-xxs-12);color:var(--dsw-alias-label-tertiary);padding:4px 8px;border-bottom:0.5px solid var(--dsw-alias-border-l2)}',
      '.spvTable td{padding:6px 8px;border-bottom:0.5px solid var(--dsw-alias-border-l2);word-break:break-all}',
      '.spvDrift{margin:0;padding:0;list-style:none;display:flex;flex-direction:column;gap:4px}',
      '.spvDrift li{font:var(--dsw-font-xxs-12);color:var(--dsw-alias-state-warning-primary,#b26a00)}',
      '.spvNote{margin:0;font:var(--dsw-font-xxs-12);color:var(--dsw-alias-label-tertiary)}',
      '.spvErr{margin:0;font:var(--dsw-font-xxs-12);color:var(--dsw-alias-state-error-primary)}',
      '.spvBar{display:flex;gap:8px;align-items:center;flex-wrap:wrap}',
      '.spvRow{display:flex;gap:8px;align-items:center;flex-wrap:wrap;font:var(--dsw-font-xs-13)}',
      '.spvTag{display:inline-flex;padding:1px 8px;border-radius:var(--dsw-radius-xs);background:var(--dsw-alias-bg-layer-2);font:var(--dsw-font-xxs-12);color:var(--dsw-alias-label-secondary)}',
      '.spvEmpty{margin:0;padding:16px 0;font:var(--dsw-font-xs-13);color:var(--dsw-alias-label-tertiary);text-align:center}',
      '@media (prefers-reduced-motion:reduce){.spv *{transition:none!important}}',
      '.spvPresetList{margin:0;padding:0;list-style:none;display:flex;flex-direction:column;gap:8px}',
      '.spvPreset{display:flex;flex-direction:column;gap:4px;padding:10px 12px;border-radius:var(--dsw-radius-md);background:var(--dsw-alias-bg-layer-2)}',
      '.spvPresetTop{display:flex;gap:8px;align-items:center;flex-wrap:wrap}',
      '.spvPresetTop b{font:var(--dsw-font-s-strong-13)}',
      '.spvPersonas{display:flex;gap:10px;flex-wrap:wrap}',
      '.spvPersona{display:flex;flex-direction:column;gap:6px;flex:1 1 260px;padding:10px 12px;border-radius:var(--dsw-radius-md);border:0.5px solid var(--dsw-alias-border-l2)}',
      '.spvPersona[data-armed="true"]{border-color:var(--dsw-alias-state-primary,#6b4eff)}',
      '.spvPersona h5{margin:0;font:var(--dsw-font-s-strong-13)}',
      '.spvPersona dl{margin:0;display:grid;grid-template-columns:auto 1fr;gap:2px 10px;font:var(--dsw-font-xxs-12)}',
      '.spvPersona dt{color:var(--dsw-alias-label-tertiary)}',
      '.spvPersona dd{margin:0;color:var(--dsw-alias-label-secondary)}',
      '.spvSwitch{display:flex;gap:6px;flex-wrap:wrap}',
      '.spvKick{display:flex;gap:8px;align-items:center;flex-wrap:wrap;padding:10px 12px;border-radius:var(--dsw-radius-md);background:var(--dsw-alias-bg-layer-2)}',
      '.spvKick code{font:var(--dsw-font-s-14);word-break:break-all}',
      '.spvArmed{display:flex;gap:6px;align-items:center;font:var(--dsw-font-xxs-12);color:var(--dsw-alias-label-secondary)}'
    ].join('\n');

    function injectCss() {
      if (typeof document === 'undefined') return
      if (document.querySelector('style[data-plugin-css=' + JSON.stringify(CSS_ID) + ']')) return
      var tag = document.createElement('style')
      tag.dataset.plugin = PACKAGE_NAME
      tag.dataset.pluginCss = CSS_ID
      tag.textContent = CSS
      document.head.appendChild(tag)
    }

    // ---- 数据层：快照 fetch + 轮询 hook ----
    function fetchSnapshot() {
      return fetch(ROUTE, { cache: 'no-store', credentials: 'same-origin' })
        .then(function (response) {
          if (!response.ok) throw new Error('HTTP ' + response.status)
          return response.json()
        })
        .catch(function (error) { return { __error: String(error && error.message ? error.message : error) } })
    }

    function setPersona(mode) {
      return fetch(ROUTE, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'persona:set', mode: mode }),
      }).then(function (response) { return response.json() })
    }

    function ingestNow() {
      return fetch(ROUTE, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'evolve:ingest' }),
      }).then(function (response) { return response.json() })
    }

    function useSnapshot() {
      var state = React.useState({ snapshot: null, loading: true, error: null });
      var value = state[0];
      var setValue = state[1];
      var reload = React.useCallback(function () {
        fetchSnapshot().then(function (snapshot) {
          if (snapshot && snapshot.__error) setValue({ snapshot: null, loading: false, error: snapshot.__error });
          else setValue({ snapshot: snapshot, loading: false, error: null });
        });
      }, []);
      React.useEffect(function () {
        reload();
        var timer = setInterval(reload, POLL_MS);
        return function () { clearInterval(timer); };
      }, [reload]);
      return { value: value, reload: reload };
    }

    // ---- 通用小组件 ----
    function CountGrid(props) {
      var t = props.t;
      var counts = props.counts;
      if (!counts) return h('div', { className: 'spvCounts' }, h('div', { className: 'spvCount' }, h('b', null, '—'), h('span', null, t('loading'))));
      var items = [
        { label: t('summary.skills'), value: counts.skills },
        { label: t('summary.plugins'), value: counts.plugins },
        { label: t('summary.memory'), value: counts.memory },
        { label: t('summary.pending'), value: counts.pending },
        { label: t('summary.toolkits'), value: counts.toolkits },
      ];
      return h('div', { className: 'spvCounts' }, items.map(function (item) {
        return h('div', { key: item.label, className: 'spvCount' }, h('b', null, String(item.value)), h('span', null, item.label));
      }));
    }

    function Loading(props) {
      return h('div', { className: 'spv' }, h('p', { className: 'spvIntro' }, props.t('loading')));
    }

    function Degraded(props) {
      return h('p', { className: 'spvErr', role: 'alert' }, props.t('snapshotFailed'), props.error ? '：' + props.error : '');
    }

    // ---- 页签一：技能库 ----
    function SkillCatalogTab(props) {
      var t = props.t;
      var skills = (props.snapshot && props.snapshot.skills) || { entries: [], drift: { onDiskOnly: [], brokenLocator: [] } };
      var kwState = React.useState('');
      var keyword = kwState[0];
      var setKeyword = kwState[1];
      var entries = helpers.skillsShown(skills.entries, keyword);
      var drift = skills.drift || { onDiskOnly: [], brokenLocator: [] };
      return h('div', { className: 'spvPanel' },
        h('div', { className: 'spvBar' },
          h(P.Input, {
            type: 'search',
            value: keyword,
            placeholder: t('skills.search'),
            'aria-label': t('skills.search'),
            onChange: function (event) { setKeyword(event.target.value); },
          })),
        entries.length === 0
          ? h('p', { className: 'spvEmpty' }, t('skills.empty'))
          : h('table', { className: 'spvTable' },
              h('thead', null, h('tr', null,
                h('th', null, t('skills.col.name')),
                h('th', null, t('skills.col.provider')),
                h('th', null, t('skills.col.source')),
                h('th', null, t('skills.col.rank')),
                h('th', null, t('skills.invocable')))),
              h('tbody', null, entries.map(function (entry) {
                return h('tr', { key: entry.name },
                  h('td', null, entry.name),
                  h('td', null, entry.provider),
                  h('td', null, h('span', { className: 'spvTag' }, helpers.sourceLabel(entry))),
                  h('td', null, helpers.rankLabel(entry)),
                  h('td', null, entry.modelInvocable ? 'M' : '—', entry.userInvocable ? 'U' : ''));
              }))),
        (drift.onDiskOnly.length > 0 || drift.brokenLocator.length > 0)
          ? h('ul', { className: 'spvDrift' },
              drift.onDiskOnly.length > 0 ? h('li', null, t('skills.drift.onDiskOnly') + '：' + drift.onDiskOnly.join(', ')) : null,
              drift.brokenLocator.length > 0 ? h('li', null, t('skills.drift.brokenLocator') + '：' + drift.brokenLocator.join(', ')) : null)
          : null);
    }

    // ---- 页签二：插件注册表 ----
    function PluginRegistryTab(props) {
      var t = props.t;
      var plugins = (props.snapshot && props.snapshot.plugins) || { desired: [], generations: [], patchRows: [] };
      var generations = plugins.generations || [];
      return h('div', { className: 'spvPanel' },
        h('div', { className: 'spvRow' },
          h('span', { className: 'spvTag' }, t('plugins.desired') + ': ' + (plugins.desired || []).length),
          h('span', { className: 'spvTag' }, t('plugins.generations') + ': ' + generations.length),
          h('span', { className: 'spvTag' }, t('plugins.patchRows') + ': ' + (plugins.patchRows || []).length)),
        generations.length === 0
          ? h('p', { className: 'spvEmpty' }, t('plugins.empty'))
          : h('table', { className: 'spvTable' },
              h('thead', null, h('tr', null, h('th', null, 'id'), h('th', null, 'name'), h('th', null, 'version'))),
              h('tbody', null, generations.map(function (gen) {
                return h('tr', { key: gen.id }, h('td', null, gen.id), h('td', null, gen.name), h('td', null, gen.version || '—'));
              }))));
    }

    // ---- 页签三：记忆复用库 ----
    function MemoryTab(props) {
      var t = props.t;
      var memory = (props.snapshot && props.snapshot.memory) || { bases: [] };
      var bases = memory.bases || [];
      if (bases.length === 0) {
        return h('div', { className: 'spvPanel' },
          h('p', { className: 'spvEmpty' }, t('memory.notConnected')),
          memory.reason ? h('p', { className: 'spvNote' }, t('memory.reason') + '：' + memory.reason) : null,
          h('p', { className: 'spvNote' }, t('memory.empty')));
      }
      return h('div', { className: 'spvPanel' },
        h('div', { className: 'spvRow' }, h('span', { className: 'spvTag' }, t('memory.bases') + ': ' + bases.length)),
        h('table', { className: 'spvTable' },
          h('thead', null, h('tr', null, h('th', null, 'key'), h('th', null, 'name'))),
          h('tbody', null, bases.map(function (base) {
            return h('tr', { key: base.key }, h('td', null, base.key), h('td', null, base.name || base.key));
          }))));
    }

    // ---- 页签四：进化记忆 ----
    function EvolutionTab(props) {
      var t = props.t;
      var evolution = (props.snapshot && props.snapshot.evolution) || { spool: { pending: 0, total: 0 }, auto: false };
      var busyState = React.useState(false);
      var busy = busyState[0];
      var setBusy = busyState[1];
      var resultState = React.useState(null);
      var result = resultState[0];
      var setResult = resultState[1];
      var spool = evolution.spool || { pending: 0, total: 0 };
      var writable = spool.pending > 0;
      return h('div', { className: 'spvPanel' },
        h('div', { className: 'spvRow' },
          h('span', { className: 'spvTag' }, t('evolution.total') + ': ' + spool.total),
          h('span', { className: 'spvTag' }, t('evolution.pending') + ': ' + spool.pending),
          h('span', { className: 'spvTag' }, evolution.auto ? t('evolution.autoOn') : t('evolution.autoOff'))),
        h('div', { className: 'spvBar' },
          h(P.Button, {
            variant: 'outline',
            size: 'sm',
            disabled: busy || !writable,
            title: t('evolve.now'),
            onClick: function () {
              setBusy(true);
              ingestNow().then(function (response) {
                setBusy(false);
                setResult(response && response.ok ? { ok: true } : { ok: false, reason: response && response.reason });
                props.onIngested();
              }).catch(function (error) {
                setBusy(false);
                setResult({ ok: false, reason: String(error && error.message ? error.message : error) });
              });
            },
          }, busy ? t('evolve.running') : t('evolve.now')),
          result && result.ok ? h('span', { className: 'spvTag' }, t('evolve.ok')) : null,
          result && !result.ok ? h('span', { className: 'spvErr', role: 'alert' }, t('evolve.failed') + (result.reason ? '：' + result.reason : '')) : null,
          !writable ? h('span', { className: 'spvNote' }, t('evolve.reserved')) : null));
    }

    // ---- 页签五：Agent Toolkit ----
    function ToolkitTab(props) {
      var t = props.t;
      var toolkits = (props.snapshot && props.snapshot.toolkits) || [];
      if (toolkits.length === 0) {
        return h('div', { className: 'spvPanel' }, h('p', { className: 'spvEmpty' }, t('toolkit.empty')), h('p', { className: 'spvNote' }, t('toolkit.hint')));
      }
      return h('div', { className: 'spvPanel' },
        h('table', { className: 'spvTable' },
          h('thead', null, h('tr', null, h('th', null, 'id'), h('th', null, t('toolkit.transport')), h('th', null, t('toolkit.health')), h('th', null, t('toolkit.command')))),
          h('tbody', null, toolkits.map(function (kit) {
            var health = kit.health || {};
            return h('tr', { key: kit.id },
              h('td', null, kit.id),
              h('td', null, kit.transport || '—'),
              h('td', null, h('span', { className: 'spvTag' }, health.ok ? t('toolkit.healthy') : t('toolkit.unhealthy'))),
              h('td', null, kit.command || '—'));
          }))),
        h('p', { className: 'spvNote' }, t('toolkit.hint')));
    }

    // ---- 页签六：破甲人格（融合状态 + 身份切换 + 开槽令）----
    function PersonaTab(props) {
      var t = props.t;
      var snapshot = props.snapshot;
      var persona = helpers.personaOf(snapshot);
      var presets = persona.presets;
      var fused = helpers.fusedPreset(presets);
      var busyState = React.useState(false);
      var busy = busyState[0];
      var setBusy = busyState[1];
      var copyState = React.useState('');
      var copyLabel = copyState[0];
      var setCopyLabel = copyState[1];

      function switchTo(mode) {
        if (busy || mode === persona.mode) return;
        setBusy(true);
        setPersona(mode).then(function (result) {
          setBusy(false);
          if (result && result.ok) {
            if (props.reload) props.reload();
          } else {
            setCopyLabel(t('purge.setFailed') + (result && result.reason ? '：' + result.reason : ''));
          }
        }, function (error) {
          setBusy(false);
          setCopyLabel(t('purge.setFailed') + '：' + String(error && error.message ? error.message : error));
        });
      }

      var presetBlock = presets.length === 0
        ? h('p', { className: 'spvEmpty' }, t('purge.presetEmpty'))
        : h('ul', { className: 'spvPresetList' }, presets.map(function (row) {
            return h('li', { key: row.source + ':' + row.presetId, className: 'spvPreset' },
              h('div', { className: 'spvPresetTop' },
                h('b', null, row.presetName || row.presetId || '—'),
                h('span', { className: 'spvTag' }, row.hasPersonaSlots ? t('purge.presetSlots') : t('purge.presetNoSlots'))),
              h('div', { className: 'spvRow' },
                h('span', { className: 'spvMetaItem' }, t('purge.presetSource'), h('code', null, row.source)),
                h('span', { className: 'spvMetaItem' }, t('purge.presetId'), h('code', null, String(row.presetId))),
                h('span', { className: 'spvMetaItem' }, t('purge.presetBytes'), h('code', null, String(row.prefixBytes)))));
          }));

      var personaBlock = h('div', { className: 'spvPersonas' }, persona.personas.map(function (card) {
        var armed = persona.mode === card.id || persona.mode === 'dual';
        return h('div', { key: card.id, className: 'spvPersona', 'data-armed': String(armed) },
          h('h5', null, card.name + ' · ' + card.title),
          h('dl', null,
            h('dt', null, t('purge.address')), h('dd', null, card.address),
            h('dt', null, t('purge.beats')), h('dd', null, card.beats),
            h('dt', null, t('purge.traces')), h('dd', null, card.traces.join(' / ')),
            h('dt', null, t('purge.emotion')), h('dd', null, card.emotion)));
      }));

      var switchBlock = h('div', { className: 'spvSwitch' }, persona.modes.map(function (mode) {
        return h(P.Button, {
          key: mode,
          variant: persona.mode === mode ? 'primary' : 'outline',
          size: 'sm',
          disabled: busy,
          'aria-pressed': String(persona.mode === mode),
          onClick: function () { switchTo(mode); },
        }, t(helpers.personaModeKey(mode)));
      }));

      var kickBlock = persona.kick
        ? h('div', { className: 'spvKick' },
            h('span', { className: 'spvMetaItem' }, t('purge.kickTitle')),
            h('code', null, persona.kick),
            h(P.Button, {
              variant: 'ghost', size: 'sm',
              onClick: function () {
                helpers.copyKick(persona.kick).then(function (ok) {
                  setCopyLabel(ok ? t('purge.copied') : t('purge.copyFailed'));
                });
              },
            }, t('purge.copy')),
            copyLabel ? h('span', { className: 'spvNote' }, copyLabel) : null)
        : h('p', { className: 'spvNote' }, t('purge.switchHint'));

      return h('div', { className: 'spvPanel' },
        h('h5', { className: 'spvTitle' }, t('purge.presetTitle'), fused ? '' : ''),
        presetBlock,
        h('h5', { className: 'spvTitle' }, t('purge.personaTitle')),
        personaBlock,
        h('h5', { className: 'spvTitle' }, t('purge.switchTitle')),
        switchBlock,
        h('p', { className: 'spvNote' }, t('purge.switchHint')),
        h('p', { className: 'spvNote' },
          persona.mode === 'dual'
            ? t('purge.armedDual') + '：' + t('purge.mode.dual')
            : (persona.mode === 'off' ? '' : t('purge.armedSingle') + '：' + t(helpers.personaModeKey(persona.mode))),
          persona.mode === 'off' ? '' : '｜' + t('purge.exclusiveHint')),
        h('div', { className: 'spvArmed' },
          h('span', { className: 'spvTag' }, t('purge.armed') + '：' + t(helpers.personaModeKey(persona.mode))),
          persona.updatedAt ? h('span', { className: 'spvNote' }, t('purge.updatedAt') + '：' + persona.updatedAt) : null),
        kickBlock);
    }

    // ---- 主面板（settings.section）----
    function VisionPanel(props) {
      var t = props.t;
      var snapshotState = useSnapshot();
      var snapshot = snapshotState.value.snapshot;
      var tabState = React.useState('skills');
      var tab = tabState[0];
      var setTab = tabState[1];
      var counts = helpers.formatCounts(snapshot);
      var tabProps = { t: t, snapshot: snapshot, reload: snapshotState.reload, onIngested: snapshotState.reload };

      if (snapshotState.value.loading && !snapshot) return Loading({ t: t });
      if (snapshotState.value.error && !snapshot) return Degraded({ t: t, error: snapshotState.value.error });

      var tabView = null;
      if (tab === 'skills') tabView = SkillCatalogTab(tabProps);
      else if (tab === 'plugins') tabView = PluginRegistryTab(tabProps);
      else if (tab === 'memory') tabView = MemoryTab(tabProps);
      else if (tab === 'evolution') tabView = EvolutionTab(tabProps);
      else if (tab === 'toolkits') tabView = ToolkitTab(tabProps);
      else tabView = PersonaTab(tabProps);

      return h('div', { className: 'spv' },
        h('div', { className: 'spvHead' },
          h('div', null,
            h('h4', { className: 'spvTitle' }, t('title')),
            h('p', { className: 'spvIntro' }, t('intro'))),
          h(P.Button, { variant: 'ghost', size: 'sm', onClick: snapshotState.reload }, t('refresh'))),
        CountGrid({ t: t, counts: counts }),
        helpers.personaModeKey(personaOf(snapshot).mode) !== 'purge.mode.off'
          ? h('div', { className: 'spvArmed' },
              h('span', { className: 'spvTag' }, t('summary.armed') + '：' + t(helpers.personaModeKey(personaOf(snapshot).mode))),
              h('span', { className: 'spvNote' }, personaOf(snapshot).updatedAt || ''))
          : null,
        h('div', { className: 'spvTabs' }, TABS.map(function (key) {
          return h(P.Button, {
            key: key,
            variant: tab === key ? 'primary' : 'outline',
            size: 'sm',
            onClick: function () { setTab(key); },
          }, t('tabs.' + key));
        })),
        tabView,
        h('ul', { className: 'spvMeta' }, h('li', { className: 'spvMetaItem' }, t('build'), h('code', null, PACKAGE_VERSION))));
    }

    // ---- 插件管理卡片（plugins.item）----
    function SummaryCard(props) {
      var t = props.t;
      var snapshotState = useSnapshot();
      var snapshot = snapshotState.value.snapshot;
      var counts = helpers.formatCounts(snapshot);
      return h('div', { className: 'spv' },
        h('h4', { className: 'spvTitle' }, t('title')),
        CountGrid({ t: t, counts: counts }));
    }

    // ---- 速览浮窗（shell.overlay）----
    function PeekOverlay(props) {
      var t = props.t;
      var snapshotState = useSnapshot();
      var snapshot = snapshotState.value.snapshot;
      var counts = helpers.formatCounts(snapshot);
      return h('div', { className: 'spv' },
        h('div', { className: 'spvHead' },
          h('h4', { className: 'spvTitle' }, t('overlay.title')),
          h(P.Button, { variant: 'ghost', size: 'sm', onClick: snapshotState.reload }, t('overlay.refresh'))),
        CountGrid({ t: t, counts: counts }),
        helpers.personaModeKey(personaOf(snapshot).mode) !== 'purge.mode.off'
          ? h('p', { className: 'spvNote' }, t('summary.armed') + '：' + t(helpers.personaModeKey(personaOf(snapshot).mode)))
          : null);
    }

    function apply(ctx) {
      ctx.effect(() => ctx.locale.register(NS, { zh: zh, en: en }), 'dsh-superpower-vision: locale');
      injectCss();

      /* configForms.get 失败绝不提前 return：继续注册，卡片内部降级。
         早期 return 会让设置导航行整个消失且无报错（dev-notes 坑 2.5）。 */
      var scope = null;
      try {
        scope = ctx.configForms.get(NS);
      } catch (error) {
        /* 降级：scope 留空 */
      }

      ctx.slots.inject('settings.section', () => ctx.slots.register({
        name: 'settings.section',
        id: SECTION_ID,
        order: 60,
        label: () => emit(ctx.locale.bind(NS), 'nav'),
        locale: NS,
        inject: () => ({ scope: scope }),
      }, VisionPanel));

      ctx.effect(() => ctx.configForms.whileServed([NS], () => ctx.slots.inject('plugins.item', () => ctx.slots.register({
        name: 'plugins.item',
        id: PLUGIN_ITEM_ID,
        order: 60,
        label: () => emit(ctx.locale.bind(NS), 'title'),
        locale: NS,
        inject: () => ({ scope: scope }),
      }, SummaryCard))), 'dsh-superpower-vision: plugin card');

      ctx.slots.inject('shell.overlay', () => ctx.slots.register({
        name: 'shell.overlay',
        id: OVERLAY_ID,
        order: 40,
      }, PeekOverlay));
    }

    exports.apply = apply;
    exports.inject = ['slots', 'locale', 'configForms'];
    return module.exports;
  },
});
