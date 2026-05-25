import React from 'react';
import Icon from './icons';

// ── helpers ──────────────────────────────────────────────────────────
export function formatBytes(n: number): string {
  if (n == null || isNaN(n)) return '—';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

export function formatEta(seconds: number): string {
  if (!isFinite(seconds) || seconds <= 0) return '—';
  if (seconds < 60) return `${Math.ceil(seconds)}초`;
  if (seconds < 3600) return `${Math.ceil(seconds / 60)}분`;
  return `${(seconds / 3600).toFixed(1)}시간`;
}

export function detectKind(file: { type?: string; name?: string }): string {
  const t = (file.type || '').toLowerCase();
  const name = (file.name || '').toLowerCase();
  if (t.startsWith('image/')) return 'image';
  if (t.startsWith('video/')) return 'video';
  if (t.startsWith('audio/')) return 'audio';
  if (t === 'application/pdf' || name.endsWith('.pdf')) return 'pdf';
  if (name.endsWith('.zip') || name.endsWith('.rar') || name.endsWith('.7z') || name.endsWith('.tar') || name.endsWith('.gz')) return 'zip';
  if (t.startsWith('text/') || name.match(/\.(js|ts|jsx|tsx|json|html|css|py|go|rs|java|kt|swift|c|cpp|h|md|sh|yml|yaml|toml|xml)$/)) return 'code';
  return 'file';
}

export function shortExt(name: string): string {
  const m = (name || '').split('.').pop();
  return m && m.length <= 5 ? m.toLowerCase() : '—';
}

export function uid(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-3);
}

// ── types ────────────────────────────────────────────────────────────
export interface UploadItem {
  id: string;
  name: string;
  size: number;
  sent: number;
  kind: string;
  thumbUrl: string | null;
  status: 'queued' | 'uploading' | 'paused' | 'done' | 'error';
  speed: number;
  baseSpeed: number;
  eta: number;
  addedAt: number;
  willFail: boolean;
  error: string | null;
  file?: File;
}

export interface ToastItem {
  id: string;
  text: string;
}

// ── Top bar ──────────────────────────────────────────────────────────
export function TopBar({ used, max }: { used: number; max: number }) {
  const pct = Math.min(100, Math.round((used / max) * 100));
  return (
    <div className="topbar">
      <div className="brand">
        <span className="brand-mark">d</span>
        <span>depot</span>
        <span className="brand-path">uploads</span>
      </div>
      <div className="topbar-spacer" />
      <span className="status-pill" title="서버 연결 상태">
        <span className="dot" />
        <span className="label">connected</span>
      </span>
      <span className="status-pill" title="스토리지 사용량">
        <span style={{ color: pct > 80 ? 'var(--warn)' : 'var(--accent)' }}>●</span>
        <span>{formatBytes(used)} / {formatBytes(max)}</span>
      </span>
    </div>
  );
}

// ── DropZone ─────────────────────────────────────────────────────────
export function DropZone({ onFiles, active, setActive, password, setPassword }: {
  onFiles: (files: File[]) => void;
  active: boolean;
  setActive: (v: boolean) => void;
  password: string;
  setPassword: (v: string) => void;
}) {
  const inputRef = React.useRef<HTMLInputElement>(null);
  const dragCount = React.useRef(0);

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    dragCount.current = 0;
    setActive(false);
    const files = Array.from(e.dataTransfer.files || []);
    if (files.length) onFiles(files);
  };
  const onDragOver = (e: React.DragEvent) => { e.preventDefault(); };
  const onDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    dragCount.current++;
    if (dragCount.current === 1) setActive(true);
  };
  const onDragLeave = () => {
    dragCount.current--;
    if (dragCount.current <= 0) {
      dragCount.current = 0;
      setActive(false);
    }
  };

  const onPick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length) onFiles(files);
    e.target.value = '';
  };

  return (
    <div
      className={`dropzone${active ? ' is-active' : ''}`}
      onClick={() => inputRef.current?.click()}
      onDrop={onDrop}
      onDragOver={onDragOver}
      onDragEnter={onDragEnter}
      onDragLeave={onDragLeave}
      role="button"
      tabIndex={0}
    >
      <div className="dz-glyph">
        <Icon.Upload />
      </div>
      <h2 className="dz-title">
        {active ? '여기에 놓으세요' : '파일을 끌어다 놓으세요'}
      </h2>
      <p className="dz-sub">
        또는 클릭하여 선택 · <span className="kbd">⌘</span> <span className="kbd">V</span> 로 붙여넣기
      </p>

      <div className="dz-meta">
        <span className="tag">type: <b>any</b></span>
        <span className="tag">max: <b>5.0 GB</b></span>
        <span className="tag">concurrent: <b>4</b></span>
        <span className="tag">encrypted: <b>TLS 1.3</b></span>
      </div>

      <div className="dz-actions" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="btn-primary" onClick={() => inputRef.current?.click()}>
          <Icon.Plus />
          파일 선택
        </button>
        <div className="dz-password">
          <Icon.Lock />
          <input
            type="password"
            placeholder="업로드 비밀번호"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
      </div>

      <input ref={inputRef} type="file" multiple hidden onChange={onPick} />
    </div>
  );
}

