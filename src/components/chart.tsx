"use client";
import { useState } from "react";
import { money, daysBefore, summarize, type Store } from "@/lib/domain";

// Par validado para daltonismo contra o fundo branco do painel (ΔE 13.8 em
// deuteranopia). O verde do texto é mais escuro; este vive só no gráfico.
const RED = "#d93a1c";
const TEAL = "#00897a";
const GRID = "#dbd8d2";
const AXIS = "#9a9ea6";
const INK = "#393e46";
const LEFT = 46;
const RIGHT = 640;
const LABEL_X = 652;

export default function Chart({
  store,
  from,
  to,
}: {
  store: Store;
  from: string;
  to: string;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const count = Math.round((Date.parse(to) - Date.parse(from)) / 86400000) + 1;
  const days = Array.from({ length: count }, (_, i) =>
    daysBefore(to, count - i - 1),
  );
  const points = days.map((date) => ({
    date,
    ...summarize(store, date, date),
  }));
  const max = Math.max(10000, ...points.map((p) => p.revenue));
  const min = Math.min(0, ...points.map((p) => p.profit));
  const x = (i: number) => LEFT + (i / Math.max(1, count - 1)) * (RIGHT - LEFT);
  const y = (v: number) => 175 - ((v - min) / (max - min)) * 150;
  const trace = (get: (p: (typeof points)[number]) => number) =>
    points.map((p, i) => `${i ? "L" : "M"}${x(i)},${y(get(p))}`).join(" ");
  const revenue = trace((p) => p.revenue);
  const profit = trace((p) => p.profit);
  const area = `M${x(0)},${y(0)} ${points
    .map((p, i) => `L${x(i)},${y(p.revenue)}`)
    .join("")} L${x(count - 1)},${y(0)} Z`;
  // Rótulos diretos no fim das linhas: a identidade nunca depende só da cor.
  const last = points.at(-1);
  const revenueLabelY = last ? y(last.revenue) : 0;
  const profitLabelY = !last
    ? 0
    : Math.abs(y(last.profit) - revenueLabelY) < 13
      ? revenueLabelY + 13
      : y(last.profit);
  const selected = hover === null ? null : points[hover];
  const band = (RIGHT - LEFT) / Math.max(1, count);
  const tipLines = selected
    ? [
        `${selected.date.slice(8)}/${selected.date.slice(5, 7)}`,
        `Receita  ${money(selected.revenue)}`,
        `Resultado  ${money(selected.profit)}`,
      ]
    : [];
  const tipWidth = Math.max(...tipLines.map((l) => l.length), 0) * 6.9 + 22;
  const flip = selected !== null && x(hover!) + tipWidth + 14 > 754;
  return (
    <div className="chart-wrap">
      <div className="chart-legend">
        <span>
          <i className="legend-red" />
          Receita
        </span>
        <span>
          <i className="legend-green" />
          Resultado
        </span>
        {selected && (
          <strong>
            {selected.date.slice(8)}/{selected.date.slice(5, 7)} ·{" "}
            {money(selected.revenue)} / {money(selected.profit)}
          </strong>
        )}
      </div>
      <svg
        className="chart"
        viewBox="0 0 760 210"
        role="img"
        aria-label={`Receita e resultado de ${from} a ${to}. Consulte os valores completos na tabela de relatórios.`}
        onMouseLeave={() => setHover(null)}
      >
        <defs>
          <linearGradient id="revenue-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={RED} stopOpacity=".14" />
            <stop offset="100%" stopColor={RED} stopOpacity="0" />
          </linearGradient>
        </defs>
        {[0, 1, 2, 3].map((i) => {
          const value = min + ((max - min) * i) / 3;
          return (
            <g key={i}>
              <line
                x1={LEFT}
                x2={RIGHT}
                y1={y(value)}
                y2={y(value)}
                stroke={GRID}
                strokeDasharray="3 5"
              />
              <text
                x="0"
                y={y(value) + 4}
                fill={AXIS}
                fontSize="11"
                fontFamily="var(--font-mono), monospace"
              >
                {(value / 100).toFixed(0)}
              </text>
            </g>
          );
        })}
        <path className="chart-area" d={area} fill="url(#revenue-fill)" />
        <path
          className="chart-line"
          d={revenue}
          pathLength={1}
          fill="none"
          stroke={RED}
          strokeWidth="2"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        <path
          className="chart-line second"
          d={profit}
          pathLength={1}
          fill="none"
          stroke={TEAL}
          strokeWidth="2"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        {last && (
        <g className="chart-tags">
          <rect x={LABEL_X} y={revenueLabelY - 1} width="9" height="2" fill={RED} />
          <text
            x={LABEL_X + 14}
            y={revenueLabelY + 3}
            fill={INK}
            fontSize="11"
            fontFamily="var(--font-mono), monospace"
            letterSpacing="1"
          >
            RECEITA
          </text>
          <rect x={LABEL_X} y={profitLabelY - 1} width="9" height="2" fill={TEAL} />
          <text
            x={LABEL_X + 14}
            y={profitLabelY + 3}
            fill={INK}
            fontSize="11"
            fontFamily="var(--font-mono), monospace"
            letterSpacing="1"
          >
            RESULTADO
          </text>
        </g>
        )}
        {points.map((p, i) => (
          <g key={p.date}>
            {/* O último dia sempre aparece; o rótulo periódico cede a vez
                quando cairia colado nele. */}
            {(count <= 7 ||
              i === count - 1 ||
              (i % 5 === 0 && i < count - 2)) && (
              <text
                x={x(i)}
                y="203"
                textAnchor="middle"
                fontSize="11"
                fill={AXIS}
                fontFamily="var(--font-mono), monospace"
              >
                {p.date.slice(8)}/{p.date.slice(5, 7)}
              </text>
            )}
            <rect
              x={x(i) - band / 2}
              y="18"
              width={band}
              height="167"
              fill="transparent"
              onMouseEnter={() => setHover(i)}
            />
          </g>
        ))}
        {/* Fio-guia e leitura do ponto sob o cursor. */}
        {selected && (
          <g pointerEvents="none">
            <line
              x1={x(hover!)}
              x2={x(hover!)}
              y1="20"
              y2="180"
              stroke={INK}
              strokeOpacity=".3"
              strokeDasharray="3 4"
            />
            <circle
              cx={x(hover!)}
              cy={y(selected.profit)}
              r="4"
              fill={TEAL}
              stroke="#fff"
              strokeWidth="2"
            />
            <circle
              cx={x(hover!)}
              cy={y(selected.revenue)}
              r="4"
              fill={RED}
              stroke="#fff"
              strokeWidth="2"
            />
            <g
              transform={`translate(${flip ? x(hover!) - tipWidth - 12 : x(hover!) + 12}, 24)`}
            >
              <rect
                width={tipWidth}
                height="62"
                fill="#14161a"
                fillOpacity=".95"
              />
              {tipLines.map((line, i) => (
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
          </g>
        )}
      </svg>
    </div>
  );
}
