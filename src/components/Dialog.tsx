import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { X } from "lucide-react";

type DialogChildren = ReactNode | ((close: () => void) => ReactNode);

export function Dialog({
  title,
  onClose,
  children,
  wide = false,
  standalone = false,
  variant = "default",
  headerActions,
}: {
  title: string;
  onClose: () => void;
  children: DialogChildren;
  wide?: boolean;
  standalone?: boolean;
  variant?: "default" | "calendar";
  headerActions?: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const closeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  const [closing, setClosing] = useState(false);
  const requestClose = useCallback(() => {
    if (closing) return;
    setClosing(true);
    const reducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    closeTimer.current = setTimeout(
      () => {
        ref.current?.close();
        onClose();
      },
      reducedMotion ? 0 : 150,
    );
  }, [closing, onClose]);
  useEffect(() => {
    const el = ref.current!;
    if (standalone) el.show();
    else el.showModal();
    return () => {
      clearTimeout(closeTimer.current);
      if (el.open) el.close();
    };
  }, [standalone]);
  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      className={`${wide ? "wide " : ""}${standalone ? "standalone " : ""}${variant === "calendar" ? "calendar-dialog " : ""}${closing ? "is-closing" : ""}`}
      onCancel={(e) => {
        e.preventDefault();
        requestClose();
      }}
      onClick={(e) => {
        if (e.target === ref.current) {
          const r = ref.current.getBoundingClientRect();
          if (
            e.clientX < r.left ||
            e.clientX > r.right ||
            e.clientY < r.top ||
            e.clientY > r.bottom
          )
            requestClose();
        }
      }}
    >
      <div className="dialog-head" data-tauri-drag-region={standalone || undefined}>
        <div className="dialog-title" data-tauri-drag-region={standalone || undefined}>
          {variant === "default" ? (
            <span className="dialog-brand" aria-hidden="true">
              <img src="/sesh-logo.png" alt="" />
            </span>
          ) : null}
          <div data-tauri-drag-region={standalone || undefined}>
            <h2 id={titleId} data-tauri-drag-region={standalone || undefined}>{title}</h2>
            {standalone && variant === "default" ? <small>SESH configuration</small> : null}
          </div>
        </div>
        {headerActions}
        <button
          className="icon"
          aria-label="Close dialog"
          onClick={requestClose}
          disabled={closing}
        >
          <X size={18} />
        </button>
      </div>
      {typeof children === "function" ? children(requestClose) : children}
    </dialog>
  );
}
