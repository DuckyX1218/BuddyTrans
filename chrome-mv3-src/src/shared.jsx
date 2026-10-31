/* ============================================================================
 * 译伴 BuddyTrans — 共享设计系统与业务组件（Popup / SidePanel 复用）
 * 设计基调：现代极简 · 灰黑白单色 · 圆润克制
 * ==========================================================================*/
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';

/* ------------------------------ 工具 ------------------------------ */
const cx = (...args) => args.filter(Boolean).join(' ');
const api = (msg) => chrome.runtime.sendMessage(msg);

const LANGS = [
  { value: 'auto', label: '自动检测' },
  { value: '中文', label: '中文' },
  { value: 'English', label: 'English' },
  { value: '日本語', label: '日本語' },
  { value: '한국어', label: '한국어' },
  { value: 'Français', label: 'Français' },
  { value: 'Deutsch', label: 'Deutsch' },
  { value: 'Español', label: 'Español' },
  { value: 'Русский', label: 'Русский' }
];
const TARGET_LANGS = LANGS.filter(l => l.value !== 'auto');
const langLabel = (v) => (LANGS.find(l => l.value === v)?.label ?? v);

function originPattern(url) {
  try {
    const u = new URL(url);
    return /^https?:$/.test(u.protocol) ? `${u.protocol}//${u.hostname}/*` : null;
  } catch { return null; }
}

function formatTime(ts) {
  const d = new Date(ts);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  const hm = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  if (sameDay) return hm;
  return `${d.getMonth() + 1}/${d.getDate()} ${hm}`;
}

