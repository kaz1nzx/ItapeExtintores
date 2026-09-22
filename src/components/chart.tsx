"use client";
import { useState } from "react";
import { money, daysBefore, summarize, type Store } from "@/lib/domain";
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
  const x = (i: number) => 48 + (i / Math.max(1, count - 1)) * 690;
  const y = (v: number) => 175 - ((v - min) / (max - min)) * 150;
  const revenue = points.map((p, i) => `${x(i)},${y(p.revenue)}`).join(" ");
  const profit = points.map((p, i) => `${x(i)},${y(p.profit)}`).join(" ");
  const selected = hover === null ? null : points[hover];
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
            <stop offset="0%" stopColor="#e65343" stopOpacity=".16" />
            <stop offset="100%" stopColor="#e65343" stopOpacity="0" />
          </linearGradient>
        </defs>
        {[0, 1, 2, 3].map((i) => {
          const value = min + ((max - min) * i) / 3;
          return (
            <g key={i}>
              <line
                x1="48"
                x2="738"
                y1={y(value)}
                y2={y(value)}
                stroke="#e9ebee"
                strokeDasharray="4 5"
              />
              <text x="0" y={y(value) + 4} fill="#92969e" fontSize="10">
                {(value / 100).toFixed(0)}
              </text>
            </g>
          );
        })}
        <polygon
          points={`48,${y(0)} ${revenue} 738,${y(0)}`}
          fill="url(#revenue-fill)"
        />
        <polyline
          points={revenue}
          fill="none"
          stroke="#e65343"
          strokeWidth="2.5"
          strokeLinejoin="round"
        />
        <polyline
          points={profit}
          fill="none"
          stroke="#329887"
          strokeWidth="2"
          strokeLinejoin="round"
        />
        {points.map((p, i) => (
          <g key={p.date}>
            {(count <= 7 || i % 5 === 0 || i === count - 1) && (
              <text
                x={x(i)}
                y="205"
                textAnchor="middle"
                fontSize="10"
                fill="#92969e"
              >
                {p.date.slice(8)}/{p.date.slice(5, 7)}
              </text>
            )}
            <rect
              x={x(i) - 690 / count / 2}
              y="18"
              width={690 / count}
              height="167"
              fill="transparent"
              onMouseEnter={() => setHover(i)}
            />
            <circle
              cx={x(i)}
              cy={y(p.revenue)}
              r={hover === i ? 5 : count <= 7 ? 3 : 0}
              fill="#e65343"
              stroke="white"
              strokeWidth="2"
            />
          </g>
        ))}
      </svg>
    </div>
  );
}
