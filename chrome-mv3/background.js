/* ============================================================================
 * 译伴 BuddyTrans — background service worker (MV3)
 * v0.2.0 UI 重构版
 * - 保留原有翻译管线：本地模型 → 免费通道 → BYOK、占位符校验、缓存、日志
 * - 新增：请求级源/目标语言覆盖、翻译历史记录、主题同步、侧边栏打开
 * ==========================================================================*/

const FREE_MODELS = ['tencent/Hunyuan-MT-7B', 'THUDM/GLM-4-9B-0414', 'Qwen/Qwen3.5-4B'];

const DEFAULT_SETTINGS = {
  useFreeChannel: true,
  freeEndpoint: 'https://relay.buddy-trans.example.com/v1',
  freeModel: FREE_MODELS[0],
  byok: { baseUrl: 'https://api.deepseek.com/v1', apiKey: '', model: 'deepseek-chat' },
  local: { enabled: false, baseUrl: 'http://127.0.0.1:11434/v1', apiKey: '', model: 'qwen2.5:7b', batchSize: 6, timeoutMs: 120000, fallback: true },
  autoFallbackByok: true,
  displayMode: 'bilingual',
  targetLang: '中文',
  sourceLang: 'auto',
  theme: 'system',          // 'light' | 'dark' | 'system'
  glossary: {},
  customPrompt: '',
  useContext: false,
  batchMaxTexts: 20,
  rootMarginPx: 200,
  siteRules: {}
};

const SETTINGS_KEY = 'bt-settings';

async function getSettings() {
  const raw = (await chrome.storage.local.get(SETTINGS_KEY))[SETTINGS_KEY];
  if (!raw) return { ...DEFAULT_SETTINGS };
  return {
    ...DEFAULT_SETTINGS,
    ...raw,
    byok: { ...DEFAULT_SETTINGS.byok, ...(raw.byok ?? {}) },
    local: { ...DEFAULT_SETTINGS.local, ...(raw.local ?? {}) },
    glossary: { ...(raw.glossary ?? {}) },
    siteRules: { ...(raw.siteRules ?? {}) }
  };
}

async function saveSettings(patch) {
  const cur = await getSettings();
  const next = {
    ...cur, ...patch,
    byok: { ...cur.byok, ...(patch.byok ?? {}) },
    local: { ...cur.local, ...(patch.local ?? {}) }
  };
  await chrome.storage.local.set({ [SETTINGS_KEY]: next });
  return next;
}

/* ------------------------------ 日志 ------------------------------ */
const LOG_KEY = 'bt-logs';
const LOG_CAP = 500;
const IN_WORKER = typeof window === 'undefined' || typeof document === 'undefined';
let logBuf = null;
let logFlushTimer = null;

function log(level, type, message, detail) {
  const entry = { ts: Date.now(), level, type, message, detail };
  if (IN_WORKER) pushLog(entry);
  else chrome.runtime.sendMessage({ type: 'LOG', entry }).catch(() => {});
  const tag = `[BT][${type}]`;
  if (level === 'error') console.error(tag, message, detail ?? '');
  else if (level === 'warn') console.warn(tag, message, detail ?? '');
  else console.log(tag, message, detail ?? '');
}
const logError = (t, m, d) => log('error', t, m, d);
const logWarn = (t, m, d) => log('warn', t, m, d);
const logInfo = (t, m, d) => log('info', t, m, d);
const logDebug = (t, m, d) => log('debug', t, m, d);

function pushLog(entry) {
  if (!logBuf) logBuf = [];
  logBuf.push(entry);
  if (logBuf.length > LOG_CAP) logBuf = logBuf.slice(-LOG_CAP);
  scheduleFlush();
}
function scheduleFlush() {
  if (!logFlushTimer) logFlushTimer = setTimeout(flushLogs, 500);
}
async function flushLogs() {
  logFlushTimer = null;
  if (logBuf) await chrome.storage.local.set({ [LOG_KEY]: logBuf });
}
async function getLogs() {
  if (!logBuf) logBuf = (await chrome.storage.local.get(LOG_KEY))[LOG_KEY] ?? [];
  return logBuf;
}
async function clearLogs() {
  logBuf = [];
  await chrome.storage.local.set({ [LOG_KEY]: [] });
}