/* ------------------------------ 线性单色图标 ------------------------------ */
const I = ({ children, size = 16, className, sw = 1.8 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
    {children}
  </svg>
);
export const IconTranslate = (p) => (
  <I {...p}><path d="M4 5h9M8.5 3v2c0 4-2.5 7.5-5.5 9M6 9.5c1.5 2 4 4.5 7 5.5" /><path d="M12.5 21l4.5-10 4.5 10M14.2 17.5h5.6" /></I>
);
export const IconSettings = (p) => (
  <I {...p}><circle cx="12" cy="12" r="3.2" /><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1.03 1.56V21a2 2 0 1 1-4 0v-.09a1.7 1.7 0 0 0-1.11-1.56 1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.7 1.7 0 0 0 .34-1.87 1.7 1.7 0 0 0-1.56-1.03H3a2 2 0 1 1 0-4h.09a1.7 1.7 0 0 0 1.56-1.11 1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.7 1.7 0 0 0 1.87.34H9a1.7 1.7 0 0 0 1.03-1.56V3a2 2 0 1 1 4 0v.09a1.7 1.7 0 0 0 1.03 1.56 1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.7 1.7 0 0 0-.34 1.87V9c.24.6.86 1.03 1.56 1.03H21a2 2 0 1 1 0 4h-.09a1.7 1.7 0 0 0-1.51.97Z" /></I>
);
export const IconHistory = (p) => (
  <I {...p}><path d="M3 12a9 9 0 1 0 2.64-6.36L3 8" /><path d="M3 3v5h5" /><path d="M12 7v5l3.5 2" /></I>
);
export const IconSwap = (p) => (
  <I {...p}><path d="M7 16V4M7 4 3 8M7 4l4 4" /><path d="M17 8v12m0 0 4-4m-4 4-4-4" /></I>
);
export const IconCopy = (p) => (
  <I {...p}><rect x="9" y="9" width="12" height="12" rx="2.5" /><path d="M5 15V5a2 2 0 0 1 2-2h10" /></I>
);
export const IconCheck = (p) => <I {...p}><path d="M20 6 9 17l-5-5" /></I>;
export const IconClose = (p) => <I {...p}><path d="M18 6 6 18M6 6l12 12" /></I>;
export const IconAlert = (p) => (
  <I {...p}><circle cx="12" cy="12" r="9" /><path d="M12 8v5M12 16.5v.01" /></I>
);
export const IconSun = (p) => (
  <I {...p}><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></I>
);
export const IconMoon = (p) => <I {...p}><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z" /></I>;
export const IconMonitor = (p) => (
  <I {...p}><rect x="2" y="4" width="20" height="14" rx="2.5" /><path d="M8 22h8M12 18v4" /></I>
);
export const IconPanel = (p) => (
  <I {...p}><rect x="3" y="4" width="18" height="16" rx="2.5" /><path d="M15 4v16" /></I>
);
export const IconRefresh = (p) => (
  <I {...p}><path d="M21 12a9 9 0 1 1-2.64-6.36L21 8" /><path d="M21 3v5h-5" /></I>
);
export const IconTrash = (p) => (
  <I {...p}><path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" /></I>
);
export const IconBack = (p) => <I {...p}><path d="M19 12H5M11 18l-6-6 6-6" /></I>;
export const IconSparkle = (p) => (
  <I {...p}><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1" /></I>
);
export const IconLog = (p) => (
  <I {...p}><path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9Z" /><path d="M14 3v6h6M9 13h6M9 17h4" /></I>
);
export const IconChevron = (p) => <I {...p} sw={2}><path d="m6 9 6 6 6-6" /></I>;
export const IconGlobe = (p) => (
  <I {...p}><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3c2.5 2.6 3.9 5.7 3.9 9S14.5 18.4 12 21c-2.5-2.6-3.9-5.7-3.9-9S9.5 5.6 12 3Z" /></I>
);

/* ------------------------------ 基础组件 ------------------------------ */
export function Card({ className, children, ...rest }) {
  return (
    <div className={cx('bg-card dark:bg-dcard border border-line dark:border-dline rounded-card shadow-card', className)} {...rest}>
      {children}
    </div>
  );
}

export function Button({ variant = 'primary', className, children, ...rest }) {
  const base = 'inline-flex items-center justify-center gap-2 rounded-ctl font-semibold text-body transition-colors select-none disabled:cursor-not-allowed';
  const styles = {
    primary: 'h-10 px-4 bg-ink text-white hover:bg-btnhov disabled:bg-disabled disabled:text-white dark:bg-dink dark:text-[#111111] dark:hover:bg-white dark:disabled:bg-[#3A3A3A] dark:disabled:text-dweak',
    ghost: 'h-9 px-3 border border-line dark:border-dline text-ink dark:text-dink hover:bg-fill dark:hover:bg-dfill disabled:text-weak dark:disabled:text-dweak disabled:hover:bg-transparent',
    quiet: 'h-9 px-3 text-sub dark:text-dsub hover:text-ink dark:hover:text-dink hover:bg-fill dark:hover:bg-dfill'
  };
  return <button type="button" className={cx(base, styles[variant], className)} {...rest}>{children}</button>;
}

export function IconButton({ label, className, children, ...rest }) {
  return (
    <button type="button" aria-label={label} title={label}
      className={cx('w-9 h-9 inline-flex items-center justify-center rounded-sm2 text-sub dark:text-dsub hover:text-ink dark:hover:text-dink hover:bg-fill dark:hover:bg-dfill transition-colors disabled:opacity-40', className)}
      {...rest}>
      {children}
    </button>
  );
}

export function Select({ value, onChange, options, className, ariaLabel }) {
  return (
    <div className={cx('relative', className)}>
      <select value={value} onChange={(e) => onChange(e.target.value)} aria-label={ariaLabel}
        className="w-full h-9 appearance-none bg-transparent border border-line dark:border-dline rounded-sm2 pl-3 pr-8 text-[13px] font-medium text-ink dark:text-dink hover:border-weak dark:hover:border-dweak focus:border-ink dark:focus:border-dink outline-none transition-colors cursor-pointer">
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      <IconChevron size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none text-weak dark:text-dweak" />
    </div>
  );
}

export function TextInput({ label, className, ...rest }) {
  return (
    <label className={cx('block', className)}>
      {label && <span className="block mb-1.5 text-small text-sub dark:text-dsub">{label}</span>}
      <input
        className="w-full h-9 bg-card dark:bg-dcard border border-line dark:border-dline rounded-sm2 px-3 text-body text-ink dark:text-dink placeholder:text-weak dark:placeholder:text-dweak focus:border-ink dark:focus:border-dink outline-none transition-colors"
        {...rest} />
    </label>
  );
}

export function Toggle({ checked, onChange, label, hint }) {
  return (
    <div className="flex items-start gap-3">
      <button type="button" role="switch" aria-checked={checked} aria-label={label}
        onClick={() => onChange(!checked)}
        className={cx('mt-0.5 flex-none w-9 h-5 rounded-full p-0.5 transition-colors',
          checked ? 'bg-ink dark:bg-dink' : 'bg-disabled dark:bg-[#3A3A3A]')}>
        <span className={cx('block w-4 h-4 rounded-full bg-white dark:bg-[#111111] transition-transform', checked && 'translate-x-4')} />
      </button>
      <div className="min-w-0">
        <span className="block text-body text-ink dark:text-dink leading-snug">{label}</span>
        {hint && <span className="block mt-0.5 text-small text-weak dark:text-dweak">{hint}</span>}
      </div>
    </div>
  );
}

export function Segmented({ value, onChange, options, ariaLabel }) {
  return (
    <div role="radiogroup" aria-label={ariaLabel}
      className="inline-flex p-1 gap-1 rounded-ctl border border-line dark:border-dline bg-fill dark:bg-dfill">
      {options.map(o => (
        <button key={o.value} type="button" role="radio" aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={cx('h-7 px-3 rounded-[8px] text-small font-medium transition-colors',
            value === o.value
              ? 'bg-card dark:bg-dcard text-ink dark:text-dink shadow-card'
              : 'text-sub dark:text-dsub hover:text-ink dark:hover:text-dink')}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Section({ title, children, className }) {
  return (
    <Card className={cx('p-4', className)}>
      <h3 className="m-0 mb-3 text-title font-semibold text-ink dark:text-dink">{title}</h3>
      <div className="grid gap-3">{children}</div>
    </Card>
  );
}

export function ErrorBox({ message, onRetry, className }) {
  return (
    <div role="alert" className={cx('flex items-start gap-2.5 p-3 rounded-ctl border border-line dark:border-dline bg-fill dark:bg-dfill', className)}>
      <IconAlert size={16} className="flex-none mt-0.5 text-ink dark:text-dink" />
      <div className="min-w-0 flex-1">
        <p className="m-0 text-small font-medium text-ink dark:text-dink whitespace-pre-wrap break-words">{message}</p>
        {onRetry && (
          <button type="button" onClick={onRetry}
            className="mt-1.5 text-small font-semibold text-ink dark:text-dink underline underline-offset-4 hover:opacity-70 transition-opacity">
            重试
          </button>
        )}
      </div>
    </div>
  );
}

export function Skeleton({ lines = 3 }) {
  return (
    <div className="grid gap-2.5 py-1" aria-label="翻译中" aria-busy="true">
      {Array.from({ length: lines }).map((_, i) => (
        <div key={i} className="bt-skel h-3 rounded-md bg-fill dark:bg-dfill"
          style={{ width: `${[100, 84, 58, 92, 70][i % 5]}%` }} />
      ))}
    </div>
  );
}

export function LangTag({ children }) {
  return (
    <span className="inline-flex items-center h-6 px-2 rounded-md border border-line dark:border-dline text-small font-medium text-sub dark:text-dsub">
      {children}
    </span>
  );
}

/* ------------------------------ 主题 ------------------------------ */
export function useTheme(settings) {
  useEffect(() => {
    const theme = settings?.theme ?? 'system';
    const apply = () => {
      const dark = theme === 'dark' ||
        (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
      document.documentElement.classList.toggle('dark', dark);
    };
    apply();
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, [settings?.theme]);
}

export function cycleTheme(theme) {
  return theme === 'system' ? 'light' : theme === 'light' ? 'dark' : 'system';
}
export function themeIcon(theme) {
  if (theme === 'light') return <IconSun size={16} />;
  if (theme === 'dark') return <IconMoon size={16} />;
  return <IconMonitor size={16} />;
}
export function themeLabel(theme) {
  return theme === 'light' ? '浅色' : theme === 'dark' ? '深色' : '跟随系统';
}

/* ------------------------------ 主翻译视图 ------------------------------ */
export function MainView({ settings, onNavigate, isPopup, onFillFromHistory, fillRequest, onConsumeFill }) {
  const [input, setInput] = useState('');
  const [output, setOutput] = useState('');
  const [status, setStatus] = useState('idle'); // idle | loading | success | error
  const [errorMsg, setErrorMsg] = useState('');
  const [sourceLang, setSourceLang] = useState(settings?.sourceLang ?? 'auto');
  const [targetLang, setTargetLang] = useState(settings?.targetLang ?? '中文');
  const [copied, setCopied] = useState(false);
  const [pageMsg, setPageMsg] = useState('');
  const textareaRef = useRef(null);

  useEffect(() => {
    if (fillRequest) {
      setInput(fillRequest.src ?? '');
      if (fillRequest.from && fillRequest.from !== 'auto') setSourceLang(fillRequest.from);
      if (fillRequest.to) setTargetLang(fillRequest.to);
      setOutput(fillRequest.dst ?? '');
      setStatus(fillRequest.dst ? 'success' : 'idle');
      onConsumeFill?.();
      textareaRef.current?.focus();
    }
  }, [fillRequest]); // eslint-disable-line react-hooks/exhaustive-deps

  const canTranslate = input.trim().length > 0 && status !== 'loading';

  const doTranslate = useCallback(async () => {
    const text = input.trim();
    if (!text || status === 'loading') return;
    setStatus('loading');
    setErrorMsg('');
    setCopied(false);
    try {
      const res = await api({
        type: 'TRANSLATE_BATCH',
        items: [{ id: 'panel', text }],
        lang: { source: sourceLang, target: targetLang },
        saveHistory: true
      });
      if (res?.ok) {
        setOutput(res.results?.[0]?.text || '（无译文）');
        setStatus('success');
      } else {
        setErrorMsg(res?.error ?? '未知错误');
        setStatus('error');
      }
    } catch (e) {
      setErrorMsg(`无法连接翻译服务：${e?.message ?? e}`);
      setStatus('error');
    }
  }, [input, sourceLang, targetLang, status]);

  const onKeyDown = (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); doTranslate(); }
  };

  const swapLangs = () => {
    if (sourceLang === 'auto') return;
    const s = sourceLang, t = targetLang;
    setSourceLang(t);
    setTargetLang(s);
    if (output) { setInput(output); setOutput(input); }
  };

  const copyOutput = async () => {
    try {
      await navigator.clipboard.writeText(output);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { /* ignore */ }
  };

  const togglePageTranslate = async () => {
    setPageMsg('');
    try {
      const res = await api({ type: 'TOGGLE_PAGE_TRANSLATE' });
      if (res?.ok) { if (isPopup) window.close(); }
      else setPageMsg(res?.error ?? '页面未响应，请刷新页面后重试');
    } catch {
      setPageMsg('后台服务未响应，请到 chrome://extensions 重载扩展');
    }
  };

  const openSidePanel = async () => {
    try {
      const win = await chrome.windows.getCurrent();
      await chrome.sidePanel.open({ windowId: win.id });
      window.close();
    } catch {
      await api({ type: 'OPEN_SIDEPANEL' });
    }
  };

  return (
    <div className="bt-view grid gap-3">
      {/* 语言栏 */}
      <Card className="flex items-center gap-2 p-2">
        <Select className="flex-1" value={sourceLang} onChange={setSourceLang} options={LANGS} ariaLabel="源语言" />
        <IconButton label="交换语言" onClick={swapLangs} disabled={sourceLang === 'auto'}
          className="flex-none border border-line dark:border-dline rounded-full w-9 h-9 hover:bg-fill dark:hover:bg-dfill">
          <IconSwap size={15} />
        </IconButton>
        <Select className="flex-1" value={targetLang} onChange={setTargetLang} options={TARGET_LANGS} ariaLabel="目标语言" />
      </Card>

      {/* 输入区 */}
      <Card className="p-3">
        <textarea ref={textareaRef} value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={onKeyDown}
          rows={4} maxLength={5000} placeholder="输入要翻译的文本…（Ctrl/⌘ + Enter 翻译）"
          aria-label="待翻译文本"
          className="bt-scroll w-full resize-y min-h-[96px] max-h-[180px] bg-transparent text-body text-ink dark:text-dink placeholder:text-weak dark:placeholder:text-dweak outline-none" />
        <div className="mt-1 flex items-center justify-between">
          <span className="text-small text-weak dark:text-dweak tabular-nums">{input.length} / 5000</span>
          {input && (
            <Button variant="quiet" className="h-7 px-2 text-small" onClick={() => { setInput(''); setStatus('idle'); setOutput(''); textareaRef.current?.focus(); }}>
              清空
            </Button>
          )}
        </div>
      </Card>

      {/* 唯一主操作 */}
      <Button variant="primary" className="w-full" disabled={!canTranslate} onClick={doTranslate}
        aria-label="翻译">
        {status === 'loading' ? (
          <>
            <span className="w-3.5 h-3.5 rounded-full border-2 border-white/40 border-t-white dark:border-black/30 dark:border-t-[#111111] animate-spin" />
            翻译中…
          </>
        ) : (
          <><IconTranslate size={16} />翻译</>
        )}
      </Button>

      {/* 结果区 */}
      {status === 'idle' && (
        <Card className="p-6 flex flex-col items-center gap-2 text-center">
          <IconSparkle size={22} className="text-weak dark:text-dweak" />
          <p className="m-0 text-small text-weak dark:text-dweak">输入文本，即刻翻译</p>
        </Card>
      )}
      {status === 'loading' && <Card className="p-4"><Skeleton lines={3} /></Card>}
      {status === 'success' && (
        <Card className="p-4">
          <div className="flex items-center justify-between mb-2">
            <LangTag>{langLabel(targetLang)}</LangTag>
            <IconButton label={copied ? '已复制' : '复制译文'} onClick={copyOutput} className="w-8 h-8">
              {copied ? <IconCheck size={15} /> : <IconCopy size={15} />}
            </IconButton>
          </div>
          <p className="m-0 text-body text-ink dark:text-dink whitespace-pre-wrap break-words">{output}</p>
        </Card>
      )}
      {status === 'error' && <ErrorBox message={errorMsg} onRetry={doTranslate} />}

      {/* 整页翻译快捷条 */}
      <Card className="flex items-center gap-2 p-2">
        <Button variant="ghost" className="flex-1 h-9 text-small" onClick={togglePageTranslate}>
          <IconGlobe size={14} />整页翻译
        </Button>
        <Select className="w-[108px] flex-none" value={settings?.displayMode ?? 'bilingual'}
          onChange={(v) => api({ type: 'SET_DISPLAY_MODE', mode: v })}
          options={[{ value: 'bilingual', label: '双语对照' }, { value: 'target', label: '仅译文' }, { value: 'source', label: '仅原文' }]}
          ariaLabel="整页展示模式" />
        {isPopup && (
          <IconButton label="在侧边栏打开" onClick={openSidePanel} className="flex-none border border-line dark:border-dline">
            <IconPanel size={15} />
          </IconButton>
        )}
      </Card>
      {pageMsg && <p className="m-0 px-1 text-small text-sub dark:text-dsub">{pageMsg}</p>}

      {/* 底部入口 */}
      <nav className="flex items-center justify-around pt-1 border-t border-line dark:border-dline" aria-label="更多入口">
        <Button variant="quiet" className="text-small" onClick={() => onNavigate('history')}><IconHistory size={14} />历史记录</Button>
        <Button variant="quiet" className="text-small" onClick={() => onNavigate('settings')}><IconSettings size={14} />设置</Button>
        <Button variant="quiet" className="text-small" onClick={() => onNavigate('logs')}><IconLog size={14} />日志反馈</Button>
      </nav>
    </div>
  );
}

/* ------------------------------ 历史记录视图 ------------------------------ */
export function HistoryView({ onReuse }) {
  const [items, setItems] = useState(null);
  const [copiedId, setCopiedId] = useState(null);

  const load = useCallback(async () => {
    try {
      const res = await api({ type: 'GET_HISTORY' });
      setItems(res?.history ?? []);
    } catch { setItems([]); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const remove = async (id) => {
    const res = await api({ type: 'REMOVE_HISTORY', id });
    if (res?.ok) setItems(res.history ?? []);
  };
  const clearAll = async () => {
    await api({ type: 'CLEAR_HISTORY' });
    setItems([]);
  };
  const copy = async (item) => {
    try {
      await navigator.clipboard.writeText(item.dst);
      setCopiedId(item.id);
      setTimeout(() => setCopiedId(null), 1500);
    } catch { /* ignore */ }
  };

  if (items === null) return <Card className="p-4"><Skeleton lines={4} /></Card>;

  return (
    <div className="bt-view grid gap-3">
      {items.length === 0 ? (
        <Card className="p-8 flex flex-col items-center gap-2 text-center">
          <IconHistory size={22} className="text-weak dark:text-dweak" />
          <p className="m-0 text-small text-weak dark:text-dweak">暂无翻译记录，去翻一句试试吧</p>
        </Card>
      ) : (
        <>
          <div className="flex items-center justify-between px-1">
            <span className="text-small text-weak dark:text-dweak">共 {items.length} 条（保留最近 100 条）</span>
            <Button variant="quiet" className="h-7 px-2 text-small" onClick={clearAll}><IconTrash size={13} />清空</Button>
          </div>
          <div className="grid gap-2">
            {items.map(item => (
              <Card key={item.id} className="p-3 group">
                <div className="flex items-center gap-1.5 mb-1.5">
                  <LangTag>{langLabel(item.from)}</LangTag>
                  <span className="text-weak dark:text-dweak text-small">→</span>
                  <LangTag>{langLabel(item.to)}</LangTag>
                  <span className="ml-auto text-small text-weak dark:text-dweak tabular-nums">{formatTime(item.ts)}</span>
                </div>
                <p className="m-0 text-small text-sub dark:text-dsub line-clamp-2 break-words">{item.src}</p>
                <p className="m-0 mt-1 text-body text-ink dark:text-dink line-clamp-3 break-words">{item.dst}</p>
                <div className="mt-2 flex items-center gap-1 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity">
                  <Button variant="quiet" className="h-7 px-2 text-small" onClick={() => onReuse(item)}>回填翻译</Button>
                  <Button variant="quiet" className="h-7 px-2 text-small" onClick={() => copy(item)}>
                    {copiedId === item.id ? <IconCheck size={13} /> : <IconCopy size={13} />}{copiedId === item.id ? '已复制' : '复制'}
                  </Button>
                  <Button variant="quiet" className="h-7 px-2 text-small ml-auto" onClick={() => remove(item.id)} aria-label="删除该记录">
                    <IconTrash size={13} />
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

/* ------------------------------ 设置视图 ------------------------------ */
export function SettingsView({ settings, setSettings }) {
  const [glossaryText, setGlossaryText] = useState('');
  const [models, setModels] = useState([]);
  const [status, setStatus] = useState('');       // 保存结果
  const [testMsg, setTestMsg] = useState('');
  const [testErr, setTestErr] = useState(false);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (settings) {
      setGlossaryText(Object.entries(settings.glossary ?? {}).map(([k, v]) => `${k}=>${v}`).join('\n'));
    }
  }, [settings?.glossary]); // eslint-disable-line react-hooks/exhaustive-deps

  const patch = (p) => setSettings(s => s && { ...s, ...p });
  const patchLocal = (p) => setSettings(s => s && { ...s, local: { ...s.local, ...p } });
  const patchByok = (p) => setSettings(s => s && { ...s, byok: { ...s.byok, ...p } });

  const save = useCallback(async (draft) => {
    setStatus('');
    const glossary = {};
    for (const line of glossaryText.split('\n')) {
      const m = line.match(/^(.+?)\s*=>\s*(.+)$/);
      if (m) glossary[m[1].trim()] = m[2].trim();
    }
    const next = { ...draft, glossary };
    const origins = [...new Set([next.local.baseUrl, next.freeEndpoint, next.byok.baseUrl].map(originPattern).filter(Boolean))];
    try {
      if (origins.length && !(await chrome.permissions.request({ origins }))) {
        setStatus('未授予接口访问权限，翻译请求会被浏览器拦截。可到 chrome://extensions → 详情 → 扩展权限里重新允许。');
        return false;
      }
    } catch (e) {
      setStatus(`申请端点授权失败：${e.message}（请检查 Base URL 格式）`);
      return false;
    }
    await api({ type: 'SAVE_SETTINGS', settings: next });
    return true;
  }, [glossaryText]);

  const onSave = async () => {
    if (!settings) return;
    if (await save(settings)) {
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    }
  };

  const test = async (which) => {
    if (!settings) return;
    setBusy(true); setTestErr(false); setTestMsg('测试中…');
    try {
      if (!(await save(settings))) { setTestMsg(''); return; }
      const res = await api({ type: 'TEST_PROVIDER', which });
      if (res?.ok) { setTestErr(false); setTestMsg(`✓ 连接成功 · ${res.ms}ms · ${res.model}\n返回：${res.sample}`); }
      else { setTestErr(true); setTestMsg(`✗ 连接失败：${res?.error ?? '未知错误'}`); }
    } catch (e) {
      setTestErr(true); setTestMsg(`✗ 测试异常：${e.message}`);
    } finally { setBusy(false); }
  };

  const fetchModels = async () => {
    if (!settings) return;
    setBusy(true); setTestErr(false); setTestMsg('正在获取模型列表…');
    try {
      const res = await api({ type: 'LIST_MODELS', baseUrl: settings.local.baseUrl, apiKey: settings.local.apiKey });
      if (res?.ok) {
        const list = res.models ?? [];
        setModels(list);
        setTestMsg(list.length ? `✓ 找到 ${list.length} 个模型，已填入下拉框` : '服务可连通，但没有已下载的模型');
        if (list.length && !list.includes(settings.local.model)) patchLocal({ model: list[0] });
      } else {
        setTestErr(true);
        setTestMsg(`✗ 获取失败：${res?.error ?? '未知错误'}（本地服务启动了吗？）`);
      }
    } finally { setBusy(false); }
  };

  const setTheme = async (theme) => {
    patch({ theme });
    await api({ type: 'SET_THEME', theme });
  };

  if (!settings) return <Card className="p-4"><Skeleton lines={4} /></Card>;
  const localOn = settings.local.enabled;

  return (
    <div className="bt-view grid gap-3">
      <Section title="外观">
        <div className="flex items-center justify-between gap-3">
          <div>
            <span className="block text-body text-ink dark:text-dink">主题</span>
            <span className="block text-small text-weak dark:text-dweak">同步作用于划词浮层与面板</span>
          </div>
          <Segmented ariaLabel="主题" value={settings.theme ?? 'system'} onChange={setTheme}
            options={[{ value: 'system', label: '跟随系统' }, { value: 'light', label: '浅色' }, { value: 'dark', label: '深色' }]} />
        </div>
      </Section>

      <Section title="本地大模型（优先使用）">
        <Toggle checked={localOn} onChange={(v) => patchLocal({ enabled: v })} label="启用本地模型" hint="Ollama / LM Studio / vLLM 等 OpenAI 兼容服务" />
        {localOn && (
          <>
            <TextInput label="Base URL" placeholder="http://127.0.0.1:11434/v1" value={settings.local.baseUrl}
              onChange={(e) => patchLocal({ baseUrl: e.target.value })} />
            <div>
              <span className="block mb-1.5 text-small text-sub dark:text-dsub">模型</span>
              <div className="flex gap-2">
                {models.length ? (
                  <Select className="flex-1" value={settings.local.model} onChange={(v) => patchLocal({ model: v })}
                    options={models.map(m => ({ value: m, label: m }))} ariaLabel="本地模型" />
                ) : (
                  <TextInput className="flex-1" placeholder="qwen2.5:7b" value={settings.local.model}
                    onChange={(e) => patchLocal({ model: e.target.value })} />
                )}
                <Button variant="ghost" className="flex-none" onClick={fetchModels} disabled={busy}>获取列表</Button>
              </div>
            </div>
            <TextInput label="API Key（多数本地服务留空）" type="password" value={settings.local.apiKey}
              onChange={(e) => patchLocal({ apiKey: e.target.value })} />
            <div className="grid grid-cols-2 gap-2">
              <TextInput label="单批段数" type="number" min={1} max={20} value={settings.local.batchSize}
                onChange={(e) => patchLocal({ batchSize: Number(e.target.value) || 6 })} />
              <TextInput label="超时（秒）" type="number" min={10} max={600} value={Math.round(settings.local.timeoutMs / 1000)}
                onChange={(e) => patchLocal({ timeoutMs: (Number(e.target.value) || 120) * 1000 })} />
            </div>
            <Toggle checked={settings.local.fallback} onChange={(v) => patchLocal({ fallback: v })}
              label="本地失败时继续尝试免费通道 / BYOK" />
            <Button variant="ghost" onClick={() => test('local')} disabled={busy}>测试本地连接</Button>
            <p className="m-0 text-small text-weak dark:text-dweak">
              Ollama 需先 <code className="px-1 rounded bg-fill dark:bg-dfill">ollama serve</code> 并 <code className="px-1 rounded bg-fill dark:bg-dfill">ollama pull qwen2.5:7b</code>；若报 403/CORS，设置环境变量 <code className="px-1 rounded bg-fill dark:bg-dfill">OLLAMA_ORIGINS=*</code> 后重启服务。
            </p>
          </>
        )}
      </Section>

      <Section title="免费通道">
        <Toggle checked={settings.useFreeChannel} onChange={(v) => patch({ useFreeChannel: v })}
          label="使用免费通道" hint="安装即用，无需 Key" />
        {settings.useFreeChannel && (
          <>
            <div>
              <span className="block mb-1.5 text-small text-sub dark:text-dsub">免费模型</span>
              <Select value={settings.freeModel} onChange={(v) => patch({ freeModel: v })}
                options={['tencent/Hunyuan-MT-7B', 'THUDM/GLM-4-9B-0414', 'Qwen/Qwen3.5-4B'].map(m => ({ value: m, label: m }))}
                ariaLabel="免费模型" />
            </div>
            <TextInput label="免费中继端点" value={settings.freeEndpoint}
              onChange={(e) => patch({ freeEndpoint: e.target.value })} />
            <Button variant="ghost" onClick={() => test('free')} disabled={busy}>测试免费通道</Button>
          </>
        )}
        <Toggle checked={settings.autoFallbackByok} onChange={(v) => patch({ autoFallbackByok: v })}
          label="前序通道都失败后，用 BYOK 兜底（会提示）" />
      </Section>

      <Section title="BYOK（OpenAI 兼容）">
        <TextInput label="Base URL" placeholder="https://api.deepseek.com/v1" value={settings.byok.baseUrl}
          onChange={(e) => patchByok({ baseUrl: e.target.value })} />
        <TextInput label="API Key（仅存本地）" type="password" value={settings.byok.apiKey}
          onChange={(e) => patchByok({ apiKey: e.target.value })} />
        <TextInput label="模型" value={settings.byok.model} onChange={(e) => patchByok({ model: e.target.value })} />
        <Button variant="ghost" onClick={() => test('byok')} disabled={busy}>测试 BYOK</Button>
      </Section>

      <Section title="翻译行为">
        <div className="flex items-center justify-between gap-3">
          <span className="text-body text-ink dark:text-dink">整页展示模式</span>
          <Select className="w-[132px]" value={settings.displayMode}
            onChange={(v) => api({ type: 'SET_DISPLAY_MODE', mode: v }).then((r) => r?.settings && setSettings(r.settings))}
            options={[{ value: 'bilingual', label: '双语对照' }, { value: 'target', label: '仅译文' }, { value: 'source', label: '仅原文' }]}
            ariaLabel="整页展示模式" />
        </div>
        <Toggle checked={settings.useContext} onChange={(v) => patch({ useContext: v })}
          label="上下文记忆（默认关）" hint="把最近 2 段译文作为参考发给模型；小模型可能把参考上下文当成正文一起翻译，术语一致性优先时再开启" />
        <label className="block">
          <span className="block mb-1.5 text-small text-sub dark:text-dsub">术语表（每行：原文=&gt;译文）</span>
          <textarea rows={3} value={glossaryText} onChange={(e) => setGlossaryText(e.target.value)}
            placeholder={'LLM=>大模型\nWXT=>WXT 框架'}
            className="bt-scroll w-full resize-y bg-card dark:bg-dcard border border-line dark:border-dline rounded-sm2 px-3 py-2 text-body text-ink dark:text-dink placeholder:text-weak dark:placeholder:text-dweak focus:border-ink dark:focus:border-dink outline-none transition-colors" />
        </label>
        <label className="block">
          <span className="block mb-1.5 text-small text-sub dark:text-dsub">自定义系统提示词（附加）</span>
          <textarea rows={3} value={settings.customPrompt} onChange={(e) => patch({ customPrompt: e.target.value })}
            className="bt-scroll w-full resize-y bg-card dark:bg-dcard border border-line dark:border-dline rounded-sm2 px-3 py-2 text-body text-ink dark:text-dink placeholder:text-weak dark:placeholder:text-dweak focus:border-ink dark:focus:border-dink outline-none transition-colors" />
        </label>
        <p className="m-0 text-small text-weak dark:text-dweak">通道优先级：本地模型 → 免费通道 → BYOK（任一成功即返回）</p>
      </Section>

      {status && <ErrorBox message={status} />}
      {testMsg && (testErr
        ? <ErrorBox message={testMsg} />
        : <p className="m-0 px-1 text-small font-medium text-ink dark:text-dink whitespace-pre-wrap">{testMsg}</p>)}

      <Button variant="primary" className="w-full" onClick={onSave} disabled={!settings}>
        {saved ? <><IconCheck size={16} />已保存</> : '保存设置'}
      </Button>
    </div>
  );
}

/* ------------------------------ 日志视图 ------------------------------ */
export function LogsView() {
  const [count, setCount] = useState(0);
  const [copied, setCopied] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const res = await api({ type: 'GET_LOGS' });
      setCount(res?.logs?.length ?? 0);
    } catch { /* ignore */ }
  }, []);
  useEffect(() => { refresh(); }, [refresh]);

  const exportLogs = async () => {
    const logs = (await api({ type: 'GET_LOGS' }))?.logs ?? [];
    const blob = new Blob([JSON.stringify(logs, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `buddy-trans-logs-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };
  const copyLogs = async () => {
    const logs = (await api({ type: 'GET_LOGS' }))?.logs ?? [];
    const text = logs.map(l => {
      const t = new Date(l.ts).toLocaleString();
      return `[${t}] [${l.level}] [${l.type}] ${l.message}${l.detail ? `\n  ${l.detail}` : ''}`;
    }).join('\n');
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  const clear = async () => {
    await api({ type: 'CLEAR_LOGS' });
    setCount(0);
  };

  return (
    <div className="bt-view grid gap-3">
      <Section title={`调试日志（${count} 条，最多保留 500 条）`}>
        <div className="grid grid-cols-3 gap-2">
          <Button variant="ghost" onClick={exportLogs}>导出 JSON</Button>
          <Button variant="ghost" onClick={copyLogs}>{copied ? '已复制 ✓' : '复制日志'}</Button>
          <Button variant="ghost" onClick={clear}>清空</Button>
        </div>
        <p className="m-0 text-small text-weak dark:text-dweak">
          记录请求端点、模型、耗时、HTTP 状态与错误堆栈；遇到问题可导出后附在 issue 里反馈。
        </p>
      </Section>
      <Card className="p-4">
        <p className="m-0 text-small text-sub dark:text-dsub">
          快捷键：<span className="font-semibold text-ink dark:text-dink">Alt+T</span> 整页翻译开关 · <span className="font-semibold text-ink dark:text-dink">Alt+M</span> 切换展示模式
        </p>
      </Card>
    </div>
  );
}

/* ------------------------------ 顶栏 ------------------------------ */
export function TopBar({ settings, onOpenSettings, rightExtra }) {
  const theme = settings?.theme ?? 'system';
  return (
    <header className="flex items-center gap-2.5 px-1 pb-3">
      <span className="w-8 h-8 rounded-[10px] bg-ink dark:bg-dink text-white dark:text-[#111111] flex items-center justify-center flex-none">
        <IconTranslate size={16} />
      </span>
      <div className="min-w-0">
        <h1 className="m-0 text-title font-semibold text-ink dark:text-dink leading-tight">译伴</h1>
        <p className="m-0 text-small text-weak dark:text-dweak leading-tight">BuddyTrans</p>
      </div>
      <div className="ml-auto flex items-center gap-1">
        {rightExtra}
        <IconButton label={`主题：${themeLabel(theme)}（点击切换）`} onClick={() => api({ type: 'SET_THEME', theme: cycleTheme(theme) }).then(r => r?.settings && settings?.__apply?.(r.settings))}>
          {themeIcon(theme)}
        </IconButton>
        <IconButton label="设置" onClick={onOpenSettings}><IconSettings size={16} /></IconButton>
      </div>
    </header>
  );
}

/* ------------------------------ 子视图页头 ------------------------------ */
export function SubHeader({ title, onBack }) {
  return (
    <div className="flex items-center gap-1 px-1 pb-3">
      <IconButton label="返回" onClick={onBack}><IconBack size={16} /></IconButton>
      <h2 className="m-0 text-title font-semibold text-ink dark:text-dink">{title}</h2>
    </div>
  );
}

/* ------------------------------ 应用骨架 ------------------------------ */
export function App({ isPopup }) {
  const [settings, setSettings] = useState(null);
  const [view, setView] = useState('main');
  const [fillRequest, setFillRequest] = useState(null);

  useTheme(settings);

  const applySettings = useCallback((s) => setSettings(prev => ({ ...(prev ?? {}), ...s })), []);
  useEffect(() => {
    api({ type: 'GET_SETTINGS' }).then(res => {
      if (res?.settings) applySettings({ ...res.settings, __apply: applySettings });
    }).catch(() => {});
    // 监听存储变化（侧边栏与 Popup 同步）
    const onChanged = (changes, area) => {
      if (area === 'local' && changes['bt-settings']) {
        applySettings({ ...changes['bt-settings'].newValue, __apply: applySettings });
      }
    };
    chrome.storage.onChanged.addListener(onChanged);
    return () => chrome.storage.onChanged.removeListener(onChanged);
  }, [applySettings]);

  if (!settings) {
    return (
      <div className="min-h-screen bg-page dark:bg-dpage p-3 font-rounded">
        <Card className="p-4"><Skeleton lines={5} /></Card>
      </div>
    );
  }

  const goMain = () => setView('main');

  return (
    <div className="min-h-screen bg-page text-ink dark:bg-dpage dark:text-dink font-rounded text-body p-3">
      {view === 'main' && (
        <>
          <TopBar settings={settings} onOpenSettings={() => setView('settings')} />
          <MainView settings={settings} onNavigate={setView} isPopup={isPopup}
            fillRequest={fillRequest} onConsumeFill={() => setFillRequest(null)} />
        </>
      )}
      {view === 'history' && (
        <>
          <SubHeader title="历史记录" onBack={goMain} />
          <HistoryView onReuse={(item) => { setFillRequest(item); setView('main'); }} />
        </>
      )}
      {view === 'settings' && (
        <>
          <SubHeader title="设置" onBack={goMain} />
          <SettingsView settings={settings} setSettings={setSettings} />
        </>
      )}
      {view === 'logs' && (
        <>
          <SubHeader title="日志反馈" onBack={goMain} />
          <LogsView />
        </>
      )}
    </div>
  );
}
