window.__ModuleLoader__.load({
  id: '@local/recent-sessions',
  factory(require) {
    const React = require('react');
    const h = React.createElement;

    // Host primitives are an implicit baseline external for Module Loader
    // packages. Fall back to local renderers if the table is unavailable.
    let ui = {};
    try { ui = require('@deepseek-ai/dsh-client-ui-primitives') || {}; } catch (_e) { ui = {}; }

    /** Locale namespace owned by this plugin. */
    const NS = 'recentSessions';

    const en = {
      title: 'Recent sessions',
      empty: 'No recent conversations',
      'aria.expand': 'Expand recent sessions',
      'aria.collapse': 'Collapse recent sessions',
      'aria.open': 'Open {title}',
      'menu.openFolder': 'Open containing folder',
      'menu.openFolderError': 'Could not open the folder',
      'menu.newSession': 'New session',
      'menu.newSessionError': 'Could not create a new session',
      'menu.archive': 'Archive session',
      'menu.archiveError': 'Could not archive the session',
      'menu.copySessionId': 'Copy session ID',
      'menu.copySessionIdError': 'Could not copy the session ID',
      'menu.sessionIdCopied': 'Session ID copied',
      'menu.rename': 'Rename session',
      'rename.title': 'Rename session',
      'rename.confirm': 'OK',
      'rename.cancel': 'Cancel',
      'rename.empty': 'Name cannot be empty',
      'rename.failed': 'Could not rename the session',
    };
    const zh = {
      title: '最近会话',
      empty: '暂无最近会话',
      'aria.expand': '展开最近会话',
      'aria.collapse': '收起最近会话',
      'aria.open': '打开 {title}',
      'menu.openFolder': '打开所在文件夹',
      'menu.openFolderError': '打开文件夹失败',
      'menu.newSession': '新建会话',
      'menu.newSessionError': '新建会话失败',
      'menu.archive': '归档会话',
      'menu.archiveError': '归档会话失败',
      'menu.copySessionId': '复制 Session ID',
      'menu.copySessionIdError': '复制 Session ID 失败',
      'menu.sessionIdCopied': 'Session ID 已复制',
      'menu.rename': '重命名会话',
      'rename.title': '重命名会话',
      'rename.confirm': '确定',
      'rename.cancel': '取消',
      'rename.empty': '名称不能为空',
      'rename.failed': '重命名失败',
    };

    /** Expanded panel height: 32px header + 150px list + 4px bottom padding. */
    const EXPANDED_HEIGHT = 186;
    /** Collapsed panel height: 32px header + 4px bottom padding. */
    const COLLAPSED_HEIGHT = 36;

    const CSS = [
      '.rsx-root{position:fixed;top:0;left:0;width:264px;z-index:40;pointer-events:auto;box-sizing:border-box;',
      'background:var(--dsw-specific-sidebar-fill);color:var(--dsw-alias-label-primary);font-size:14px;',
      'font-family:inherit;padding:0 0 4px;margin:0}',
      '.rsx-head{display:flex;align-items:center;gap:7px;height:32px;padding:0 4px;box-sizing:border-box;',
      'cursor:pointer;user-select:none;color:var(--dsw-alias-label-secondary)}',
      '.rsx-chev{width:12px;height:12px;flex:none;display:inline-flex;align-items:center;justify-content:center;',
      'transition:transform .15s ease}',
      '.rsx-chev.rsx-open{transform:rotate(90deg)}',
      '.rsx-title{flex:1;min-width:0;font-weight:600;font-size:13px;letter-spacing:.2px;',
      'color:var(--dsw-alias-label-primary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
      '.rsx-count{flex:none;color:var(--dsw-alias-label-secondary);font-size:11px;font-variant-numeric:tabular-nums}',
      '.rsx-list{height:150px;overflow-y:auto;overflow-x:hidden;padding:1px 0;box-sizing:border-box}',
      '.rsx-row{display:flex;align-items:center;gap:6px;height:32px;padding:0 4px;box-sizing:border-box;',
      'border-radius:6px;cursor:pointer;white-space:nowrap;border-inline:3px solid transparent}',
      '.rsx-row:hover{background:var(--dsw-alias-interactive-bg-hover, var(--dsw-alias-bg-layer-2))}',
      '.rsx-row.rsx-current{background:var(--dsw-alias-interactive-bg-hover, var(--dsw-alias-bg-layer-2))}',
      '.rsx-status{width:16px;flex:none;display:inline-flex;align-items:center;justify-content:center}',
      '.rsx-sdot{width:8px;height:8px;border-radius:50%;flex:none;background:var(--dsw-alias-state-idle-primary)}',
      '.rsx-sdot.rsx-warning{background:var(--dsw-alias-state-warn-primary)}',
      '.rsx-sdot.rsx-ongoing{background:var(--dsw-alias-brand-primary)}',
      '.rsx-sdot.rsx-done{background:var(--dsw-alias-state-success-primary)}',
      '.rsx-name{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;font-size:13px}',
      '.rsx-time{flex:none;font-size:11px;color:var(--dsw-alias-label-secondary);font-variant-numeric:tabular-nums}',
      '.rsx-pin{width:13px;height:13px;flex:none;color:var(--dsw-alias-label-secondary);opacity:.8}',
      '.rsx-empty{height:150px;display:flex;align-items:center;justify-content:center;color:var(--dsw-alias-label-secondary);font-size:12px;text-align:center}',
      '.rsx-list::-webkit-scrollbar{width:6px}',
      '.rsx-list::-webkit-scrollbar-thumb{background:var(--dsw-alias-border-l2);border-radius:3px}',
      '.rsx-list::-webkit-scrollbar-track{background:transparent}',
      '.rsx-tip{position:fixed;z-index:60;transform:translateY(-100%) translateY(-6px);max-width:340px;',
      'background:var(--dsw-alias-bg-overlay);border:0.5px solid var(--dsw-alias-border-l1);border-radius:8px;',
      'box-shadow:0 6px 18px rgba(0,0,0,.18);padding:8px 10px;font-size:12px;line-height:1.55;',
      'pointer-events:none;color:var(--dsw-alias-label-primary)}',
      '.rsx-tip-title{font-weight:600;font-size:13px;color:var(--dsw-alias-label-primary);word-break:break-word}',
      '.rsx-tip-path{font-size:12px;color:var(--dsw-alias-label-secondary);word-break:break-all;margin-top:1px}',
      '.rsx-tip-time{font-size:12px;color:var(--dsw-alias-label-secondary);margin-top:2px}',
      '.rsx-tip-status{display:flex;align-items:center;gap:5px;font-size:12px;color:var(--dsw-alias-label-secondary);margin-top:3px}',
      '.rsx-hc{display:flex;flex-direction:column;gap:2px;max-width:320px}',
      '.rsx-hc-title{font-weight:600;font-size:13px;line-height:1.45;color:rgba(255,255,255,.96);word-break:break-word}',
      '.rsx-hc-path{font-size:12px;line-height:1.5;color:rgba(255,255,255,.75);word-break:break-all}',
      '.rsx-hc-time{font-size:12px;line-height:1.5;color:rgba(255,255,255,.75)}',
      '.rsx-hc-status{display:flex;align-items:center;gap:5px;font-size:12px;line-height:1.5;color:rgba(255,255,255,.82);margin-top:2px}',
      '.rsx-mask{position:fixed;inset:0;z-index:70;background:rgba(0,0,0,.28);display:flex;align-items:center;justify-content:center}',
      '.rsx-dialog{width:360px;box-sizing:border-box;background:var(--dsw-alias-bg-overlay);border:0.5px solid var(--dsw-alias-border-l1);border-radius:10px;box-shadow:0 10px 28px rgba(0,0,0,.22);padding:14px;color:var(--dsw-alias-label-primary);font-family:inherit}',
      '.rsx-dialog-title{font-size:14px;font-weight:600;margin-bottom:10px}',
      '.rsx-input{width:100%;box-sizing:border-box;height:34px;padding:0 10px;border-radius:8px;border:0.5px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);font-size:13px;outline:none}',
      '.rsx-input:focus{border-color:var(--dsw-alias-brand-primary)}',
      '.rsx-dialog-error{color:var(--dsw-alias-state-error-primary);font-size:12px;margin-top:8px}',
      '.rsx-dialog-actions{display:flex;justify-content:flex-end;gap:8px;margin-top:12px}',
      '.rsx-btn{height:30px;padding:0 12px;border-radius:7px;border:0.5px solid var(--dsw-alias-border-l1);background:transparent;color:var(--dsw-alias-label-primary);cursor:pointer;font-size:13px}',
      '.rsx-btn.primary{background:var(--dsw-alias-brand-primary);border-color:transparent;color:#fff}',
      '.rsx-btn:disabled{opacity:.5;cursor:default}',
    ].join('');

    function Chevron({ open }) {
      return h('span', { className: 'rsx-chev' + (open ? ' rsx-open' : ''), 'aria-hidden': true },
        h('svg', { viewBox: '0 0 16 16', width: 12, height: 12, fill: 'none' },
          h('path', { d: 'M6 3.5 10.5 8 6 12.5', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round' })));
    }

    function PinGlyph() {
      return h('svg', { className: 'rsx-pin', viewBox: '0 0 16 16', 'aria-hidden': true, fill: 'currentColor' },
        h('path', { d: 'M9.6 1.4a1 1 0 0 0-1.4 0L5.9 3.7l-2.6.7a1 1 0 0 0-.5 1.7l2 2-3.2 5.6a.7.7 0 0 0 .9 1l5.6-3.3 2 2a1 1 0 0 0 1.7-.5l.7-2.6 2.3-2.3a1 1 0 0 0 0-1.4z' }));
    }

    function StateDot({ state }) {
      if (ui.StateDot != null) return h(ui.StateDot, { state });
      return h('span', { className: 'rsx-sdot rsx-' + state, 'aria-hidden': true });
    }

    /** Host routes served by the standard open-in-app feature. */
    const OPEN_APPS = '/open-in-app/apps';
    const OPEN_ONE = '/open-in-app/open';
    const FILE_MANAGERS = ['explorer', 'finder', 'filemanager'];

    let appsPromise = null;
    function loadApps() {
      if (appsPromise == null) {
        appsPromise = fetch(OPEN_APPS, { headers: { accept: 'application/json' } })
          .then((res) => (res.ok ? res.json() : { apps: [] }))
          .then((payload) => (payload && Array.isArray(payload.apps) ? payload.apps.filter((id) => typeof id === 'string') : []))
          .catch(() => []);
      }
      return appsPromise;
    }

    async function launchApp(app, path) {
      const res = await fetch(OPEN_ONE, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ app, path }),
      });
      if (!res.ok) throw new Error(`open failed: HTTP ${String(res.status)}`);
    }

    async function copyText(text) {
      try {
        if (typeof ui.writeClipboard === 'function') return await ui.writeClipboard(text);
        await navigator.clipboard.writeText(text);
        return true;
      } catch (_e) {
        return false;
      }
    }

    function FolderIcon() {
      if (typeof ui.IconFolderOpenOutlineRegular === 'function') return h(ui.IconFolderOpenOutlineRegular, {});
      return h('svg', { viewBox: '0 0 16 16', width: 16, height: 16, fill: 'currentColor', 'aria-hidden': true },
        h('path', { d: 'M1.5 4A1.5 1.5 0 0 1 3 2.5h3L7.5 4H13a1.5 1.5 0 0 1 1.5 1.5V12A1.5 1.5 0 0 1 13 13.5H3A1.5 1.5 0 0 1 1.5 12z' }));
    }

    function NewSessionIcon() {
      if (typeof ui.IconNewChatOutlineRegular === 'function') return h(ui.IconNewChatOutlineRegular, {});
      return h('svg', { viewBox: '0 0 16 16', width: 16, height: 16, fill: 'none', 'aria-hidden': true },
        h('path', { d: 'M8 3v10M3 8h10', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round' }));
    }

    function ArchiveIcon() {
      if (typeof ui.IconArchiveOutlineRegular === 'function') return h(ui.IconArchiveOutlineRegular, {});
      return h('svg', { viewBox: '0 0 16 16', width: 16, height: 16, fill: 'none', 'aria-hidden': true },
        h('path', { d: 'M2.5 4.5h11v2h-11zM3.5 6.5v6h9v-6M6.5 9h3', stroke: 'currentColor', strokeWidth: 1.3, strokeLinejoin: 'round' }));
    }

    function CopyIcon() {
      if (typeof ui.IconCopyOutlineRegular === 'function') return h(ui.IconCopyOutlineRegular, {});
      return h('svg', { viewBox: '0 0 16 16', width: 16, height: 16, fill: 'none', 'aria-hidden': true },
        h('rect', { x: 5.5, y: 5.5, width: 7, height: 8, rx: 1.3, stroke: 'currentColor', strokeWidth: 1.3 }),
        h('path', { d: 'M10.5 5.5v-1A1.5 1.5 0 0 0 9 3H4a1.5 1.5 0 0 0-1.5 1.5v6A1.5 1.5 0 0 0 4 12h1', stroke: 'currentColor', strokeWidth: 1.3 }));
    }

    function RenameIcon() {
      if (typeof ui.IconEditOutlineRegular === 'function') return h(ui.IconEditOutlineRegular, {});
      return h('svg', { viewBox: '0 0 16 16', width: 16, height: 16, fill: 'none', 'aria-hidden': true },
        h('path', { d: 'M3 13l.7-3.2L11 2.5a1.6 1.6 0 0 1 2.3 0l.2.2a1.6 1.6 0 0 1 0 2.3L6.2 12.3 3 13z', stroke: 'currentColor', strokeWidth: 1.3, strokeLinejoin: 'round' }));
    }

    /** Minimal observable request used to open the rename dialog from the menu. */
    function createRenameStore() {
      let value = null;
      const listeners = new Set();
      return {
        get: () => value,
        set: (next) => { value = next; for (const listener of listeners) listener(); },
        subscribe: (listener) => { listeners.add(listener); return () => listeners.delete(listener); },
      };
    }

    /** Find a rendered workspace-browser row by its data-row-key. */
    function findWorkspaceRow(key) {
      const nodes = document.querySelectorAll('[data-row-key]');
      for (const node of nodes) if (node.getAttribute('data-row-key') === key) return node;
      return null;
    }

    /** Scroll the workspace browser to one session row (expanding its group if needed). */
    function revealInWorkspace(sessionId, workspaceId) {
      const scroll = () => {
        const row = findWorkspaceRow('session:' + sessionId);
        if (!row) return false;
        row.scrollIntoView({ block: 'nearest', inline: 'nearest' });
        return true;
      };
      const run = () => {
        if (scroll()) return;
        if (!workspaceId) return;
        const header = findWorkspaceRow('workspace:' + workspaceId);
        if (header && header.getAttribute('aria-expanded') === 'false') {
          header.click();
          window.setTimeout(scroll, 90);
          window.setTimeout(scroll, 240);
        }
      };
      window.setTimeout(run, 30);
      window.setTimeout(run, 220);
    }

    /** Read the current visible title for one session summary. */
    function titleOf(summary) {
      if (summary == null || summary.blank) return '';
      return typeof summary.title === 'string' ? summary.title.trim() : '';
    }

    /** Relative unit bucket for a timestamp, matching the host's relativeTime. */
    function relativeUnit(ms, now) {
      if (typeof ui.relativeTime === 'function') {
        try { return ui.relativeTime(ms, now); } catch (_e) { /* fall through */ }
      }
      const diff = Math.max(0, now - ms);
      const MIN = 60000, HOUR = 3600000, DAY = 86400000;
      if (diff < MIN) return { unit: 'now', n: 0 };
      const minutes = Math.floor(diff / MIN);
      if (minutes < 60) return { unit: 'minutes', n: minutes };
      const hours = Math.floor(diff / HOUR);
      if (hours < 24) return { unit: 'hours', n: hours };
      const days = Math.floor(diff / DAY);
      if (days < 30) return { unit: 'days', n: days };
      const months = Math.floor(days / 30);
      if (months < 12) return { unit: 'months', n: months };
      return { unit: 'years', n: Math.floor(months / 12) };
    }

    /** Compact relative label used inside a row ("5分钟"). */
    function compactTime(ms, now, tw) {
      if (typeof ms !== 'number' || ms <= 0) return '';
      const { unit, n } = relativeUnit(ms, now);
      return unit === 'now' ? tw('time.now') : tw('time.' + unit, { n });
    }

    /** Relative hover label ("5分钟前"). */
    function hoverTime(ms, now, tw) {
      if (typeof ms !== 'number' || ms <= 0) return '';
      const { unit, n } = relativeUnit(ms, now);
      return unit === 'now' ? tw('time.now') : tw('time.ago', { t: tw('time.' + unit, { n }) });
    }

    /** Build the ordered status list exactly like the workspace row/hover card. */
    function statusList(statusEntry, summary, subRunning, tw) {
      const pending = statusEntry && statusEntry.pendingInteraction && statusEntry.pendingInteraction.kind;
      const running = (statusEntry && statusEntry.running) || (summary && summary.running) === true;
      const completion = !!(statusEntry && statusEntry.completionUnread);
      const list = [];
      if (pending === 'approval') list.push({ state: 'warning', label: tw('status.waitingApproval') });
      else if (pending === 'plan-review') list.push({ state: 'warning', label: tw('status.planReview') });
      else if (pending === 'question') list.push({ state: 'warning', label: tw('status.waitingAnswer') });
      if (list.length === 0 && running) list.push({ state: 'ongoing', label: tw('status.running') });
      if (subRunning > 0) list.push({ state: 'ongoing', label: tw(subRunning === 1 ? 'status.subagentsRunning.one' : 'status.subagentsRunning.other', { n: subRunning }) });
      if (list.length === 0 && completion) list.push({ state: 'done', label: tw('status.completed') });
      if (list.length === 0) list.push({ state: 'idle', label: tw('status.idle') });
      return list;
    }

    /** Content shown inside the host HoverCard, mirroring the workspace session hover card. */
    function HoverContent({ row, tw }) {
      const now = Date.now();
      return h('div', { className: 'rsx-hc' },
        h('div', { className: 'rsx-hc-title' }, row.title),
        row.path ? h('div', { className: 'rsx-hc-path' }, row.path) : null,
        h('div', { className: 'rsx-hc-time' }, hoverTime(row.updatedAt, now, tw)),
        row.statuses.map((st, i) => h('div', { className: 'rsx-hc-status', key: i },
          h(StateDot, { state: st.state }),
          h('span', null, st.label))));
    }

    /**
     * Locate the sidebar shell's workspace region and reserve vertical space for
     * this section at its top, so the "工作区" browser is pushed down instead of
     * being covered. Returns the measured rectangle for the fixed section.
     */
    function reserveSpace(height) {
      const toggle = document.querySelector('[data-sidebar-toggle]');
      if (!toggle) return null;
      let root = null;
      for (let el = toggle; el; el = el.parentElement) {
        if (el.querySelector(':scope > nav')) { root = el; break; }
      }
      if (!root) return null;
      const nav = root.querySelector(':scope > nav');
      const region = nav ? nav.nextElementSibling : null;
      if (!region) return null;
      const pad = height + 'px';
      if (region.style.paddingTop !== pad) region.style.paddingTop = pad;
      if (region.style.boxSizing !== 'border-box') region.style.boxSizing = 'border-box';
      const rect = region.getBoundingClientRect();
      if (rect.width < 100 || rect.height < 40) return { region, rect: null };
      return { region, rect };
    }

    /**
     * A collapsible recent-session section docked above the workspace browser.
     * Reads the shared session/workspace/status snapshots; rows and their hover
     * card mirror the workspace session row and hover card.
     */
    function RecentSessionsPanel(props) {
      const useSessions = props.useSessions;
      const useWorkspaces = props.useWorkspaces;
      const useSessionStatus = props.useSessionStatus;
      const openSession = props.openSession;
      const openMenu = props.openMenu;
      const renameStore = props.renameStore;
      const renameSession = props.renameSession;
      const tw = typeof props.tw === 'function' ? props.tw : (key) => key;
      const t = typeof props.t === 'function' ? props.t : (key) => key;
      const [collapsed, setCollapsed] = React.useState(false);
      const [rect, setRect] = React.useState(null);
      const [tip, setTip] = React.useState(null);
      const [renameState, setRenameState] = React.useState(renameStore ? renameStore.get() : null);
      const [renameDraft, setRenameDraft] = React.useState('');
      const [renameBusy, setRenameBusy] = React.useState(false);
      const [renameError, setRenameError] = React.useState('');
      const listRef = React.useRef(null);

      React.useEffect(() => {
        if (!renameStore) return undefined;
        setRenameState(renameStore.get());
        return renameStore.subscribe(() => setRenameState(renameStore.get()));
      }, [renameStore]);

      React.useEffect(() => {
        if (renameState) {
          setRenameDraft(renameState.currentTitle || '');
          setRenameError('');
          setRenameBusy(false);
        }
      }, [renameState]);

      const closeRename = () => {
        if (!renameBusy && renameStore) renameStore.set(null);
      };
      const confirmRename = async () => {
        if (renameState == null) return;
        const title = renameDraft.trim();
        if (title === '') { setRenameError(t('rename.empty')); return; }
        if (typeof renameSession !== 'function') { setRenameError(t('rename.failed')); return; }
        setRenameBusy(true);
        setRenameError('');
        try {
          await renameSession(renameState.sessionId, title);
          if (renameStore) renameStore.set(null);
        } catch (_e) {
          setRenameError(t('rename.failed'));
          setRenameBusy(false);
        }
      };

      const sessions = typeof useSessions === 'function' ? useSessions((s) => s) : undefined;
      const workspaces = typeof useWorkspaces === 'function' ? useWorkspaces((s) => s) : undefined;
      const statuses = typeof useSessionStatus === 'function' ? useSessionStatus((s) => s) : undefined;

      const currentId = React.useMemo(() => {
        if (sessions == null || sessions.byId == null) return null;
        for (const id of Object.keys(sessions.byId)) {
          const s = sessions.byId[id];
          if (s && s.retainedBy && (s.retainedBy.mainView || 0) > 0) return id;
        }
        return null;
      }, [sessions]);

      const rows = React.useMemo(() => {
        if (sessions == null || sessions.byId == null) return [];
        const now = Date.now();
        const byId = sessions.byId;
        const ids = Array.isArray(sessions.ids) ? sessions.ids : Object.keys(byId);
        const projections = sessions.projectionsBySession || {};
        const archived = new Set(workspaces && Array.isArray(workspaces.archivedSessionIds) ? workspaces.archivedSessionIds : []);
        const pinned = new Set(workspaces && Array.isArray(workspaces.pinnedSessionIds) ? workspaces.pinnedSessionIds : []);
        const pathBySession = new Map();
        const workspaceIdBySession = new Map();
        if (workspaces && Array.isArray(workspaces.items)) {
          for (const w of workspaces.items) {
            if (!w || !Array.isArray(w.sessionIds)) continue;
            for (const sid of w.sessionIds) {
              if (!pathBySession.has(sid)) pathBySession.set(sid, w.path || '');
              if (!workspaceIdBySession.has(sid)) workspaceIdBySession.set(sid, w.workspaceId);
            }
          }
        }
        const out = [];
        for (const id of ids) {
          const s = byId[id];
          if (s == null) continue;
          if (s.origin === 'subagent') continue;
          if (s.blank) continue;
          if (archived.has(id)) continue;
          let subRunning = 0;
          const catalog = projections[id] && projections[id].values && projections[id].values.subagentCatalog;
          if (Array.isArray(catalog)) {
            for (const child of catalog) {
              if (child == null) continue;
              const cs = statuses && typeof statuses.get === 'function' ? statuses.get(child.id) : undefined;
              const childRunning = (cs && cs.running) || (byId[child.id] && byId[child.id].running);
              if (childRunning === true) subRunning += 1;
            }
          }
          const statusEntry = statuses && typeof statuses.get === 'function' ? statuses.get(id) : undefined;
          const list = statusList(statusEntry, s, subRunning, tw);
          const path = pathBySession.get(id) || (typeof s.cwd === 'string' ? s.cwd : '');
          out.push({
            id,
            title: titleOf(s) || tw('session.untitled'),
            updatedAt: typeof s.updatedAt === 'number' ? s.updatedAt : 0,
            timeCompact: compactTime(s.updatedAt, now, tw),
            path,
            workspaceId: workspaceIdBySession.get(id),
            pinned: pinned.has(id),
            current: id === currentId,
            statuses: list,
          });
        }
        out.sort((a, b) => (b.updatedAt - a.updatedAt) || (a.id < b.id ? 1 : -1));
        return out;
      }, [sessions, workspaces, statuses, currentId, tw]);

      // Reserve real layout space above the workspace browser and keep the
      // fixed section aligned with that reserved band.
      React.useEffect(() => {
        const height = collapsed ? COLLAPSED_HEIGHT : EXPANDED_HEIGHT;
        let region = null;
        let observer = null;
        const measure = () => {
          const result = reserveSpace(height);
          if (!result) { setRect(null); return; }
          region = result.region;
          const next = result.rect;
          setRect((prev) => (prev && next && prev.top === next.top && prev.left === next.left && prev.width === next.width ? prev : next));
          if (observer == null && typeof ResizeObserver !== 'undefined') {
            observer = new ResizeObserver(measure);
            if (region.parentElement) observer.observe(region.parentElement);
            observer.observe(region);
          }
        };
        measure();
        window.addEventListener('resize', measure);
        return () => {
          window.removeEventListener('resize', measure);
          if (observer) observer.disconnect();
          if (region && region.isConnected) {
            region.style.paddingTop = '';
            region.style.boxSizing = '';
          }
        };
      }, [collapsed]);

      // Keep the selected session visible (centred) when the selection changes.
      React.useEffect(() => {
        if (collapsed) return;
        const list = listRef.current;
        if (!list || currentId == null) return;
        const items = list.querySelectorAll('[data-rs-id]');
        let target = null;
        for (const item of items) if (item.dataset.rsId === currentId) { target = item; break; }
        if (!target) return;
        const lr = list.getBoundingClientRect();
        const tr = target.getBoundingClientRect();
        if (tr.top >= lr.top && tr.bottom <= lr.bottom) return;
        const next = list.scrollTop + (tr.top - lr.top) - (lr.height - tr.height) / 2;
        list.scrollTop = Math.max(0, next);
      }, [currentId, collapsed, rows.length, rect]);

      const header = h('div', {
        className: 'rsx-head',
        role: 'button',
        tabIndex: 0,
        'aria-expanded': collapsed ? 'false' : 'true',
        'aria-label': collapsed ? t('aria.expand') : t('aria.collapse'),
        onClick: () => setCollapsed((v) => !v),
        onKeyDown: (e) => {
          if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setCollapsed((v) => !v); }
        },
      },
        h(Chevron, { open: !collapsed }),
        h('span', { className: 'rsx-title' }, t('title')),
        h('span', { className: 'rsx-count' }, String(rows.length)));

      let body = null;
      if (!collapsed) {
        body = rows.length === 0
          ? h('div', { className: 'rsx-empty' }, t('empty'))
          : h('div', { className: 'rsx-list', role: 'tree', ref: listRef, onScroll: () => setTip(null) },
              rows.slice(0, 100).map((row) => {
                const primary = row.statuses[0];
                const baseProps = {
                  'data-rs-id': row.id,
                  className: 'rsx-row' + (row.current ? ' rsx-current' : ''),
                  role: 'treeitem',
                  'aria-selected': row.current ? true : false,
                  tabIndex: 0,
                  'aria-label': t('aria.open', { title: row.title }),
                  onClick: () => {
                    if (typeof openSession === 'function') openSession(row.id);
                    revealInWorkspace(row.id, row.workspaceId);
                  },
                  onContextMenu: (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setTip(null);
                    if (typeof openMenu === 'function') openMenu(row.id, row.title, { x: e.clientX, y: e.clientY });
                  },
                  onKeyDown: (e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      if (typeof openSession === 'function') openSession(row.id);
                      revealInWorkspace(row.id, row.workspaceId);
                    }
                  },
                };
                const kids = [
                  h('span', { className: 'rsx-status', 'aria-hidden': true }, primary.state === 'idle' ? null : h(StateDot, { state: primary.state })),
                  h('span', { className: 'rsx-name' }, row.title),
                  row.timeCompact ? h('span', { className: 'rsx-time' }, row.timeCompact) : null,
                  row.pinned ? h(PinGlyph) : null,
                ];
                if (ui.HoverCard != null) {
                  return h(ui.HoverCard, {
                    key: row.id,
                    anchor: h('div', baseProps, ...kids),
                    content: h(HoverContent, { row, tw }),
                    openDelayMs: 800,
                    grouped: true,
                    copyText: row.title,
                    copyLabel: tw('copy'),
                    copiedLabel: tw('hover.copied'),
                  });
                }
                return h('div', {
                  ...baseProps,
                  key: row.id,
                  onMouseEnter: (e) => {
                    const r = e.currentTarget.getBoundingClientRect();
                    setTip({ row, top: r.top, left: r.left });
                  },
                  onMouseLeave: () => setTip(null),
                }, ...kids);
              }));
      }

      let tooltip = null;
      if (!collapsed && tip != null) {
        const now = Date.now();
        tooltip = h('div', {
            className: 'rsx-tip',
            style: { top: tip.top + 'px', left: tip.left + 'px' },
            role: 'tooltip',
          },
            h('div', { className: 'rsx-tip-title' }, tip.row.title),
            tip.row.path ? h('div', { className: 'rsx-tip-path' }, tip.row.path) : null,
            h('div', { className: 'rsx-tip-time' }, hoverTime(tip.row.updatedAt, now, tw)),
            tip.row.statuses.map((st, i) => h('div', { className: 'rsx-tip-status', key: i },
              h(StateDot, { state: st.state }),
              h('span', null, st.label))));
      }

      let dialog = null;
      if (renameState != null) {
        dialog = h('div', {
            className: 'rsx-mask',
            onMouseDown: (e) => { if (e.target === e.currentTarget) closeRename(); },
          },
          h('div', {
              className: 'rsx-dialog',
              role: 'dialog',
              'aria-modal': 'true',
              'aria-label': t('rename.title'),
              onMouseDown: (e) => e.stopPropagation(),
            },
            h('div', { className: 'rsx-dialog-title' }, t('rename.title')),
            h('input', {
              className: 'rsx-input',
              value: renameDraft,
              autoFocus: true,
              onChange: (e) => setRenameDraft(e.target.value),
              onKeyDown: (e) => {
                if (e.key === 'Enter') { e.preventDefault(); confirmRename(); }
                else if (e.key === 'Escape') { e.preventDefault(); closeRename(); }
              },
            }),
            renameError ? h('div', { className: 'rsx-dialog-error' }, renameError) : null,
            h('div', { className: 'rsx-dialog-actions' },
              h('button', { type: 'button', className: 'rsx-btn', disabled: renameBusy, onClick: closeRename }, t('rename.cancel')),
              h('button', { type: 'button', className: 'rsx-btn primary', disabled: renameBusy, onClick: confirmRename }, t('rename.confirm')))));
      }

      const style = rect == null
        ? { display: 'none' }
        : { top: rect.top + 'px', left: rect.left + 'px', width: rect.width + 'px' };

      return h('div', { className: 'rsx-root', style },
        h('style', { key: 'rsx-style' }, CSS),
        header,
        body,
        tooltip,
        dialog);
    }

    return {
      inject: ['slots', 'locale', 'contextMenus', 'sessions', 'workspaces'],
      apply(ctx) {
        ctx.effect(() => ctx.locale.register(NS, { en, zh }), 'recent-sessions: dictionaries');

        const openSession = (sessionId) => {
          const uiWorkspace = ctx.get('uiWorkspace');
          if (uiWorkspace != null && typeof uiWorkspace.openSession === 'function') uiWorkspace.openSession(sessionId);
        };

        const contextMenus = ctx.get('contextMenus');
        const openMenu = (sessionId, displayTitle, point) => {
          if (contextMenus != null && typeof contextMenus.open === 'function') {
            contextMenus.open({ kind: 'session', value: { sessionId, displayTitle } }, point);
          }
        };

        // Right-click menu actions composed by this plugin: new session in the
        // owning workspace, plus open the session's workspace folder.
        const t = ctx.locale.bind(NS);
        const sessionsService = ctx.get('sessions');
        const workspacesService = ctx.get('workspaces');
        const renameStore = createRenameStore();
        const renameSession = async (sessionId, title) => {
          if (sessionsService == null || typeof sessionsService.using !== 'function') throw new Error('sessions service unavailable');
          const result = await sessionsService.using(sessionId, { source: 'workspaceOperation' }, (reference) => reference.binding.session.rename(title));
          if (result == null || result.ok !== true) throw new Error(result && result.error ? result.error.message : 'rename failed');
        };
        if (contextMenus != null && typeof contextMenus.register === 'function') {
          ctx.slots.inject('contextMenu.icon', function* () {
            yield ctx.slots.register({ name: 'contextMenu.icon', key: 'recent-sessions.folder' }, FolderIcon);
            yield ctx.slots.register({ name: 'contextMenu.icon', key: 'recent-sessions.new-session' }, NewSessionIcon);
            yield ctx.slots.register({ name: 'contextMenu.icon', key: 'recent-sessions.archive' }, ArchiveIcon);
            yield ctx.slots.register({ name: 'contextMenu.icon', key: 'recent-sessions.copy' }, CopyIcon);
            yield ctx.slots.register({ name: 'contextMenu.icon', key: 'recent-sessions.rename' }, RenameIcon);
          });
          ctx.effect(() => contextMenus.register({
            id: 'recent-sessions.menu',
            target: 'session',
            order: 100,
            observe: () => {
              const sources = [];
              if (sessionsService && sessionsService.list) sources.push(sessionsService.list);
              if (workspacesService && workspacesService.list) sources.push(workspacesService.list);
              return sources;
            },
            resolve: async ({ sessionId }) => {
              // Native session menu already provides rename / copy ID / reveal / archive.
              // This contribution only adds "new session" for the owning workspace.
              const items = workspacesService && workspacesService.list ? workspacesService.list.getSnapshot().items : undefined;
              const owning = Array.isArray(items)
                ? items.find((workspace) => workspace && Array.isArray(workspace.sessionIds) && workspace.sessionIds.includes(sessionId))
                : undefined;
              const workspaceId = owning && owning.workspaceId;
              if (!workspaceId) return [];
              return [{
                id: 'new-session',
                label: t('menu.newSession'),
                icon: { key: 'recent-sessions.new-session' },
                failureLabel: t('menu.newSessionError'),
                run: () => {
                  const uiWorkspace = ctx.get('uiWorkspace');
                  if (uiWorkspace != null && typeof uiWorkspace.startSession === 'function') uiWorkspace.startSession(workspaceId);
                },
              }];
            },
          }), 'recent-sessions: context menu');
        }

        let tw = (key) => key;
        try {
          const locale = ctx.get('locale');
          if (locale && typeof locale.bind === 'function') tw = locale.bind('workspace');
        } catch (_e) { /* keep fallback */ }

        ctx.slots.inject('shell.overlay', () => ctx.slots.register({
          name: 'shell.overlay',
          id: 'local.recent-sessions',
          order: 50,
          locale: NS,
          inject: () => ({ openSession, tw, openMenu, renameStore, renameSession }),
        }, RecentSessionsPanel));
      },
    };
  },
});