function errorMessage(err, timeoutMs) {
  if (err?.name === 'TimeoutError' || err?.name === 'AbortError')
    return `接口请求超时（${timeoutMs ? `${Math.round(timeoutMs / 1000)} 秒` : '设定时长'}无响应），请检查网络或稍后重试`;
  if (err instanceof TypeError)
    return '网络错误：无法连接到接口（请检查网络、Base URL 或接口跨域授权）';
  return err?.message ?? String(err);
}

/* ------------------------------ 历史记录 ------------------------------ */
const HIST_KEY = 'bt-history';
const HIST_CAP = 100;

async function getHistory() {
  return (await chrome.storage.local.get(HIST_KEY))[HIST_KEY] ?? [];
}
async function addHistory(items, results, lang, targetLang) {
  try {
    const map = new Map((results ?? []).map(r => [r.id, r.text]));
    const now = Date.now();
    const fresh = items
      .map((it, i) => {
        const dst = map.get(it.id);
        if (!dst) return null;
        return { id: `h${now}${i}${Math.random().toString(36).slice(2, 7)}`, src: it.text, dst, from: lang?.source ?? 'auto', to: targetLang, ts: now };
      })
      .filter(Boolean);
    if (!fresh.length) return;
    const cur = await getHistory();
    const next = [...fresh.reverse(), ...cur].slice(0, HIST_CAP);
    await chrome.storage.local.set({ [HIST_KEY]: next });
  } catch (e) {
    logWarn('history', '写入历史记录失败', errorMessage(e));
  }
}
async function removeHistory(id) {
  const cur = await getHistory();
  await chrome.storage.local.set({ [HIST_KEY]: cur.filter(h => h.id !== id) });
}
async function clearHistory() {
  await chrome.storage.local.set({ [HIST_KEY]: [] });
}

