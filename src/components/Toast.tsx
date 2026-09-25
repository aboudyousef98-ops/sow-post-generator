export interface Toast {
  id: string;
  text: string;
  action?: { label: string; fn: () => void };
}

export function Toasts({ toasts }: { toasts: Toast[] }) {
  return (
    <div className="toasts">
      {toasts.map((t) => (
        <div key={t.id} className="toast">
          <span>{t.text}</span>
          {t.action && (
            <button type="button" onClick={t.action.fn}>
              {t.action.label}
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
