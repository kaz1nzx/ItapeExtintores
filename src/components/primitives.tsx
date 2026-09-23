"use client";
import { useEffect, useRef, useId, type ReactNode } from "react";
import { X, FireExtinguisher, PackageOpen } from "lucide-react";
export function Modal({
  title,
  subtitle,
  children,
  close,
  busy,
  wide = false,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  close: () => void;
  busy: boolean;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const d = ref.current;
    d?.showModal();
    return () => d?.close();
  }, []);
  return (
    <dialog
      ref={ref}
      className={`modal ${wide ? "modal-wide" : ""}`}
      aria-labelledby={titleId}
      onCancel={(e) => {
        e.preventDefault();
        if (!busy) close();
      }}
      onClick={(e) => {
        if (e.target === ref.current && !busy) close();
      }}
    >
      <div className="modal-inner">
        <div className="modal-heading">
          <div>
            <h2 id={titleId}>{title}</h2>
            {subtitle && <p>{subtitle}</p>}
          </div>
          <button
            type="button"
            className="icon-button"
            onClick={close}
            disabled={busy}
            aria-label="Fechar janela"
          >
            <X />
          </button>
        </div>
        {children}
      </div>
    </dialog>
  );
}
export function Extinguisher({
  type,
  large = false,
}: {
  type: string;
  large?: boolean;
}) {
  return (
    <span
      className={`extinguisher ${large ? "large" : ""} ${type === "CO₂" ? "carbon" : type === "Água" ? "water" : type === "Espuma" ? "foam" : ""}`}
    >
      <FireExtinguisher strokeWidth={1.6} aria-hidden="true" />
    </span>
  );
}
export function Empty({
  title = "Nenhum registro por aqui.",
  description = "Os registros aparecerão aqui assim que você começar.",
  children,
}: {
  title?: string;
  description?: string;
  children?: ReactNode;
}) {
  return (
    <div className="empty">
      <PackageOpen size={38} strokeWidth={1.3} />
      <h3>{title}</h3>
      <p>{description}</p>
      {children}
    </div>
  );
}
export function download(name: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function csvCell(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value))
    return `"${String(value).replace(".", ",")}"`;
  let v = String(value ?? "");
  if (/^[=+\-@\t\r]/.test(v)) v = `'${v}`;
  return `"${v.replaceAll('"', '""')}"`;
}