/* ------------------------------ 文本锚点（缓存防错位） ------------------------------ */
function hashStr(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0).toString(36) + '.' + s.length.toString(36);
}
const TOKEN_RE = /`[^`]+`|\b[A-Za-z]\w*_[A-Za-z0-9_]+\b|\b\w+::\w+(?:::\w+)*\b|\b[A-Z][A-Z0-9]{1,}(?:-[A-Z0-9]+)*\b|\b[A-Za-z_]\w*\(\)|\b[A-Za-z]+\d[A-Za-z0-9]*\b|\bC\+\+|\bC#/g;
function extractAnchors(src) {
  const set = new Set();
  for (const m of src.match(TOKEN_RE) ?? []) {
    const t = m.toLowerCase().replace(/^`|`$/g, '');
    if (t.length >= 3) set.add(t);
  }
  return set;
}
function looksMisaligned(src, dst) {
  const anchors = extractAnchors(src);
  if (anchors.size < 2) return false;
  if (!dst) return true;
  const low = dst.toLowerCase();
  return ![...anchors].some(a => low.includes(a));
}

/* ------------------------------ 提示词 ------------------------------ */
const CTX_SNIPPET = 300;
function buildSystemPrompt(settings, context) {
  const glossary = Object.entries(settings.glossary).slice(0, 100).map(([k, v]) => `- ${k} => ${v}`).join('\n');
  const recent = (context?.recent ?? []).slice(-2)
    .map(r => `  原文：${r.src.slice(0, CTX_SNIPPET)}\n  译文：${r.dst.slice(0, CTX_SNIPPET)}`).join('\n');
  const ctxBlock = recent
    ? ['【参考上下文】以下是同一页面里**已经翻译过**的段落，只用于统一术语、人称与指代。',
       '注意：这些不是待翻译对象，不要翻译、不要在输出里复述，也不要计入输出数组。',
       '输出数组只与本批输入的 JSON 数组一一对应。',
       `紧邻的前文（原文 → 译文）：\n${recent}`].join('\n')
    : '';
  return [
    `你是专业的网页翻译引擎。把用户发来的 JSON 字符串数组里的每一条${settings.targetLang === '中文' ? '翻成简体中文' : `翻成${settings.targetLang}`}。`,
    '严格规则：1) 只输出一个 JSON 字符串数组，长度必须与输入一致，顺序一一对应；2) 不要解释、不要 markdown 代码块；3) 保留专有名词、代码、URL、数字格式；4) 语气自然，符合网页阅读习惯。',
    '占位符规则：输入里若含 {{0}} {{1}} 这类标记，必须原样复制、不得改写/增删/换序号；输入不含这类标记时，输出中也绝不能出现它们。',
    glossary ? `术语表（必须遵守）：\n${glossary}` : '',
    settings.customPrompt ? `用户附加要求：${settings.customPrompt}` : '',
    ctxBlock
  ].filter(Boolean).join('\n');
}

/* ------------------------------ 响应解析 ------------------------------ */
function parseJsonArray(text) {
  const t = text.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
  const candidates = [t];
  const start = t.indexOf('['), end = t.lastIndexOf(']');
  if (start >= 0 && end > start) candidates.push(t.slice(start, end + 1));
  for (const c of candidates) {
    try {
      const v = JSON.parse(c);
      if (Array.isArray(v) && v.every(x => typeof x === 'string')) return v;
      if (v && typeof v === 'object') {
        for (const val of Object.values(v)) if (Array.isArray(val) && val.every(x => typeof x === 'string')) return val;
      }
    } catch {}
  }
  return null;
}
function alignResults(raw, inputs) {
  const n = inputs.length;
  const arr = parseJsonArray(raw);
  if (arr) {
    if (arr.length !== n) return { texts: null, got: arr.length, error: `接口返回条数与原文不一致（期望 ${n} 条，实际 ${arr.length} 条），已丢弃本批结果以避免译文错位` };
    const empty = arr.map((t, i) => (t.trim() ? -1 : i)).filter(i => i >= 0 && inputs[i].trim());
    if (empty.length) return { texts: null, got: arr.length, error: `第 ${empty.map(i => i + 1).join('、')} 条译文为空，批次已串位，已丢弃本批结果` };
    return { texts: arr, got: arr.length };
  }
  if (n === 1) {
    const t = raw.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').replace(/^["'“”]|["'“”]$/g, '').trim();
    return t ? { texts: [t], got: 1 } : { texts: null, got: 0, error: '模型返回空内容' };
  }
  const lines = raw.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').split('\n')
    .map(l => l.replace(/^\s*\d+[.、)]\s*/, '').trim()).filter(Boolean);
  return lines.length === n
    ? { texts: lines, got: lines.length }
    : { texts: null, got: lines.length, error: `接口返回无法解析为长度 ${n} 的译文数组（实际 ${lines.length} 行），已丢弃本批结果以避免译文错位` };
}

/* ------------------------------ 通道与请求 ------------------------------ */
function joinUrl(base, path) {
  const b = base.trim().replace(/\/+$/, '');
  if (b.endsWith('/chat/completions')) return path === 'chat/completions' ? b : `${b.slice(0, -17)}/${path}`;
  return `${b}/${path}`;
}
function hostOf(u) { try { return new URL(u).host; } catch { return u; } }

async function callProvider(provider, systemPrompt, userPayload, signal) {
  const started = Date.now();
  const host = hostOf(provider.endpoint);
  logDebug('provider', `请求 → [${provider.label}] ${host} model=${provider.model} user=${userPayload.length} 字符（超时 ${Math.round(provider.timeoutMs / 1000)}s）`);
  const res = await fetch(joinUrl(provider.endpoint, 'chat/completions'), {
    method: 'POST',
    signal: AbortSignal.any([signal, AbortSignal.timeout(provider.timeoutMs)]),
    headers: { 'Content-Type': 'application/json', ...(provider.apiKey ? { Authorization: `Bearer ${provider.apiKey}` } : {}) },
    body: JSON.stringify({
      model: provider.model, temperature: 0.2, stream: false,
      messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: userPayload }]
    })
  });
  const ms = Date.now() - started;
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    logWarn('provider', `响应 ← [${provider.label}] HTTP ${res.status} · ${ms}ms`, body.slice(0, 300));
    throw Object.assign(new Error(`HTTP ${res.status} ${body.slice(0, 200)}`), { status: res.status });
  }
  const json = await res.json();
  const usage = json.usage ? ` · tokens ${json.usage.prompt_tokens ?? '?'}/${json.usage.completion_tokens ?? '?'}` : '';
  logDebug('provider', `响应 ← [${provider.label}] HTTP ${res.status} · ${ms}ms${usage}`);
  const content = json.choices?.[0]?.message?.content;
  if (!content) throw new Error(`接口返回异常：响应里没有 choices[0].message.content（model=${provider.model}）`);
  return content;
}

function localReady(l) { return l.enabled && !!l.baseUrl.trim() && !!l.model.trim(); }

function buildChannels(settings) {
  const list = [];
  const l = settings.local;
  if (localReady(l)) {
    list.push({ channel: 'local', label: `本地模型 ${l.model}`, endpoint: l.baseUrl, apiKey: l.apiKey ?? '', model: l.model, timeoutMs: Math.max(10000, l.timeoutMs || 120000) });
    if (!l.fallback) return list;
  } else if (l.enabled) {
    logWarn('provider', '本地模型已启用但配置不完整（Base URL / 模型名），已跳过', JSON.stringify(l));
  }
  if (settings.useFreeChannel) {
    const models = [settings.freeModel, ...FREE_MODELS.filter(m => m !== settings.freeModel)];
    for (const m of models) list.push({ channel: 'free', label: `免费通道 ${m}`, endpoint: settings.freeEndpoint, apiKey: '', model: m, timeoutMs: 30000 });
  }
  if (settings.byok.apiKey && (!list.length || settings.autoFallbackByok))
    list.push({ channel: 'byok', label: `BYOK ${settings.byok.model}`, endpoint: settings.byok.baseUrl, apiKey: settings.byok.apiKey, model: settings.byok.model, timeoutMs: 45000 });
  return list;
}

async function translateOneByOne(provider, systemPrompt, texts, signal) {
  const out = [];
  for (let i = 0; i < texts.length; i++) {
    const r = alignResults(await callProvider(provider, systemPrompt, JSON.stringify([texts[i]]), signal), [texts[i]]);
    if (!r.texts) return { ok: false, error: `第 ${i + 1} 条逐条翻译失败：${r.error ?? '无法解析'}` };
    out.push(r.texts[0]);
  }
  logDebug('provider', `[${provider.label}] 逐条兜底完成 ${texts.length} 条`);
  return { ok: true, texts: out };
}

async function translateViaProvider(provider, systemPrompt, texts, signal) {
  try {
    const raw = await callProvider(provider, systemPrompt, JSON.stringify(texts), signal);
    const aligned = alignResults(raw, texts);
    if (aligned.texts) return { ok: true, texts: aligned.texts };
    logWarn('provider', `[${provider.label}] 批次对齐失败（${aligned.error}）`, `model=${provider.model}\n原始返回：${raw.slice(0, 500)}`);
    if (texts.length > 1 && texts.length <= 8) {
      logDebug('provider', `[${provider.label}] 改为逐条翻译以纠正对齐`);
      return await translateOneByOne(provider, systemPrompt, texts, signal);
    }
    return { ok: false, error: aligned.error ?? '批次对齐失败', alignmentFailed: true };
  } catch (err) {
    let msg = errorMessage(err, provider.timeoutMs);
    if (provider.channel === 'local' && msg.includes('超时'))
      msg += '；本地模型首次推理需加载权重，可在设置里调大超时或改用更小的模型';
    logError('provider', `${provider.label} 请求失败`, `${err.name}: ${err.message}\nendpoint=${provider.endpoint} model=${provider.model}`);
    return { ok: false, error: msg, freeChannelDown: provider.channel === 'free' };
  }
}

async function translateWithFallback(settings, texts, context, signal) {
  const channels = buildChannels(settings);
  if (!channels.length) return { ok: false, error: '没有可用的翻译通道：请启用本地模型、免费通道，或填写 BYOK 的 API Key' };
  const systemPrompt = buildSystemPrompt(settings, context);
  const errors = [];
  let freeDown = false;
  for (let i = 0; i < channels.length; i++) {
    const ch = channels[i];
    if (channels.length > 1) logDebug('provider', `通道尝试 ${i + 1}/${channels.length}：${ch.label}`);
    const r = await translateViaProvider(ch, systemPrompt, texts, signal);
    if (r.ok) return r;
    errors.push(`${ch.label}：${r.error ?? '未知错误'}`);
    if (r.freeChannelDown) freeDown = true;
  }
  logError('provider', `全部通道均失败（共 ${errors.length} 个）`, errors.join('\n'));
  return { ok: false, error: errors.join('；').slice(0, 300), freeChannelDown: freeDown && !settings.byok.apiKey };
}

/* ------------------------------ 通道自检 / 模型列表 ------------------------------ */
function channelFor(settings, which) {
  if (which === 'local') {
    const l = settings.local;
    if (!l.baseUrl.trim() || !l.model.trim()) return null;
    return { channel: 'local', label: `本地模型 ${l.model}`, endpoint: l.baseUrl, apiKey: l.apiKey ?? '', model: l.model, timeoutMs: Math.max(10000, l.timeoutMs || 120000) };
  }
  if (which === 'free')
    return { channel: 'free', label: `免费通道 ${settings.freeModel}`, endpoint: settings.freeEndpoint, apiKey: '', model: settings.freeModel, timeoutMs: 30000 };
  return settings.byok.apiKey
    ? { channel: 'byok', label: `BYOK ${settings.byok.model}`, endpoint: settings.byok.baseUrl, apiKey: settings.byok.apiKey, model: settings.byok.model, timeoutMs: 45000 }
    : null;
}

async function testProvider(settings, which) {
  const ch = channelFor(settings, which);
  if (!ch) return { ok: false, error: '该通道配置不完整（缺少端点 / 模型名 / API Key）' };
  const prompt = buildSystemPrompt(settings);
  const sample = 'Hello world, this is a connection test.';
  const started = Date.now();
  try {
    const raw = await callProvider(ch, prompt, JSON.stringify([sample]), new AbortController().signal);
    const aligned = alignResults(raw, [sample]);
    return { ok: true, ms: Date.now() - started, model: ch.model, endpoint: ch.endpoint, sample: aligned.texts?.[0] || raw.slice(0, 80) };
  } catch (e) {
    return { ok: false, ms: Date.now() - started, model: ch.model, endpoint: ch.endpoint, error: errorMessage(e, ch.timeoutMs) };
  }
}

async function listModels(baseUrl, apiKey) {
  if (!baseUrl.trim()) throw new Error('Base URL 为空');
  const res = await fetch(joinUrl(baseUrl, 'models'), {
    method: 'GET',
    signal: AbortSignal.timeout(15000),
    headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : {}
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json();
  const ids = json.data?.map(m => m.id).filter(Boolean);
  return ids?.length ? ids.sort() : (json.models?.map(m => m.name).filter(Boolean) ?? []).sort();
}

/* ------------------------------ 缓存与批量翻译 ------------------------------ */
const CACHE_KEY = 'bt-cache-v2';
const LEGACY_CACHE_KEYS = ['bt-cache'];
const CACHE_CAP = 2000;
const CONCURRENCY_CLOUD = 2;
const CONCURRENCY_LOCAL = 1;

const cache = new Map();
let cacheLoaded = false;
let running = 0;
let maxRunning = CONCURRENCY_CLOUD;
const waitQueue = [];

async function acquireSlot() { if (running < maxRunning) { running++; return; } await new Promise(r => waitQueue.push(r)); running++; }
function releaseSlot() { running--; const next = waitQueue.shift(); if (next) next(); }

async function loadCache() {
  if (cacheLoaded) return;
  await chrome.storage.local.remove(LEGACY_CACHE_KEYS).catch(() => {});
  const raw = (await chrome.storage.local.get(CACHE_KEY))[CACHE_KEY];
  if (raw) for (const [k, v] of Object.entries(raw)) cache.set(k, v);
  cacheLoaded = true;
}
async function persistCache() {
  if (cache.size > CACHE_CAP) {
    let n = cache.size - CACHE_CAP, i = 0;
    for (const k of cache.keys()) { if (i++ >= n) break; cache.delete(k); }
  }
  await chrome.storage.local.set({ [CACHE_KEY]: Object.fromEntries(cache) });
}

async function translateBatch(items, context, langOverride) {
  await loadCache();
  let settings = await getSettings();
  if (langOverride?.target && langOverride.target !== settings.targetLang)
    settings = { ...settings, targetLang: langOverride.target };

  const texts = items.map(it => it.text);
  const chanTag = settings.local.enabled ? `local:${settings.local.model}` : `${settings.freeModel}|${settings.byok.model}`;
  const keys = texts.map(t => `${hashStr(t)}|${settings.targetLang}|${chanTag}`);
  const missing = [];
  keys.forEach((k, i) => {
    const hit = cache.get(k);
    if (hit === undefined) missing.push({ idx: i, text: texts[i] });
    else if (looksMisaligned(texts[i], hit)) {
      logWarn('translate', '缓存条目疑似错位译文，已弃用（原文锚点未出现在译文中）', texts[i].slice(0, 80));
      cache.delete(k);
      missing.push({ idx: i, text: texts[i] });
    }
  });
  const results = texts.map((_, i) => cache.get(keys[i]) ?? '');

  if (missing.length === 0) {
    logDebug('translate', `全部命中缓存（${texts.length} 条，零 token）`);
  } else {
    logDebug('translate', `批量请求：共 ${texts.length} 条，缓存命中 ${texts.length - missing.length} 条，待翻 ${missing.length} 条（通道 ${chanTag}）`);
    maxRunning = settings.local.enabled ? CONCURRENCY_LOCAL : CONCURRENCY_CLOUD;
    await acquireSlot();
    const started = Date.now();
    try {
      let r = await translateWithFallback(settings, missing.map(m => m.text), context, new AbortController().signal);
      const retryTimes = settings.local.enabled ? 1 : 2;
      for (let i = 0; i < retryTimes && !r.ok && /HTTP (429|5\d\d)/.test(r.error ?? ''); i++) {
        await new Promise(res => setTimeout(res, 800 * 2 ** i));
        logDebug('translate', `第 ${i + 1} 次重试（指数退避后）`);
        r = await translateWithFallback(settings, missing.map(m => m.text), context, new AbortController().signal);
      }
      if (!r.ok || !r.texts) {
        logError('translate', `批量翻译失败（耗时 ${Date.now() - started}ms）`, r.error);
        return { ok: false, error: r.error, notice: r.freeChannelDown ? { kind: 'free-down', message: '免费通道暂不可用，可配置自己的 API Key (BYOK) 继续翻译' } : undefined };
      }
      logInfo('translate', `批量完成 ${missing.length} 条 · 耗时 ${Date.now() - started}ms`);
      const suspect = [];
      missing.forEach((m, i) => {
        const t = r.texts[i];
        if (!t) return;
        if (looksMisaligned(m.text, t)) suspect.push(m);
        else { results[m.idx] = t; cache.set(keys[m.idx], t); }
      });
      if (suspect.length) {
        logWarn('translate', `${suspect.length} 条疑似整批错位，改为逐条重译`, suspect.map(m => texts[m.idx]?.slice(0, 40)).join('\n'));
        for (const m of suspect) {
          const single = await translateWithFallback(settings, [m.text], context, new AbortController().signal);
          const t = single.ok ? single.texts?.[0] : '';
          if (t) { results[m.idx] = t; cache.set(keys[m.idx], t); }
        }
      }
      await persistCache();
    } finally {
      releaseSlot();
    }
  }
  return { ok: true, results: items.map((it, i) => ({ id: it.id, text: results[i] ?? '' })) };
}

/* ------------------------------ 页面注入 ------------------------------ */
const INJECTOR_FILE = '/injector.js';
async function injectContent(tabId) {
  try {
    await chrome.scripting.executeScript({ target: { tabId }, files: [INJECTOR_FILE] });
  } catch (e) {
    logError('background', `content script 注入失败 (tab=${tabId})`, errorMessage(e));
    throw e;
  }
}

/* ------------------------------ 消息与事件 ------------------------------ */
chrome.action.onClicked.addListener((tab) => {
  if (!tab.id) return;
  const tabId = tab.id;
  injectContent(tabId)
    .then(() => chrome.tabs.sendMessage(tabId, { type: 'TOGGLE_PAGE_TRANSLATE' })
      .catch(e => logWarn('background', '图标点击：TOGGLE 指令未送达页面', String(e))))
    .catch(() => {});
});

chrome.commands.onCommand.addListener(async (command) => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) return;
  try {
    await injectContent(tab.id);
    const type = command === 'toggle-page-translate' ? 'TOGGLE_PAGE_TRANSLATE' : 'CYCLE_DISPLAY_MODE';
    await chrome.tabs.sendMessage(tab.id, { type });
  } catch (e) {
    logWarn('background', `快捷键 ${command} 执行失败`, errorMessage(e));
  }
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  (async () => {
    try {
      switch (msg.type) {
        case 'TRANSLATE_BATCH': {
          const r = await translateBatch(msg.items, msg.context, msg.lang);
          if (r?.ok && msg.saveHistory) {
            let st = await getSettings();
            const to = msg.lang?.target ?? st.targetLang;
            await addHistory(msg.items, r.results, msg.lang, to);
          }
          sendResponse(r);
          break;
        }
        case 'GET_SETTINGS': sendResponse({ settings: await getSettings() }); break;
        case 'SET_DISPLAY_MODE': await saveSettings({ displayMode: msg.mode }); sendResponse({ settings: await getSettings() }); break;
        case 'SAVE_SETTINGS': await saveSettings(msg.settings); log('info', 'popup', '设置已保存'); sendResponse({ settings: await getSettings() }); break;
        case 'SET_THEME': await saveSettings({ theme: msg.theme }); sendResponse({ settings: await getSettings() }); break;
        case 'GET_HISTORY': sendResponse({ history: await getHistory() }); break;
        case 'REMOVE_HISTORY': await removeHistory(msg.id); sendResponse({ ok: true, history: await getHistory() }); break;
        case 'CLEAR_HISTORY': await clearHistory(); log('info', 'popup', '历史记录已清空'); sendResponse({ ok: true }); break;
        case 'OPEN_OPTIONS': await chrome.tabs.create({ url: chrome.runtime.getURL('/popup.html') }); sendResponse({ ok: true }); break;
        case 'OPEN_SIDEPANEL': {
          try {
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            const windowId = tab?.windowId ?? sender.tab?.windowId;
            if (windowId == null) { sendResponse({ ok: false, error: 'no active window' }); break; }
            await chrome.sidePanel.open({ windowId });
            sendResponse({ ok: true });
          } catch (e) {
            sendResponse({ ok: false, error: errorMessage(e) });
          }
          break;
        }
        case 'TOGGLE_PAGE_TRANSLATE': {
          const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
          if (!tab?.id) { logWarn('background', 'TOGGLE 失败：找不到活动标签页'); sendResponse({ ok: false, error: 'no active tab' }); break; }
          log('info', 'background', `TOGGLE_PAGE_TRANSLATE: tab=${tab.id} url=${tab.url?.slice(0, 100)}`);
          try {
            await injectContent(tab.id);
            await chrome.tabs.sendMessage(tab.id, { type: 'TOGGLE_PAGE_TRANSLATE' });
          } catch (e) {
            logError('background', 'TOGGLE 指令发送失败（content 未响应）', errorMessage(e));
            sendResponse({ ok: false, error: '页面未响应翻译指令，请刷新页面后重试' });
            break;
          }
          sendResponse({ ok: true });
          break;
        }
        case 'TEST_PROVIDER': {
          const st = await getSettings();
          log('info', 'background', `通道自检：${msg.which}`);
          sendResponse(await testProvider(st, msg.which));
          break;
        }
        case 'LIST_MODELS': {
          try {
            const models = await listModels(msg.baseUrl, msg.apiKey);
            log('info', 'background', `拉取模型列表成功：${models.length} 个`, models.slice(0, 20).join(', '));
            sendResponse({ ok: true, models });
          } catch (e) {
            const err = errorMessage(e);
            logError('background', '拉取模型列表失败', `${err}\nbaseUrl=${msg.baseUrl}`);
            sendResponse({ ok: false, error: err, models: [] });
          }
          break;
        }
        case 'LOG': pushLog(msg.entry); sendResponse({ ok: true }); break;
        case 'GET_LOGS': sendResponse({ logs: await getLogs() }); break;
        case 'CLEAR_LOGS': await clearLogs(); logWarn('background', '日志已清空（用户操作）'); sendResponse({ ok: true }); break;
        default: sendResponse({ ok: false, error: 'unknown message' });
      }
    } catch (e) {
      logError('background', `消息处理异常: ${msg?.type}`, e?.stack ?? errorMessage(e));
      sendResponse({ ok: false, error: `内部错误：${errorMessage(e)}` });
    }
  })();
  return true;
});
