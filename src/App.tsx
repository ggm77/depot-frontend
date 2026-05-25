import React from 'react';
import { useTweaks, TweaksPanel, TweakSection, TweakColor, TweakRadio, TweakToggle, TweakSlider, TweakButton } from './tweaks-panel';
import { LockScreen, TopBar, DropZone, QueueItem, Toasts, Confetti, formatBytes, detectKind, uid } from './components';
import type { UploadItem, ToastItem } from './components';

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

const STORAGE_MAX = 50 * 1024 * 1024 * 1024;

interface FileLike {
  name: string;
  size: number;
  type: string;
}

export default function App() {
  const [t, setTweak] = useTweaks(TWEAK_DEFAULTS);
  const [locked, setLocked] = React.useState(true);
  const [dropActive, setDropActive] = React.useState(false);
  const [items, setItems] = React.useState<UploadItem[]>([]);
  const [toasts, setToasts] = React.useState<ToastItem[]>([]);
  const [confettiSeed, setConfettiSeed] = React.useState(0);

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
      const failChance = f.size > 1024 ? Math.random() < 0.1 : false;
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
        willFail: failChance,
        error: null,
      });
    }
    setItems((prev) => [...next, ...prev]);
  }, []);

  // ticker: drives uploads forward
  React.useEffect(() => {
    const TICK = 200;
    const id = setInterval(() => {
      setItems((prev) => {
        let activeCount = prev.filter((p) => p.status === 'uploading').length;
        const limit = Math.max(1, Math.min(8, t.concurrency || 3));

        const updated = prev.map((it) => {
          if (it.status === 'queued' && activeCount < limit) {
            activeCount++;
            return { ...it, status: 'uploading' as const };
          }
          if (it.status !== 'uploading') return it;

          const speed = Math.max(64 * 1024, it.baseSpeed * (0.7 + Math.random() * 0.6));
          const inc = Math.round((speed * TICK) / 1000);
          let sent = it.sent + inc;

          if (it.willFail && sent / it.size > 0.35 + Math.random() * 0.4) {
            return { ...it, status: 'error' as const, error: '연결이 끊어졌습니다', willFail: false };
          }

          if (sent >= it.size) {
            queueMicrotask(() => {
              setToasts((tt) => {
                const toastId = uid();
                const text = `${it.name} 업로드 완료`;
                setTimeout(() => {
                  setToasts((cur) => cur.filter((x) => x.id !== toastId));
                }, 2600);
                return [...tt, { id: toastId, text }];
              });
            });
            return { ...it, status: 'done' as const, sent: it.size, speed: 0, eta: 0 };
          }

          const eta = (it.size - sent) / speed;
          return { ...it, sent, speed, eta };
        });
        return updated;
      });
    }, 200);
    return () => clearInterval(id);
  }, [t.concurrency]);

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

  const onPause  = (id: string) => setItems((p) => p.map((i) => i.id === id && i.status === 'uploading' ? { ...i, status: 'paused' as const } : i));
  const onResume = (id: string) => setItems((p) => p.map((i) => i.id === id && i.status === 'paused' ? { ...i, status: 'uploading' as const } : i));
  const onCancel = (id: string) => setItems((p) => p.filter((i) => i.id !== id));
  const onRetry  = (id: string) => setItems((p) => p.map((i) => i.id === id ? { ...i, status: 'queued' as const, sent: 0, error: null, willFail: false } : i));
  const onRemove = (id: string) => setItems((p) => p.filter((i) => i.id !== id));
  const onClearDone = () => setItems((p) => p.filter((i) => i.status !== 'done'));
  const onCancelAll = () => setItems((p) => p.filter((i) => i.status === 'done'));

  // global paste handler
  React.useEffect(() => {
    if (locked) return;
    const onPaste = (e: ClipboardEvent) => {
      const files = Array.from(e.clipboardData?.files || []);
      if (files.length) addFiles(files);
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [locked, addFiles]);

  const active    = items.filter((i) => i.status === 'uploading').length;
  const queued    = items.filter((i) => i.status === 'queued').length;
  const done      = items.filter((i) => i.status === 'done').length;
  const failed    = items.filter((i) => i.status === 'error').length;
  const totalSize = items.reduce((s, i) => s + i.size, 0);
  const totalSent = items.reduce((s, i) => s + i.sent, 0);
  const storageUsed = 12.4 * 1024 * 1024 * 1024 + totalSent;

  return (
    <>
      {locked ? (
        <LockScreen onUnlock={() => setLocked(false)} />
      ) : (
        <div className="app">
          <TopBar onLock={() => setLocked(true)} used={storageUsed} max={STORAGE_MAX} />

          <main className="main">
            <DropZone onFiles={addFiles} active={dropActive} setActive={setDropActive} />

            <section className="queue">
              <div className="section-h">
                <span>upload queue</span>
                <span className="count">
                  {items.length === 0 ? 'empty' : `${done}/${items.length} 완료`}
                </span>
              </div>

              {items.length > 0 && (
                <div className="queue-summary">
                  <span>전송: <span className="accent">{formatBytes(totalSent)}</span> / {formatBytes(totalSize)}</span>
                  <span className="sep">·</span>
                  <span>활성 {active}</span>
                  <span className="sep">·</span>
                  <span>대기 {queued}</span>
                  {failed > 0 && (
                    <>
                      <span className="sep">·</span>
                      <span style={{ color: 'var(--danger)' }}>실패 {failed}</span>
                    </>
                  )}
                  <div className="summary-actions">
                    {done > 0 && (
                      <button className="btn-ghost" onClick={onClearDone} style={{ padding: '5px 10px', height: 26, fontSize: 11 }}>
                        완료 항목 정리
                      </button>
                    )}
                    {(active + queued) > 0 && (
                      <button className="btn-ghost" onClick={onCancelAll} style={{ padding: '5px 10px', height: 26, fontSize: 11 }}>
                        전체 취소
                      </button>
                    )}
                  </div>
                </div>
              )}

              {items.length === 0 ? (
                <div className="empty">
                  $ awaiting files... 위에 파일을 드롭하세요
                </div>
              ) : (
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
              )}

              <div className="foot-hints">
                <span className="hint"><span className="kbd">⌘</span><span className="kbd">V</span> 클립보드 붙여넣기</span>
                <span className="hint">⌥ 폴더 단위 업로드 지원</span>
                <span className="hint">서버: depot-01 · region: ap-northeast-2</span>
              </div>
            </section>
          </main>

          <Toasts items={toasts} />
          <Confetti seed={confettiSeed} />
        </div>
      )}

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