// ── Queue item ────────────────────────────────────────────────────────
export function QueueItem({ item, onPause, onResume, onCancel, onRetry, onRemove }: {
  item: UploadItem;
  onPause: (id: string) => void;
  onResume: (id: string) => void;
  onCancel: (id: string) => void;
  onRetry: (id: string) => void;
  onRemove: (id: string) => void;
}) {
  const { id, name, size, sent, kind, status, speed, eta, thumbUrl, error } = item;
  const pct = size > 0 ? Math.min(100, Math.round((sent / size) * 100)) : 0;

  const stateClass =
    status === 'done' ? ' is-done' :
    status === 'error' ? ' is-err' :
    status === 'paused' ? ' is-paused' :
    status === 'uploading' ? ' is-uploading' : '';

  const KindIcon = () => {
    if (kind === 'image') return <Icon.Image />;
    if (kind === 'video') return <Icon.Video />;
    if (kind === 'audio') return <Icon.Music />;
    if (kind === 'pdf')   return <Icon.Pdf />;
    if (kind === 'zip')   return <Icon.Zip />;
    if (kind === 'code')  return <Icon.Code />;
    return <Icon.File />;
  };

  return (
    <div className={`q-item${stateClass}`}>
      <div className="q-thumb">
        {thumbUrl ? (
          <img src={thumbUrl} alt="" />
        ) : (
          <KindIcon />
        )}
      </div>

      <div className="q-head">
        <span className="q-name" title={name}>{name}</span>
        <span className="q-size">
          {status === 'done'
            ? formatBytes(size)
            : `${formatBytes(sent)} / ${formatBytes(size)}`}
        </span>
      </div>

      <div className="q-meta">
        {status === 'uploading' && (
          <>
            <span>{pct}%</span>
            <span className="sep">·</span>
            <span className="speed">{formatBytes(speed)}/s</span>
            <span className="sep">·</span>
            <span className="eta">{formatEta(eta)} 남음</span>
            <span className="sep">·</span>
            <span style={{ color: 'var(--fg-mute)' }}>{kind.toUpperCase()} · {shortExt(name)}</span>
          </>
        )}
        {status === 'queued' && (
          <>
            <span style={{ color: 'var(--fg-mute)' }}>대기 중</span>
            <span className="sep">·</span>
            <span>{kind.toUpperCase()} · {shortExt(name)}</span>
          </>
        )}
        {status === 'paused' && (
          <>
            <span className="status-paused">일시정지 · {pct}%</span>
            <span className="sep">·</span>
            <span>{kind.toUpperCase()} · {shortExt(name)}</span>
          </>
        )}
        {status === 'done' && (
          <>
            <span className="status-done">● 업로드 완료</span>
            <span className="sep">·</span>
            <span>{kind.toUpperCase()} · {shortExt(name)}</span>
          </>
        )}
        {status === 'error' && (
          <>
            <span className="status-err">● 실패</span>
            <span className="sep">·</span>
            <span style={{ color: 'var(--fg-mute)' }}>{error || '네트워크 오류'}</span>
          </>
        )}
      </div>

      <div className="q-actions">
        {status === 'uploading' && (
          <button className="q-btn" title="일시정지" onClick={() => onPause(id)}>
            <Icon.Pause />
          </button>
        )}
        {status === 'paused' && (
          <button className="q-btn" title="재개" onClick={() => onResume(id)}>
            <Icon.Play />
          </button>
        )}
        {status === 'error' && (
          <button className="q-btn" title="다시 시도" onClick={() => onRetry(id)}>
            <Icon.Retry />
          </button>
        )}
        {(status === 'uploading' || status === 'paused' || status === 'queued') && (
          <button className="q-btn danger" title="취소" onClick={() => onCancel(id)}>
            <Icon.X />
          </button>
        )}
        {(status === 'done' || status === 'error') && (
          <button className="q-btn" title="목록에서 제거" onClick={() => onRemove(id)}>
            <Icon.Trash />
          </button>
        )}
      </div>

      <div className="q-progress">
        <div className="bar" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

// ── Toast container ──────────────────────────────────────────────────
export function Toasts({ items }: { items: ToastItem[] }) {
  return (
    <div className="toast-wrap" aria-live="polite">
      {items.map((t) => (
        <div className="toast" key={t.id}>
          <span className="check"><Icon.Check /></span>
          <span>{t.text}</span>
        </div>
      ))}
    </div>
  );
}

// ── Confetti burst ───────────────────────────────────────────────────
export function Confetti({ seed }: { seed: number }) {
  if (!seed) return null;
  const pieces = React.useMemo(() => {
    const colors = ['var(--accent)', '#6ad7ff', '#ff5ad1', '#ffb347', '#ffffff'];
    return Array.from({ length: 28 }, (_, i) => ({
      id: `${seed}-${i}`,
      left: Math.random() * 100,
      bg: colors[Math.floor(Math.random() * colors.length)],
      delay: Math.random() * 0.15,
      duration: 0.9 + Math.random() * 0.7,
      size: 4 + Math.random() * 6,
    }));
  }, [seed]);
  return (
    <div className="confetti-wrap">
      {pieces.map((p) => (
        <span
          key={p.id}
          className="confetti"
          style={{
            left: `${p.left}%`,
            background: p.bg,
            width: `${p.size}px`,
            height: `${p.size * 1.6}px`,
            animationDelay: `${p.delay}s`,
            animationDuration: `${p.duration}s`,
          }}
        />
      ))}
    </div>
  );
}
