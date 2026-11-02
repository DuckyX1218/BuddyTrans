/* ============================================================================
 * 译伴 BuddyTrans — injector.js (网页内注入脚本)
 * v0.2.0 UI 重构版
 * - 逻辑保持原版：划词翻译、视口懒翻译、占位符保护、SPA 感知、展示模式切换
 * - UI 重构：灰黑白单色、圆润字体、16px 圆角卡片、克制动效、深浅色主题
 * ==========================================================================*/
(function () {
'use strict';

const IS_PAGE = typeof window !== 'undefined' && typeof document !== 'undefined';

/* ------------------------------ 日志 ------------------------------ */
let logBuf = null, logFlushTimer = null;
function log(level, type, message, detail) {
  const entry = { ts: Date.now(), level, type, message, detail };
  if (IS_PAGE) chrome.runtime.sendMessage({ type: 'LOG', entry }).catch(() => {});
  else pushLog(entry);
  const tag = `[BT][${type}]`;
  if (level === 'error') console.error(tag, message, detail ?? '');
  else if (level === 'warn') console.warn(tag, message, detail ?? '');
  else console.log(tag, message, detail ?? '');
}
const logError = (t, m, d) => log('error', t, m, d);
const logWarn = (t, m, d) => log('warn', t, m, d);
const logInfo = (t, m, d) => log('info', t, m, d);
function pushLog(entry) {
  if (!logBuf) logBuf = [];
  logBuf.push(entry);
  if (logBuf.length > 500) logBuf = logBuf.slice(-500);
  if (!logFlushTimer) logFlushTimer = setTimeout(async () => {
    logFlushTimer = null;
    if (logBuf) await chrome.storage.local.set({ 'bt-logs': logBuf });
  }, 500);
}

/* ------------------------------ 主题与字体 ------------------------------ */
function resolveTheme(theme) {
  if (theme === 'light' || theme === 'dark') return theme;
  try { return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'; }
  catch { return 'light'; }
}
let currentTheme = 'light';

function fontFaceCss() {
  const q4 = chrome.runtime.getURL('fonts/quicksand-400.woff2');
  const q6 = chrome.runtime.getURL('fonts/quicksand-600.woff2');
  const r4 = chrome.runtime.getURL('fonts/resource-han-rounded-cn-400.woff2');
  const r6 = chrome.runtime.getURL('fonts/resource-han-rounded-cn-600.woff2');
  return `
    @font-face { font-family:'BT Quicksand'; font-weight:400; font-display:swap; src:url('${q4}') format('woff2'); }
    @font-face { font-family:'BT Quicksand'; font-weight:600; font-display:swap; src:url('${q6}') format('woff2'); }
    @font-face { font-family:'BT Rounded CN'; font-weight:400; font-display:swap; src:url('${r4}') format('woff2'); }
    @font-face { font-family:'BT Rounded CN'; font-weight:600; font-display:swap; src:url('${r6}') format('woff2'); }
  `;
}
const FONT_STACK = `'BT Quicksand','BT Rounded CN','Quicksand','Nunito','Yuanti SC','PingFang SC','Microsoft YaHei UI',system-ui,sans-serif`;

/* ------------------------------ 划词翻译浮层 ------------------------------ */
let bubbleApi = null;

function createBubble() {
  if (bubbleApi) return bubbleApi;
  const host = document.createElement('div');
  host.id = 'bt-bubble-host';
  const root = host.attachShadow({ mode: 'open' });
  root.innerHTML = `
    <style>
      ${fontFaceCss()}
      :host { all: initial; }
      .wrap { position: fixed; z-index: 2147483647; display: none; font-family: ${FONT_STACK}; }
      .trigger {
        display: flex; align-items: center; gap: 6px; padding: 7px 14px;
        background: #111111; color: #FFFFFF; border: none; border-radius: 999px;
        font: 600 13px/1 ${FONT_STACK}; cursor: pointer; user-select: none;
        box-shadow: 0 4px 14px rgba(0,0,0,.18); transition: background .15s ease, transform .15s ease;
      }
      .trigger:hover { background: #2B2B2B; transform: translateY(-1px); }
      .trigger:active { transform: translateY(0); }
      .trigger:focus-visible { outline: 2px solid #111111; outline-offset: 2px; }
      .panel {
        width: 340px; max-width: min(340px, calc(100vw - 24px));
        background: var(--card); color: var(--ink);
        border: 1px solid var(--line); border-radius: 16px;
        box-shadow: 0 8px 28px rgba(0,0,0,.10), 0 1px 2px rgba(0,0,0,.05);
        overflow: hidden; animation: bt-in .18s ease;
      }
      @keyframes bt-in { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: none; } }
      .wrap[data-theme="light"] { --card:#FFFFFF; --ink:#111111; --sub:#666666; --weak:#999999; --line:#E5E5E5; --fill:#F2F2F2; }
      .wrap[data-theme="dark"]  { --card:#1A1A1A; --ink:#F5F5F5; --sub:#A6A6A6; --weak:#7F7F7F; --line:#2A2A2A; --fill:#242424; }
      .head {
        display: flex; align-items: center; gap: 8px; padding: 10px 14px;
        border-bottom: 1px solid var(--line);
      }
      .lang { font: 500 12px/1.2 ${FONT_STACK}; color: var(--sub); letter-spacing: .02em; }
      .arrow { color: var(--weak); flex: none; }
      .close {
        margin-left: auto; width: 26px; height: 26px; border: none; border-radius: 8px;
        background: transparent; color: var(--sub); cursor: pointer; font-size: 14px; line-height: 1;
        display: flex; align-items: center; justify-content: center; transition: background .15s ease;
      }
      .close:hover { background: var(--fill); color: var(--ink); }
      .body { padding: 12px 14px; font: 400 14px/1.65 ${FONT_STACK}; white-space: pre-wrap; word-break: break-word; max-height: 240px; overflow: auto; }
      .skel { display: grid; gap: 8px; padding: 2px 0; }
      .skel i { display: block; height: 12px; border-radius: 6px; background: var(--fill); animation: bt-pulse 1.2s ease-in-out infinite; }
      .skel i:nth-child(2) { width: 86%; } .skel i:nth-child(3) { width: 62%; }
      @keyframes bt-pulse { 0%,100% { opacity: .45; } 50% { opacity: 1; } }
      .errbox { display: flex; gap: 10px; align-items: flex-start; padding: 12px 14px; border: 1px solid var(--line); border-radius: 12px; background: var(--fill); margin: 12px 14px; }
      .errbox .ico { flex: none; margin-top: 1px; }
      .errbox .msg { font: 400 13px/1.6 ${FONT_STACK}; color: var(--ink); white-space: pre-wrap; word-break: break-word; }
      .foot { display: flex; align-items: center; gap: 8px; padding: 10px 14px; border-top: 1px solid var(--line); }
      .act {
        display: inline-flex; align-items: center; gap: 6px; padding: 7px 14px;
        border: 1px solid var(--line); border-radius: 10px; background: var(--card);
        color: var(--ink); font: 600 12px/1 ${FONT_STACK}; cursor: pointer; transition: background .15s ease;
      }
      .act:hover { background: var(--fill); }
      .act:focus-visible { outline: 2px solid var(--ink); outline-offset: 2px; }
      .hint { margin-left: auto; font: 400 11px/1.4 ${FONT_STACK}; color: var(--weak); }
      .hidden { display: none !important; }
    </style>
    <div class="wrap" data-theme="light">
      <button class="trigger" type="button" aria-label="翻译选中文本">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 5h9M8.5 3v2c0 4-2.5 7.5-5.5 9M6 9.5c1.5 2 4 4.5 7 5.5"/><path d="M12.5 21l4.5-10 4.5 10M14.2 17.5h5.6"/></svg>
        译
      </button>
      <div class="panel hidden" role="dialog" aria-label="划词翻译结果">
        <div class="head">
          <span class="lang" id="bt-from">自动检测</span>
          <svg class="arrow" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>
          <span class="lang" id="bt-to">中文</span>
          <button class="close" type="button" aria-label="关闭">✕</button>
        </div>
        <div class="body" id="bt-body" aria-live="polite"></div>
        <div class="foot hidden" id="bt-foot">
          <button class="act" id="bt-copy" type="button">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="9" width="12" height="12" rx="2.5"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/></svg>
            复制
          </button>
          <button class="act hidden" id="bt-retry" type="button">重试</button>
          <span class="hint" id="bt-hint"></span>
        </div>
      </div>
    </div>`;
  document.documentElement.append(host);

  const wrap = root.querySelector('.wrap');
  const trigger = root.querySelector('.trigger');
  const panel = root.querySelector('.panel');
  const body = root.querySelector('#bt-body');
  const foot = root.querySelector('#bt-foot');
  const copyBtn = root.querySelector('#bt-copy');
  const retryBtn = root.querySelector('#bt-retry');
  const hint = root.querySelector('#bt-hint');
  root.querySelector('.close').addEventListener('click', () => hideBubble());

  function skeleton() {
    body.innerHTML = `<div class="skel" aria-label="翻译中"><i></i><i></i><i></i></div>`;
  }

  async function runTranslate() {
    const text = (host.dataset.selection ?? '').trim();
    foot.classList.add('hidden');
    retryBtn.classList.add('hidden');
    if (!text) {
      showError('未获取到选中文本，请重新划词后再试');
      return;
    }
    skeleton();
    try {
      const res = await chrome.runtime.sendMessage({
        type: 'TRANSLATE_BATCH',
        items: [{ id: 'bubble', text }],
        saveHistory: true
      });
      if (res?.ok) {
        body.textContent = res.results?.[0]?.text || '（无译文）';
        foot.classList.remove('hidden');
        hint.textContent = '';
      } else {
        const msgs = [];
        if (res?.notice?.message) msgs.push(res.notice.message);
        msgs.push(`失败原因：${res?.error ?? '未知错误'}`);
        showError(msgs.join('\n'), true);
        logError('bubble', '划词翻译失败', res?.error);
      }
    } catch (e) {
      showError(`无法连接翻译服务：${e?.message ?? e}`, true);
      logError('bubble', '划词消息发送失败', e?.stack);
    }
  }
  function showError(msg, canRetry) {
    body.innerHTML = '';
    const box = document.createElement('div');
    box.className = 'errbox';
    box.style.margin = '0';
    box.innerHTML = `<svg class="ico" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 8v5M12 16.5v.01"/></svg><span class="msg"></span>`;
    box.querySelector('.msg').textContent = msg;
    body.append(box);
    foot.classList.remove('hidden');
    hint.textContent = '';
    retryBtn.classList.toggle('hidden', !canRetry);
  }

  trigger.addEventListener('click', () => {
    trigger.classList.add('hidden');
    panel.classList.remove('hidden');
    wrap.dataset.state = 'panel';
    runTranslate();
  });
  copyBtn.addEventListener('click', async () => {
    const t = body.textContent ?? '';
    try { await navigator.clipboard.writeText(t); hint.textContent = '已复制'; setTimeout(() => hint.textContent = '', 1500); }
    catch { hint.textContent = '复制失败'; }
  });
  retryBtn.addEventListener('click', runTranslate);

  bubbleApi = { host, root, wrap, trigger, panel, body };
  return bubbleApi;
}

function showBubble(rect, selectedText) {
  const b = createBubble();
  b.host.dataset.selection = selectedText;
  b.wrap.dataset.theme = currentTheme;
  b.trigger.classList.remove('hidden');
  b.panel.classList.add('hidden');
  b.wrap.style.display = 'block';
  b.wrap.style.left = `${Math.max(8, Math.min(rect.left + window.scrollX - window.scrollX, window.innerWidth - 96))}px`;
  b.wrap.style.top = `${rect.bottom + 8}px`;
}
function hideBubble() {
  if (bubbleApi) bubbleApi.wrap.style.display = 'none';
}
function setupSelection() {
  document.addEventListener('mouseup', (e) => {
    const t = e.target;
    if (t?.closest?.('#bt-bubble-host')) return;
    const sel = window.getSelection();
    const text = sel?.toString().trim() ?? '';
    if (!text || t?.isContentEditable) { hideBubble(); return; }
    showBubble(sel.getRangeAt(0).getBoundingClientRect(), text);
  }, true);
  document.addEventListener('mousedown', (e) => {
    if (!e.target?.closest?.('#bt-bubble-host')) hideBubble();
  }, true);
}

/* ------------------------------ 文本提取与占位符 ------------------------------ */
const INLINE_TAGS = new Set(['A','ABBR','BR','CODE','DATA','DFN','IMG','KBD','OUTPUT','RP','RT','SAMP','SUB','SUP','SVG','TIME','VAR','WBR']);
const MAX_PIECES = 6, MIN_LETTERS = 2;
const LETTER_RE = /\p{L}/gu;
function countLetters(s) { return (s.match(LETTER_RE) ?? []).length; }

function extract(el) {
  const pieces = [];
  let text = '', plain = '';
  const walk = (node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      const t = (node.textContent ?? '').replace(/\s+/g, ' ');
      text += t; plain += t; return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const el2 = node;
    if (el2.tagName === 'BR') { text += '\n'; plain += '\n'; }
    else if (INLINE_TAGS.has(el2.tagName)) {
      pieces.push(el2.cloneNode(true));
      text += `{{${pieces.length - 1}}}`;
      plain += (el2.textContent ?? '').replace(/\s+/g, ' ');
    } else el2.childNodes.forEach(walk);
  };
  el.childNodes.forEach(walk);
  text = text.trim();
  plain = plain.replace(/\s+/g, ' ').trim();
  const stripped = text.replace(/\{\{\d+\}\}/g, '');
  if (!text || countLetters(stripped) < MIN_LETTERS) return null;
  if (pieces.length > MAX_PIECES) return { text: plain, plain, pieces: [], withPlaceholders: false };
  return { text, plain, pieces, withPlaceholders: pieces.length > 0 };
}

function checkPlaceholders(tr, expected) {
  const ids = [...tr.matchAll(/\{\{(\d+)\}\}/g)].map(m => Number(m[1]));
  if (expected === 0) return ids.length ? `输入没有占位符，译文却出现了 ${ids.length} 个（如 {{${ids[0]}}}）` : null;
  if (ids.length !== expected) return `占位符数量不符（期望 ${expected} 个，实际 ${ids.length} 个）`;
  const seen = new Set();
  for (let i = 0; i < ids.length; i++) {
    const id = ids[i];
    if (id < 0 || id >= expected) return `占位符 {{${id}}} 越界`;
    if (seen.has(id)) return `占位符 {{${id}}} 重复`;
    if (i > 0 && id <= ids[i - 1]) return `占位符顺序错乱（{{${ids[i - 1]}}} 后出现 {{${id}}}）`;
    seen.add(id);
  }
  return null;
}

function fillPlain(tr, pieces) {
  return tr.replace(/\{\{(\d+)\}\}/g, (_, n) => (pieces[Number(n)]?.textContent ?? '').replace(/\s+/g, ' ').trim())
    .replace(/[ \t]{2,}/g, ' ').replace(/\s+([,.;:!?，。；：、])/g, '$1').trim();
}
function fillPlainLoose(tr, pieces) {
  const used = new Set();
  const filled = tr.replace(/\{\{(\d+)\}\}/g, (_, n) => {
    const i = Number(n); used.add(i);
    return (pieces[i]?.textContent ?? '').replace(/\s+/g, ' ').trim();
  });
  const rest = pieces.map((p, i) => (p && !used.has(i)) ? (p.textContent ?? '').replace(/\s+/g, ' ').trim() : '').filter(Boolean);
  const main = filled.replace(/[ \t]{2,}/g, ' ').replace(/\s+([,.;:!?，。；：、])/g, '$1').trim();
  return rest.length ? `${main} ${rest.join(' ')}`.trim() : main;
}
function fillRich(tr, pieces) {
  const frag = document.createDocumentFragment();
  const used = new Set();
  const re = /\{\{(\d+)\}\}/g;
  let last = 0, m;
  while ((m = re.exec(tr)) !== null) {
    if (m.index > last) frag.append(tr.slice(last, m.index));
    const i = Number(m[1]);
    const piece = pieces[i];
    if (piece) {
      const node = piece.cloneNode(true);
      node.removeAttribute?.('data-bt-done');
      node.removeAttribute?.('data-bt-pending');
      frag.append(node);
      used.add(i);
    }
    last = m.index + m[0].length;
  }
  if (last < tr.length) frag.append(tr.slice(last));
  pieces.forEach((p, i) => {
    if (p && !used.has(i)) {
      const node = p.cloneNode(true);
      node.removeAttribute?.('data-bt-done');
      node.removeAttribute?.('data-bt-pending');
      frag.append(node);
    }
  });
  return frag;
}

/* ------------------------------ 内联译文样式（灰黑白单色） ------------------------------ */
const INLINE_CSS = `
${''}/* 译伴：双语对照内联译文 —— 灰黑白单色 · 圆润克制 */
.bt-tr {
  display: block;
  margin: 6px 0 10px;
  padding: 4px 10px;
  border-left: 2px solid rgba(128,128,128,.55);
  border-radius: 0 8px 8px 0;
  background: rgba(128,128,128,.08);
  color: inherit;
  opacity: .88;
  font-family: 'BT Quicksand','BT Rounded CN','Quicksand','Nunito','Yuanti SC','PingFang SC','Microsoft YaHei UI',system-ui,sans-serif;
}
.bt-tr a { color: inherit; }
html[data-bt-mode="target"] .bt-src { display: none !important; }
html[data-bt-mode="source"] .bt-tr { display: none !important; }
html[data-bt-mode="target"] .bt-tr { border-left: none; background: transparent; padding: 0; margin: 0; opacity: 1; border-radius: 0; }
.bt-pending { opacity: .55; }
.bt-src, .bt-tr { transition: opacity .2s; }
/* 翻译进行中：占位行呼吸动画 */
.bt-loading { color: rgba(128,128,128,.9); font-style: normal; animation: bt-pulse 1.3s ease-in-out infinite; }
@keyframes bt-pulse { 0%, 100% { opacity: .35; } 50% { opacity: .85; } }
/* 翻译失败：内联单色错误行，点击重试 */
.bt-error { color: inherit; cursor: pointer; border-left-color: rgba(128,128,128,.9); }
.bt-error:hover { text-decoration: underline; }
#bt-pill, #bt-bubble-host, #bt-notice-host, #bt-error-host { all: initial; }
`;

const SKIP_TAGS = new Set(['CODE','PRE','TEXTAREA','INPUT','SELECT','SCRIPT','STYLE','NOSCRIPT','IFRAME','SVG','CANVAS','AUDIO','VIDEO','BUTTON']);
const BLOCK_SELECTOR = 'p, h1, h2, h3, h4, h5, h6, li, blockquote, dd, dt, figcaption, td, th';

const state = {
  active: false, mode: 'bilingual', settings: null,
  io: null, mo: null,
  queue: new Map(), textIndex: new Map(), nextId: 1,
  pieces: new WeakMap(), slots: new WeakMap(), nodes: new WeakMap(), retried: new WeakSet(),
  flushTimer: 0, injectRaf: 0, pendingInjections: [],
  selfMutationUntil: 0, recent: [], pageKey: '', restarting: false
};
const RECENT_KEEP = 2;

function rememberRecent(src, dst) {
  const s = src.trim(), d = dst.trim();
  if (!s || !d) return;
  state.recent.push({ src: s, dst: d });
  if (state.recent.length > RECENT_KEEP) state.recent.splice(0, state.recent.length - RECENT_KEEP);
}
function buildContext() {
  if (state.settings?.useContext && state.recent.length) return { recent: state.recent.slice() };
}
function silenceMutations() { state.selfMutationUntil = Date.now() + 300; }

function isTranslatable(el) {
  if (SKIP_TAGS.has(el.tagName) || el.isContentEditable || el.closest('[contenteditable="true"]') || el.closest('pre, code')) return false;
  if (el.dataset.btDone || el.dataset.btPending || el.querySelector(BLOCK_SELECTOR)) return false;
  const ex = extract(el);
  if (!ex || ex.text.length < 2) return false;
  const cjk = (ex.text.match(/[一-鿿]/g) ?? []).length;
  if (cjk / ex.text.length > 0.3) return false;
  el.dataset.btText = ex.text.slice(0, 4000);
  el.dataset.btPlain = ex.plain.slice(0, 4000);
  state.pieces.set(el, ex.pieces);
  return true;
}

function scanAll() {
  if (!state.io) return 0;
  checkSpa();
  let count = 0;
  document.body?.querySelectorAll(BLOCK_SELECTOR)?.forEach(el => {
    if (isTranslatable(el)) { state.io.observe(el); count++; }
  });
  return count;
}

function enqueueRich(el) { enqueue(el, el.dataset.btText, false); }
function enqueuePlain(el) {
  const t = el.dataset.btPlain || el.dataset.btText;
  if (t) enqueue(el, t, true);
}
function enqueue(el, text, plain) {
  el.dataset.btPending = '1';
  el.classList.add('bt-pending');
  if (!plain) insertLoading(el);
  const key = `${plain ? 'P' : 'H'}|${text}`;
  const existId = state.textIndex.get(key);
  const exist = existId ? state.queue.get(existId) : undefined;
  if (existId && exist) exist.els.push(el);
  else {
    const id = `bt${state.nextId++}`;
    state.queue.set(id, { text, els: [el], plain });
    state.textIndex.set(key, id);
  }
  if (!state.flushTimer) state.flushTimer = window.setTimeout(flushQueue, 150);
}

function insertLoading(el) {
  if (state.slots.get(el)?.isConnected) return;
  const span = document.createElement('span');
  span.className = 'bt-tr bt-loading';
  span.textContent = '翻译中…';
  silenceMutations();
  el.after(span);
  state.slots.set(el, span);
}
function insertError(el, err) {
  clearPending(el);
  let slot = state.slots.get(el);
  if (!slot || !slot.isConnected) {
    slot = document.createElement('span');
    slot.className = 'bt-tr';
    silenceMutations();
    el.after(slot);
    state.slots.set(el, slot);
  }
  slot.className = 'bt-tr bt-error';
  slot.textContent = `⚠ 翻译失败：${err}（点击重试）`;
  slot.onclick = () => retry(el);
}
function retry(el) {
  if (!el.dataset.btText || el.dataset.btDone) return;
  state.slots.get(el)?.remove();
  state.retried.delete(el);
  enqueueRich(el);
}
function clearPending(el) {
  delete el.dataset.btPending;
  el.classList.remove('bt-pending');
}

function batchSize() {
  const s = state.settings;
  const cap = s?.batchMaxTexts ?? 20;
  return s?.local.enabled ? Math.max(1, Math.min(cap, s.local.batchSize || 6)) : cap;
}
function waitTimeoutMs() {
  const s = state.settings;
  return s?.local.enabled ? Math.max(60000, (s.local.timeoutMs || 120000) + 30000) : 120000;
}

/* ------------------------------ 批量失败：局部化错误提示（不污染正文） ------------------------------ */
let failedBatches = [];
let errorHost = null;

function hideTranslateError() {
  errorHost?.remove();
  errorHost = null;
}

function failBatch(batch, err, freeDown) {
  // 恢复原文外观：清除加载占位与 pending 状态，不往正文里插入错误文案
  batch.forEach(item => item.els.forEach(el => {
    clearPending(el);
    state.slots.get(el)?.remove();
    state.slots.delete(el);
  }));
  failedBatches.push(batch);
  showTranslateError(err, freeDown);
}

function showTranslateError(err, freeDown) {
  hideTranslateError();
  const host = document.createElement('div');
  host.id = 'bt-error-host';
  const root = host.attachShadow({ mode: 'open' });
  root.innerHTML = `
    <style>
      ${fontFaceCss()}
      :host { all: initial; }
      .bar {
        position: fixed; bottom: 52px; left: 50%; transform: translateX(-50%);
        z-index: 2147483647; display: flex; gap: 14px; align-items: center;
        max-width: min(620px, calc(100vw - 24px));
        background: #1A1A1A; color: #F5F5F5; border: 1px solid #2A2A2A;
        padding: 10px 16px; border-radius: 12px;
        font: 400 13px/1.5 ${FONT_STACK}; box-shadow: 0 4px 16px rgba(0,0,0,.24);
        animation: bt-err-in .2s ease;
      }
      @keyframes bt-err-in { from { opacity: 0; transform: translate(-50%, 6px); } to { opacity: 1; transform: translate(-50%, 0); } }
      .msg { min-width: 0; }
      .msg b { font-weight: 600; }
      .reason { display: block; margin-top: 2px; color: #A6A6A6; word-break: break-word; }
      a { color: #F5F5F5; cursor: pointer; font-weight: 600; text-decoration: underline; text-underline-offset: 3px; white-space: nowrap; flex: none; }
      a:focus-visible { outline: 2px solid #F5F5F5; outline-offset: 2px; }
    </style>
    <div class="bar" role="alert">
      <div class="msg">
        <b>翻译失败</b>（已恢复原文，页面其他内容不受影响）
        <span class="reason"></span>
      </div>
      <a id="bt-err-retry" role="button" tabindex="0">重试</a>
      ${freeDown ? '<a id="bt-err-config" role="button" tabindex="0">去配置 BYOK</a>' : ''}
      <a id="bt-err-close" role="button" tabindex="0">关闭</a>
    </div>`;
  root.querySelector('.reason').textContent = err;
  document.documentElement.append(host);
  errorHost = host;
  root.getElementById('bt-err-retry').addEventListener('click', () => {
    const batches = failedBatches;
    failedBatches = [];
    hideTranslateError();
    batches.forEach(b => b.forEach(item => item.els.forEach(el => {
      if (!el.dataset.btDone) (item.plain ? enqueuePlain(el) : enqueueRich(el));
    })));
  });
  const cfg = root.getElementById('bt-err-config');
  if (cfg) cfg.addEventListener('click', () => chrome.runtime.sendMessage({ type: 'OPEN_OPTIONS' }));
  root.getElementById('bt-err-close').addEventListener('click', hideTranslateError);
  setTimeout(() => { if (errorHost === host) hideTranslateError(); }, 60000);
}

async function flushQueue() {
  state.flushTimer = 0;
  const limit = batchSize();
  const batch = [];
  let chars = 0;
  for (const [id, item] of state.queue) {
    if (!item.els.length) { state.queue.delete(id); continue; }
    if (batch.length >= limit || chars + item.text.length > 4000) break;
    batch.push({ id, text: item.text, els: item.els, plain: item.plain });
    chars += item.text.length;
  }
  if (!batch.length) return;
  batch.forEach(b => {
    state.queue.delete(b.id);
    state.textIndex.delete(`${b.plain ? 'P' : 'H'}|${b.text}`);
  });
  logInfo('injector', `批次发送：${batch.length} 段（队列剩余 ${state.queue.size} 段）`);
  requestBatch(batch);
  if (state.queue.size) state.flushTimer = window.setTimeout(flushQueue, 60);
}

async function requestBatch(batch) {
  const ctx = buildContext();
  const failAll = (err, freeDown) => failBatch(batch, err, freeDown);
  let res;
  try {
    res = await Promise.race([
      chrome.runtime.sendMessage({ type: 'TRANSLATE_BATCH', items: batch.map(b => ({ id: b.id, text: b.text })), context: ctx }),
      new Promise(r => setTimeout(() => r({ ok: false, error: `翻译服务长时间无响应（超过 ${Math.round(waitTimeoutMs() / 1000)} 秒），已中止本次等待` }), waitTimeoutMs()))
    ]);
  } catch (e) {
    failAll('无法连接后台翻译服务，请到 chrome://extensions 重载扩展');
    logError('injector', '批量翻译消息发送失败', e?.stack);
    return;
  }
  if (!res?.ok) {
    failAll(res?.error ?? '未知错误', res?.notice?.kind === 'free-down');
    logError('injector', `批量翻译失败（${batch.length} 条）`, res?.error);
    return;
  }
  const map = new Map((res.results ?? []).map(r => [r.id, r.text]));
  logInfo('injector', `批量注入 ${map.size}/${batch.length} 条译文`);
  batch.forEach(b => {
    const t = map.get(b.id);
    if (t) {
      if (b.plain) b.els.forEach(el => applyPlain(el, t));
      else b.els.forEach(el => applyRich(el, t));
    } else {
      b.els.forEach(el => insertError(el, '模型未返回该段译文'));
    }
  });
  scheduleInject();
}

function applyRich(el, tr) {
  const pieces = state.pieces.get(el) ?? [];
  const problem = checkPlaceholders(tr, pieces.length);
  if (problem) {
    logWarn('injector', `占位符异常，先降级为纯文本：${problem}`, `原文片段：${(el.dataset.btText ?? '').slice(0, 120)}\n译文片段：${tr.slice(0, 200)}`);
    queueInjection(el, fillPlainLoose(tr, pieces), true);
    if (pieces.length > 0 && !state.retried.has(el)) {
      state.retried.add(el);
      enqueuePlain(el);
    }
  } else {
    queueInjection(el, tr, pieces.length === 0);
  }
}
function queueInjection(el, tr, plain) {
  state.pendingInjections.push({ el, tr, plain });
}
function scheduleInject() {
  if (!state.injectRaf) state.injectRaf = requestAnimationFrame(() => {
    state.injectRaf = 0;
    for (const job of state.pendingInjections) renderInjection(job.el, job.tr, job.plain);
    state.pendingInjections = [];
  });
}
function renderInjection(el, tr, plain) {
  clearPending(el);
  silenceMutations();
  state.slots.get(el)?.remove();
  state.slots.delete(el);
  const pieces = state.pieces.get(el) ?? [];
  const plainText = fillPlain(tr, pieces);
  let node = state.nodes.get(el);
  if (node && !node.isConnected) node = undefined;
  if (!node) {
    const next = el.nextElementSibling;
    if (next?.classList?.contains('bt-tr')) node = next;
  }
  if (!node) {
    let cur = el.nextElementSibling;
    for (let i = 0; cur && i < 5; i++) {
      const nxt = cur.nextElementSibling;
      if (!cur.classList?.contains('bt-tr')) break;
      cur.remove();
      cur = nxt;
    }
    node = document.createElement('span');
    el.after(node);
  }
  node.className = 'bt-tr';
  if (plain) {
    node.textContent = plainText;
  } else {
    node.textContent = '';
    node.append(fillRich(tr, pieces));
    if (/\{\{\d+\}\}/.test(node.textContent ?? '')) node.textContent = plainText;
  }
  let after = node.nextElementSibling;
  for (let i = 0; after && i < 5; i++) {
    const nxt = after.nextElementSibling;
    if (!after.classList?.contains('bt-tr')) break;
    after.remove();
    after = nxt;
  }
  state.nodes.set(el, node);
  el.classList.add('bt-src');
  el.dataset.btDone = '1';
  rememberRecent(el.dataset.btPlain ?? el.dataset.btText ?? '', node.textContent ?? '');
}
function applyPlain(el, tr) { renderInjection(el, tr, true); }

/* ------------------------------ 通知条 / 状态胶囊（单色） ------------------------------ */
function showNotice(message) {
  const host = document.createElement('div');
  host.id = 'bt-notice-host';
  const root = host.attachShadow({ mode: 'open' });
  root.innerHTML = `
    <style>
      ${fontFaceCss()}
      .bar {
        position: fixed; top: 12px; left: 50%; transform: translateX(-50%);
        z-index: 2147483647; display: flex; gap: 12px; align-items: center;
        background: #1A1A1A; color: #F5F5F5; border: 1px solid #2A2A2A;
        padding: 10px 16px; border-radius: 12px;
        font: 400 13px/1.5 ${FONT_STACK}; box-shadow: 0 4px 16px rgba(0,0,0,.24);
      }
      a {
        color: #F5F5F5; cursor: pointer; font-weight: 600;
        text-decoration: underline; text-underline-offset: 3px;
      }
      a:focus-visible { outline: 2px solid #F5F5F5; outline-offset: 2px; }
    </style>
    <div class="bar"><span>${message}</span><a id="go" role="button" tabindex="0">去配置</a></div>`;
  document.documentElement.append(host);
  root.getElementById('go').addEventListener('click', () => chrome.runtime.sendMessage({ type: 'OPEN_OPTIONS' }));
  setTimeout(() => host.remove(), 10000);
}

function showPill(message) {
  const host = document.createElement('div');
  host.id = 'bt-pill';
  const root = host.attachShadow({ mode: 'open' });
  root.innerHTML = `
    <style>
      ${fontFaceCss()}
      .bar {
        position: fixed; bottom: 16px; left: 50%; transform: translateX(-50%);
        z-index: 2147483647; background: rgba(17,17,17,.92); color: #F5F5F5;
        border: 1px solid rgba(255,255,255,.08);
        padding: 8px 16px; border-radius: 999px;
        font: 500 12px/1.4 ${FONT_STACK}; letter-spacing: .01em;
        box-shadow: 0 4px 14px rgba(0,0,0,.22);
        animation: bt-pill-in .2s ease;
      }
      @keyframes bt-pill-in { from { opacity: 0; transform: translate(-50%, 6px); } to { opacity: 1; transform: translate(-50%, 0); } }
    </style>
    <div class="bar">${message}</div>`;
  document.documentElement.append(host);
  setTimeout(() => host.remove(), 1400);
}

/* ------------------------------ 展示模式与开关 ------------------------------ */
function setMode(mode, silent = false) {
  state.mode = mode;
  document.documentElement.dataset.btMode = mode;
  if (!silent) showPill({ bilingual: '双语对照', target: '仅译文', source: '仅原文' }[mode]);
  if (state.settings) {
    state.settings.displayMode = mode;
    chrome.runtime.sendMessage({ type: 'SET_DISPLAY_MODE', mode }).catch(() => {});
  }
}

function startTranslate(silent = false) {
  if (state.active) return;
  state.active = true;
  injectInlineStyle();
  const label = { bilingual: '双语对照', target: '仅译文', source: '仅原文' }[state.mode];
  if (!silent) showPill(`整页翻译已开启（当前：${label}）`);
  if (state.mode === 'source') logWarn('injector', '当前为"仅原文"模式：译文会被隐藏，按 Alt+M 可切换为双语');
  state.io = new IntersectionObserver(
    entries => entries.forEach(en => en.isIntersecting && enqueueRich(en.target)),
    { rootMargin: `${state.settings?.rootMarginPx ?? 200}px 0px` }
  );
  const count = scanAll();
  logInfo('injector', `整页翻译开启：本页扫描到 ${count} 个可翻译段落（当前模式：${label}）`);
  if (count === 0 && !silent) {
    showPill('未找到可翻译的外文内容（本页可能已是目标语言）');
    logWarn('injector', '扫描结果为 0 段：可能整页为目标语言、或页面结构全是跳过标签');
  }
  const mo = new MutationObserver(() => {
    checkSpa();
    if (Date.now() < state.selfMutationUntil) return;
    clearTimeout(mo._t);
    mo._t = window.setTimeout(scanAll, 300);
  });
  mo.observe(document.body, { childList: true, subtree: true });
  state.mo = mo;
}

function checkSpa() {
  if (state.restarting || location.href === state.pageKey) return false;
  const from = state.pageKey;
  state.pageKey = location.href;
  state.recent.length = 0;
  state.queue.clear();
  state.textIndex.clear();
  state.pendingInjections = [];
  hideTranslateError();
  failedBatches = [];
  document.querySelectorAll('.bt-tr').forEach(n => n.remove());
  document.querySelectorAll('[data-bt-done]').forEach(el => {
    delete el.dataset.btDone;
    el.classList.remove('bt-src');
  });
  logInfo('injector', '检测到页面切换（SPA），已清空上下文与队列', `from=${from.slice(0, 90)}\nto=${location.href.slice(0, 90)}`);
  if (state.active) {
    state.restarting = true;
    try { stopTranslate(true); startTranslate(true); }
    finally { state.restarting = false; }
  }
  return true;
}

function stopTranslate(silent = false) {
  state.active = false;
  state.io?.disconnect(); state.io = null;
  state.mo?.disconnect(); state.mo = null;
  let cancelled = 0;
  clearTimeout(state.flushTimer);
  state.flushTimer = 0;
  for (const item of state.queue.values()) {
    for (const el of item.els) {
      clearPending(el);
      state.slots.get(el)?.remove();
      state.slots.delete(el);
      cancelled++;
    }
  }
  state.queue.clear();
  state.textIndex.clear();
  hideTranslateError();
  failedBatches = [];
  if (!silent) showPill(cancelled ? `整页翻译已关闭（取消 ${cancelled} 段待翻译）` : '整页翻译已关闭');
  logInfo('injector', `整页翻译关闭${cancelled ? `，取消 ${cancelled} 段排队` : ''}`);
}

function injectInlineStyle() {
  if (document.getElementById('bt-style')) return;
  const style = document.createElement('style');
  style.id = 'bt-style';
  const q4 = chrome.runtime.getURL('fonts/quicksand-400.woff2');
  const q6 = chrome.runtime.getURL('fonts/quicksand-600.woff2');
  const r4 = chrome.runtime.getURL('fonts/resource-han-rounded-cn-400.woff2');
  const r6 = chrome.runtime.getURL('fonts/resource-han-rounded-cn-600.woff2');
  style.textContent = `
    @font-face { font-family:'BT Quicksand'; font-weight:400; font-display:swap; src:url('${q4}') format('woff2'); }
    @font-face { font-family:'BT Quicksand'; font-weight:600; font-display:swap; src:url('${q6}') format('woff2'); }
    @font-face { font-family:'BT Rounded CN'; font-weight:400; font-display:swap; src:url('${r4}') format('woff2'); }
    @font-face { font-family:'BT Rounded CN'; font-weight:600; font-display:swap; src:url('${r6}') format('woff2'); }
  ` + INLINE_CSS;
  document.head.append(style);
}

/* ------------------------------ 入口 ------------------------------ */
function main() {
  if (window.__BT__) { logInfo('injector', 'content script 已在运行，跳过重复注入'); return; }
  window.__BT__ = true;
  state.pageKey = location.href;
  logInfo('injector', 'content script 已注入，等待指令');

  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type === 'TOGGLE_PAGE_TRANSLATE') {
      if (checkSpa() && state.active) return;
      if (state.active) stopTranslate();
      else startTranslate();
      return;
    }
    if (msg.type === 'CYCLE_DISPLAY_MODE') {
      const modes = ['bilingual', 'target', 'source'];
      setMode(modes[(modes.indexOf(state.mode) + 1) % 3]);
    }
  });

  window.addEventListener('popstate', checkSpa);
  window.addEventListener('hashchange', checkSpa);

  (async () => {
    try {
      const res = await chrome.runtime.sendMessage({ type: 'GET_SETTINGS' });
      state.settings = res.settings;
      currentTheme = resolveTheme(res.settings?.theme);
      try {
        window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
          if ((state.settings?.theme ?? 'system') === 'system') currentTheme = resolveTheme('system');
        });
      } catch {}
      setMode(res.settings.displayMode, true);
      setupSelection();
    } catch (e) {
      logError('injector', '初始化失败：无法获取设置', e?.stack);
      showPill('初始化失败，请刷新页面重试');
    }
  })();
}

try {
  main();
} catch (e) {
  console.error('[BT][injector] 启动失败', e);
  throw e;
}
})();
