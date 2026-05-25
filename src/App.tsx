import React from 'react';
import { useTweaks, TweaksPanel, TweakSection, TweakColor, TweakRadio, TweakToggle, TweakSlider, TweakButton } from './tweaks-panel';
import { TopBar, DropZone, QueueItem, Toasts, Confetti, detectKind, uid } from './components';
import type { UploadItem, ToastItem } from './components';
import Icon from './icons';
import { zipInputFolder, zipDirEntry, extractDropItems } from './zipFolder';

const TWEAK_DEFAULTS = {
  accent: '#c5f82a',
  density: 'regular',
  grid: true,
  concurrency: 3,
};

const ACCENT_MAP: Record<string, string> = {
  '#c5f82a': 'lime',
  '#5cf0ff': 'cyan',
  '#ff5ad1': 'magenta',
  '#ffb347': 'amber',
};

interface FileLike {
  name: string;
  size: number;
  type: string;
}

export default function App() {
  const [t, setTweak] = useTweaks(TWEAK_DEFAULTS);
  const [password, setPassword] = React.useState('');
  const [dropActive, setDropActive] = React.useState(false);
  const [items, setItems] = React.useState<UploadItem[]>([]);
  const [toasts, setToasts] = React.useState<ToastItem[]>([]);
  const [confettiSeed, setConfettiSeed] = React.useState(0);
  const [uploadStarted, setUploadStarted] = React.useState(false);
  const [compressing, setCompressing] = React.useState(false);
  const xhrsRef = React.useRef<Record<string, XMLHttpRequest>>({});
  const addMoreRef = React.useRef<HTMLInputElement>(null);
  const addMoreFolderRef = React.useRef<HTMLInputElement>(null);
  const queueDragCount = React.useRef(0);

  React.useEffect(() => {
    addMoreFolderRef.current?.setAttribute('webkitdirectory', '');
  }, []);

  // tweaks → root attrs
  React.useEffect(() => {
    const name = ACCENT_MAP[String(t.accent).toLowerCase()] || 'lime';
    document.documentElement.dataset.accent = name;
    document.documentElement.dataset.density = t.density;
    document.documentElement.dataset.grid = t.grid ? 'on' : 'off';
  }, [t.accent, t.density, t.grid]);

  const addFiles = React.useCallback(async (files: FileLike[]) => {
    const next: UploadItem[] = [];
    for (const f of files) {
      const kind = detectKind(f);
      let thumbUrl: string | null = null;
      if (kind === 'image' && f.size < 32 * 1024 * 1024 && f instanceof File) {
        try { thumbUrl = URL.createObjectURL(f); } catch (e) { /* noop */ }
      }
      const baseSpeed = 800 * 1024 + Math.random() * 6_000_000;
      next.push({
        id: uid(),
        name: f.name,
        size: f.size,
        sent: 0,
        kind,
        thumbUrl,
        status: 'queued',
        speed: baseSpeed,
        baseSpeed,
        eta: 0,
        addedAt: Date.now(),
        willFail: false,
        error: null,
        file: f instanceof File ? f : undefined,
      });
    }
    setItems((prev) => [...next, ...prev]);
  }, []);

  const compressAndAdd = React.useCallback(async (promise: Promise<File>) => {
    setCompressing(true);
    try {
      const zipFile = await promise;
      addFiles([zipFile]);
    } finally {
      setCompressing(false);
    }
  }, [addFiles]);

  const onFolderFiles = React.useCallback((files: File[]) => {
    compressAndAdd(zipInputFolder(files));
  }, [compressAndAdd]);

  const onFolderEntry = React.useCallback((entry: FileSystemDirectoryEntry) => {
    compressAndAdd(zipDirEntry(entry));
  }, [compressAndAdd]);

  // real uploader — only runs after user clicks "업로드 시작"
  React.useEffect(() => {
    if (!password.trim() || !uploadStarted) return;

    const activeItems = items.filter(i => i.status === 'uploading');
    const limit = Math.max(1, Math.min(8, t.concurrency || 3));

    if (activeItems.length < limit) {
      const queuedItems = items.filter(i => i.status === 'queued');
      const toStart = queuedItems.slice(0, limit - activeItems.length);

      toStart.forEach(item => {
        if (!item.file) {
          setItems(p => p.map(i => i.id === item.id ? { ...i, status: 'error', error: '파일 객체가 없습니다' } : i));
          return;
        }

        const formData = new FormData();
        formData.append('files', item.file);
        formData.append('password', password);

        const xhr = new XMLHttpRequest();
        xhrsRef.current[item.id] = xhr;

        xhr.open('POST', 'https://depot.seohamin.com/api/v1/files', true);

        let lastSent = 0;
        let lastTime = Date.now();

        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) {
            const now = Date.now();
            const elapsed = (now - lastTime) / 1000;
            let speed = 0;
            if (elapsed > 0) speed = (e.loaded - lastSent) / elapsed;
            setItems(p => p.map(i => {
              if (i.id === item.id) {
                const newSpeed = speed > 0 ? (i.speed ? (i.speed * 0.8 + speed * 0.2) : speed) : i.speed;
                const eta = newSpeed > 0 ? (e.total - e.loaded) / newSpeed : 0;
                return { ...i, sent: e.loaded, speed: newSpeed, eta };
              }
              return i;
            }));
            lastSent = e.loaded;
            lastTime = now;
          }
        };

        xhr.onload = () => {
          delete xhrsRef.current[item.id];
          if (xhr.status === 204) {
            setItems(p => p.map(i => i.id === item.id ? { ...i, status: 'done', sent: i.size, speed: 0, eta: 0 } : i));
            setToasts((tt) => {
              const toastId = uid();
              setTimeout(() => setToasts((cur) => cur.filter((x) => x.id !== toastId)), 2600);
              return [...tt, { id: toastId, text: `${item.name} 업로드 완료` }];
            });
          } else if (xhr.status === 401) {
            setItems(p => p.map(i => i.id === item.id ? { ...i, status: 'error', error: '비밀번호가 잘못되었습니다' } : i));
          } else if (xhr.status === 400) {
            setItems(p => p.map(i => i.id === item.id ? { ...i, status: 'error', error: '잘못된 요청입니다 (파일 문제)' } : i));
          } else {
            setItems(p => p.map(i => i.id === item.id ? { ...i, status: 'error', error: `서버 오류 (${xhr.status})` } : i));
          }
        };

        xhr.onerror = () => {
          delete xhrsRef.current[item.id];
          setItems(p => p.map(i => i.id === item.id ? { ...i, status: 'error', error: '네트워크 오류' } : i));
        };

        xhr.onabort = () => { delete xhrsRef.current[item.id]; };

        setItems(p => p.map(i => i.id === item.id ? { ...i, status: 'uploading' } : i));
        xhr.send(formData);
      });
    }
  }, [items, t.concurrency, password, uploadStarted]);

  // items 전부 제거되면 초기 상태로 리셋
  React.useEffect(() => {
    if (items.length === 0) setUploadStarted(false);
  }, [items.length]);

  // burst confetti when all uploads finish
  const prevAllDoneRef = React.useRef(false);
  React.useEffect(() => {
    const hasAny = items.length > 0;
    const allDone = hasAny && items.every((i) => i.status === 'done' || i.status === 'error');
    const anyDone = items.some((i) => i.status === 'done');
    if (allDone && anyDone && !prevAllDoneRef.current) {
      setConfettiSeed(Date.now());
      setTimeout(() => setConfettiSeed(0), 1600);
    }
    prevAllDoneRef.current = allDone;
  }, [items]);

  const abortXhr = (id: string) => {
    if (xhrsRef.current[id]) { xhrsRef.current[id].abort(); delete xhrsRef.current[id]; }
  };

  const onPause  = (id: string) => {
    abortXhr(id);
    setItems((p) => p.map((i) => i.id === id && i.status === 'uploading' ? { ...i, status: 'paused' as const } : i));
  };
  const onResume = (id: string) => setItems((p) => p.map((i) => i.id === id && i.status === 'paused' ? { ...i, status: 'queued' as const, sent: 0 } : i));
  const onCancel = (id: string) => { abortXhr(id); setItems((p) => p.filter((i) => i.id !== id)); };
  const onRetry  = (id: string) => setItems((p) => p.map((i) => i.id === id ? { ...i, status: 'queued' as const, sent: 0, error: null } : i));
  const onRemove = (id: string) => setItems((p) => p.filter((i) => i.id !== id));
  const onClearDone = () => setItems((p) => p.filter((i) => i.status !== 'done'));
  const onCancelAll = () => { Object.keys(xhrsRef.current).forEach(abortXhr); setItems((p) => p.filter((i) => i.status === 'done')); };

  const onStartUpload = () => {
    if (!password.trim()) return;
    setUploadStarted(true);
  };

  // global paste handler
  React.useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const files = Array.from(e.clipboardData?.files || []);
      if (files.length) addFiles(files);
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [addFiles]);

  const active = items.filter((i) => i.status === 'uploading').length;
  const queued = items.filter((i) => i.status === 'queued').length;
  const done   = items.filter((i) => i.status === 'done').length;

  const isUploading = active > 0;

  return (
    <>
      <div className="app">
        <TopBar />

        <main className="main">
          {items.length === 0 ? (
            <DropZone
              onFiles={addFiles}
              onFolderFiles={onFolderFiles}
              onFolderEntry={onFolderEntry}
              active={dropActive}
              setActive={setDropActive}
              compressing={compressing}
            />
          ) : (
            <section
              className={`queue${dropActive ? ' drop-active' : ''}`}
              onDragOver={(e) => e.preventDefault()}
              onDragEnter={(e) => {
                e.preventDefault();
                queueDragCount.current++;
                if (queueDragCount.current === 1) setDropActive(true);
              }}
              onDragLeave={() => {
                queueDragCount.current--;
                if (queueDragCount.current <= 0) { queueDragCount.current = 0; setDropActive(false); }
              }}
              onDrop={(e) => {
                e.preventDefault();
                queueDragCount.current = 0;
                setDropActive(false);
                const { files, dirEntries } = extractDropItems(e.dataTransfer);
                if (files.length) addFiles(files);
                for (const dir of dirEntries) onFolderEntry(dir);
              }}
            >
              <div className="section-h">
                <span>upload queue</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span className="count">{done}/{items.length} 완료</span>
                  {done > 0 && (
                    <button className="btn-ghost" onClick={onClearDone} style={{ padding: '4px 9px', height: 24, fontSize: 11 }}>
                      완료 정리
                    </button>
                  )}
                  {(active + queued) > 0 && (
                    <button className="btn-ghost" onClick={onCancelAll} style={{ padding: '4px 9px', height: 24, fontSize: 11 }}>
                      전체 취소
                    </button>
                  )}
                  <button className="btn-ghost" onClick={() => addMoreRef.current?.click()} disabled={compressing} style={{ padding: '4px 9px', height: 24, fontSize: 11 }}>
                    {compressing ? '압축 중...' : '+ 파일 추가'}
                  </button>
                  <button className="btn-ghost" onClick={() => addMoreFolderRef.current?.click()} disabled={compressing} style={{ padding: '4px 9px', height: 24, fontSize: 11 }}>
                    {compressing ? '압축 중...' : '+ 폴더 추가'}
                  </button>
                </div>
              </div>

              <div className="queue-list">
                {items.map((it) => (
                  <QueueItem
                    key={it.id}
                    item={it}
                    onPause={onPause}
                    onResume={onResume}
                    onCancel={onCancel}
                    onRetry={onRetry}
                    onRemove={onRemove}
                  />
                ))}
              </div>

              <div className="action-bar">
                <div className={`action-password${!password.trim() ? ' is-empty' : ''}`}>
                  <Icon.Lock />
                  <input
                    type="password"
                    placeholder="업로드 비밀번호"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') onStartUpload(); }}
                    autoComplete="current-password"
                  />
                  {!password.trim() && <span className="action-password-required">필수</span>}
                </div>
                <button
                  className="btn-primary"
                  onClick={onStartUpload}
                  disabled={!password.trim()}
                >
                  <Icon.Upload />
                  {isUploading ? '업로드 중...' : '업로드 시작'}
                </button>
              </div>

              <div className="foot-hints">
                <span className="hint">파일을 여기에 끌어다 놓거나 <span className="kbd">⌘</span><span className="kbd">V</span> 로 붙여넣기</span>
              </div>

              <input ref={addMoreRef} type="file" multiple hidden onChange={(e) => {
                const files = Array.from(e.target.files || []);
                if (files.length) addFiles(files);
                e.target.value = '';
              }} />
              <input ref={addMoreFolderRef} type="file" multiple hidden onChange={(e) => {
                const files = Array.from(e.target.files || []);
                if (files.length) onFolderFiles(files);
                e.target.value = '';
              }} />
            </section>
          )}
        </main>

        <Toasts items={toasts} />
        <Confetti seed={confettiSeed} />
      </div>

      <TweaksPanel title="Tweaks">
        <TweakSection label="appearance" />
        <TweakColor
          label="accent"
          value={t.accent}
          options={['#c5f82a', '#5cf0ff', '#ff5ad1', '#ffb347']}
          onChange={(hex) => setTweak('accent', hex as string)}
        />
        <TweakRadio
          label="density"
          value={t.density}
          options={['compact', 'regular', 'comfy']}
          onChange={(v) => setTweak('density', v)}
        />
        <TweakToggle
          label="background grid"
          value={t.grid}
          onChange={(v) => setTweak('grid', v)}
        />

        <TweakSection label="behavior" />
        <TweakSlider
          label="concurrency"
          value={t.concurrency}
          min={1} max={6} step={1}
          onChange={(v) => setTweak('concurrency', v)}
        />

        <TweakSection label="demo" />
        <TweakButton
          label="샘플 파일 5개 추가"
          onClick={() => {
            addFiles([
              { name: 'design-spec.pdf', size: 4_300_000, type: 'application/pdf' },
              { name: 'hero-shot-final.jpg', size: 18_200_000, type: 'image/jpeg' },
              { name: 'intro.mp4', size: 240_500_000, type: 'video/mp4' },
              { name: 'release-notes.md', size: 12_400, type: 'text/markdown' },
              { name: 'backup-2026-05.zip', size: 980_000_000, type: 'application/zip' },
            ]);
          }}
        />
      </TweaksPanel>
    </>
  );
}
