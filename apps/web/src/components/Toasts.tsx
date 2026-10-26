import { useStore } from '../state/store';

export function Toasts() {
  const toasts = useStore((s) => s.ui.toasts);
  const dismiss = useStore((s) => s.dismissToast);
  if (!toasts.length) return null;
  return (
    <div className="toasts" role="region" aria-live="polite" aria-label="Notifications">
      {toasts.map((t) => (
        <div key={t.id} className={`toast ${t.kind}`} data-testid="toast" onClick={() => dismiss(t.id)}>
          <div className="title">{t.title}</div>
          {t.body && <div className="muted small">{t.body}</div>}
        </div>
      ))}
    </div>
  );
}
