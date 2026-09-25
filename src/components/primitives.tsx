"use client";
import { useEffect, useRef, useId, type ReactNode } from "react";
import {
  X,
  FireExtinguisher,
  PackageOpen,
  ArrowUpRight,
  ArrowDownRight,
  Minus,
  type LucideIcon,
} from "lucide-react";
import { money } from "@/lib/domain";
import { formatPercent, trend } from "@/lib/insights";
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
export function Metric({
  index,
  title,
  value,
  detail,
  icon: Icon,
  color,
  highlight = false,
  trend,
}: {
  index: number;
  title: string;
  value: ReactNode;
  detail: string;
  icon: LucideIcon;
  color: string;
  highlight?: boolean;
  trend?: ReactNode;
}) {
  return (
    <article className={`metric ${highlight ? "highlight" : ""}`}>
      <div className="metric-heading">
        <span>
          <span className="metric-index">
            {String(index).padStart(2, "0")}
          </span>
          {title}
        </span>
        <span className={`metric-icon ${color}`}>
          <Icon size={18} />
        </span>
      </div>
      <strong>{value}</strong>
      {trend}
      <small>
        {highlight && <span className="dot" />}
        {detail}
      </small>
    </article>
  );
}
// Variação contra o período anterior. A cor diz se a mudança é boa (receita
// subindo) ou ruim (custo subindo); a seta e o sinal dizem a direção, então a
// leitura não depende só da cor.
export function TrendLine({
  current,
  previous,
  label,
  upIsGood,
}: {
  current: number;
  previous: number;
  label: string;
  upIsGood?: boolean;
}) {
  if (!current && !previous)
    return <span className="metric-trend muted">Sem movimento nos dois períodos</span>;
  const t = trend(current, previous);
  const Arrow = t.direction === "up" ? ArrowUpRight : t.direction === "down" ? ArrowDownRight : Minus;
  const tone =
    t.direction === "flat" || upIsGood === undefined
      ? "neutral"
      : (t.direction === "up") === upIsGood
        ? "good"
        : "bad";
  const amount =
    t.direction === "flat"
      ? "Igual"
      : t.percent !== null
        ? formatPercent(t.percent)
        : `${t.difference > 0 ? "+" : "−"}${money(Math.abs(t.difference))}`;
  return (
    <span className={`metric-trend ${tone}`}>
      <Arrow size={14} aria-hidden="true" />
      <b>{amount}</b> {label}
    </span>
  );
}
export function PanelHeading({
  title,
  subtitle,
  extra,
}: {
  title: string;
  subtitle: string;
  extra?: ReactNode;
}) {
  return (
    <div className="panel-heading">
      <div>
        <h2>{title}</h2>
        <p>{subtitle}</p>
      </div>
      {extra}
    </div>
  );
}
// Mensagem de erro para a tela. As do servidor já vêm em português; queda de
// rede, tempo esgotado ou uma página de erro no lugar dos dados geram erros
// técnicos do navegador, em inglês, que viram um aviso claro.
export const problem = (e: unknown) =>
  e instanceof Error &&
  e.message &&
  e.name !== "TimeoutError" &&
  e.name !== "AbortError" &&
  !(e instanceof TypeError) &&
  !(e instanceof SyntaxError)
    ? e.message
    : "Sem resposta do servidor. Verifique a conexão e tente novamente.";
export function download(name: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
