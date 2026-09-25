"use client";
import { useState } from "react";
import type { AdminActivity } from "@/lib/admin";

// Uma série só: a cor neutra do texto secundário, para não competir com os
// estados das assinaturas (verde, âmbar e grafite) nem com o vermelho da marca.
const BAR = "#393e46";
const GRID = "#e4e2dc";
const BASELINE = "#c6c2b9";
const AXIS = "#9a9ea6";
const INK = "#393e46";
const LEFT = 40;
const RIGHT = 752;
const TOP = 24;
const BASE = 178;

const dayMonth = (date: string) => `${date.slice(8)}/${date.slice(5, 7)}`;
const plural = (n: number, one: string, many: string) =>
  `${n} ${n === 1 ? one : many}`;

// Passo redondo (1, 2, 5 × 10ⁿ) com cerca de quatro divisões; contagens
// nunca ganham marcação fracionária.
function step(max: number) {
  const raw = Math.max(1, max / 4);
  const power = 10 ** Math.floor(Math.log10(raw));
  const n = raw / power;
  return Math.max(1, (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * power);
}
// Coluna com topo arredondado e base reta, apoiada na linha de base.
function column(x: number, y: number, w: number) {
  const r = Math.min(4, BASE - y, w / 2);
  return `M${x},${BASE}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${BASE}Z`;
}

export function ActivityChart({ activity }: { activity: AdminActivity[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const count = activity.length;
  const peak = Math.max(0, ...activity.map((d) => d.operations));
  const unit = step(peak);
  const top = unit * Math.max(1, Math.ceil(peak / unit));
  const ticks = Array.from({ length: top / unit + 1 }, (_, i) => i * unit);
  const band = (RIGHT - LEFT) / Math.max(1, count);
  const width = Math.min(24, band * 0.62);
  const center = (i: number) => LEFT + band * (i + 0.5);
  const y = (v: number) => BASE - (v / top) * (BASE - TOP);
  const peakIndex = peak > 0 ? activity.findIndex((d) => d.operations === peak) : -1;
  const selected = hover === null ? null : activity[hover];
  const tip = selected
    ? [
        dayMonth(selected.date),
        plural(selected.operations, "operação", "operações"),
        plural(selected.accounts, "conta ativa", "contas ativas"),
      ]
    : [];
  const tipWidth = Math.max(0, ...tip.map((l) => l.length)) * 6.9 + 22;
  const flip = hover !== null && center(hover) + tipWidth + 18 > 760;
  return (
    <div className="chart-wrap">
      <svg
        className="chart"
        viewBox="0 0 760 210"
        role="img"
        aria-label={`Operações por dia nos últimos ${count} dias. Máximo de ${peak} em um dia. Valores completos na tabela a seguir.`}
        onMouseLeave={() => setHover(null)}
      >
        {ticks.map((t) => (
          <g key={t}>
            <line
              x1={LEFT}
              x2={RIGHT}
              y1={y(t)}
              y2={y(t)}
              stroke={t === 0 ? BASELINE : GRID}
            />
            <text
              x="0"
              y={y(t) + 4}
              fill={AXIS}
              fontSize="11"
              fontFamily="var(--font-mono), monospace"
            >
              {t}
            </text>
          </g>
        ))}
        {activity.map((d, i) => (
          <g key={d.date}>
            {d.operations > 0 && (
              <path
                className="activity-bar"
                d={column(center(i) - width / 2, Math.min(BASE - 2, y(d.operations)), width)}
                fill={BAR}
                opacity={hover === null || hover === i ? 1 : 0.3}
                style={{ animationDelay: `${i * 14}ms` }}
              />
            )}
            {/* Só o pico leva número; o resto fica no eixo, na dica e na tabela. */}
            {i === peakIndex && (
              <text
                x={center(i)}
                y={y(d.operations) - 8}
                textAnchor="middle"
                fill={INK}
                fontSize="11"
                fontWeight="600"
                fontFamily="var(--font-mono), monospace"
              >
                {d.operations}
              </text>
            )}
            {(count <= 7 || i === count - 1 || (i % 5 === 0 && i < count - 2)) && (
              <text
                x={center(i)}
                y="200"
                textAnchor="middle"
                fontSize="11"
                fill={AXIS}
                fontFamily="var(--font-mono), monospace"
              >
                {dayMonth(d.date)}
              </text>
            )}
            <rect
              x={LEFT + band * i}
              y={TOP - 10}
              width={band}
              height={BASE - TOP + 10}
              fill="transparent"
              onMouseEnter={() => setHover(i)}
            />
          </g>
        ))}
        {selected && (
          <g
            pointerEvents="none"
            transform={`translate(${flip ? center(hover!) - tipWidth - 16 : center(hover!) + 16}, ${TOP})`}
          >
            <rect width={tipWidth} height="62" fill="#14161a" fillOpacity=".95" />
            {tip.map((line, i) => (
              <text
                key={line}
                x="10"
                y={20 + i * 17}
                fill={i === 0 ? "#fff" : "#c8ccd3"}
                fontSize="11"
                fontFamily="var(--font-mono), monospace"
              >
                {line}
              </text>
            ))}
          </g>
        )}
      </svg>
      {/* A tabela ignora a altura de 1px do sr-only; o invólucro recorta. */}
      <div className="sr-only">
      <table>
        <caption>Operações registradas por dia</caption>
        <thead>
          <tr>
            <th>Dia</th>
            <th>Operações</th>
            <th>Contas ativas</th>
          </tr>
        </thead>
        <tbody>
          {activity.map((d) => (
            <tr key={d.date}>
              <td>{dayMonth(d.date)}</td>
              <td>{d.operations}</td>
              <td>{d.accounts}</td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>
    </div>
  );
}

export type StatusSegment = {
  key: string;
  label: string;
  count: number;
  color: string;
};
// Parte do todo em uma barra: cada estado tem rótulo e contagem na legenda,
// então a identificação nunca depende só da cor.
export function StatusBreakdown({
  segments,
  total,
}: {
  segments: StatusSegment[];
  total: number;
}) {
  // Maiores restos: as porcentagens da legenda somam exatamente 100%.
  const exact = segments.map((s) => (total ? (s.count / total) * 100 : 0));
  const shares = exact.map(Math.floor);
  const missing = total ? 100 - shares.reduce((a, b) => a + b, 0) : 0;
  exact
    .map((v, i) => ({ i, rest: v - Math.floor(v) }))
    .sort((a, b) => b.rest - a.rest)
    .slice(0, missing)
    .forEach(({ i }) => shares[i]++);
  const share = (key: string) => shares[segments.findIndex((s) => s.key === key)];
  return (
    <div className="status-breakdown">
      <div
        className={`status-bar ${total ? "" : "empty"}`}
        role="img"
        aria-label={segments.map((s) => `${s.label}: ${s.count}`).join(", ")}
      >
        {segments
          .filter((s) => s.count > 0)
          .map((s) => (
            <span
              key={s.key}
              style={{ flexGrow: s.count, background: s.color }}
              title={`${s.label}: ${s.count} (${share(s.key)}%)`}
            />
          ))}
      </div>
      <ul className="status-legend">
        {segments.map((s) => (
          <li key={s.key}>
            <i style={{ background: s.color }} aria-hidden="true" />
            <span>{s.label}</span>
            <strong>{s.count}</strong>
            <small>{share(s.key)}%</small>
          </li>
        ))}
      </ul>
    </div>
  );
}

export type UsageRow = { id: string; label: string; value: number };
// Barras horizontais ordenadas, uma cor só, com o valor na ponta.
export function UsageBars({ rows }: { rows: UsageRow[] }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <ul className="usage-bars">
      {rows.map((r, i) => (
        <li key={r.id}>
          <span title={r.label}>{r.label}</span>
          <span className="usage-track">
            <i
              style={{
                width: `calc((100% - 44px) * ${r.value / max})`,
                animationDelay: `${i * 60}ms`,
              }}
            />
            <strong>{r.value}</strong>
          </span>
        </li>
      ))}
    </ul>
  );
}
