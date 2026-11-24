// Grouped horizontal bar chart comparing three inference modes across three metrics.
// Pure SVG — no chart library. viewBox scales to any container width.

function safePct(num, den) {
  if (num == null || !den || den === 0) return 0;
  return Math.round((num / den) * 100);
}

const MODE_CFG = [
  { key: 'aiOnly',  label: 'AI only',       color: '#94a3b8', bold: false },
  { key: 'rulesAi', label: 'Rules + AI ★',  color: '#2563eb', bold: true  },
  { key: 'cloud',   label: 'Cloud',          color: '#059669', bold: false },
];

const METRICS = [
  { id: 'accuracy',      title: 'ACCURACY',        get: (m) => m?.accuracy ?? 0 },
  { id: 'scamsCaught',   title: 'SCAMS CAUGHT',    get: (m) => safePct(m?.scamsCaught, m?.scamTotal) },
  { id: 'falseAlarms',   title: 'FALSE ALARMS ↓',  get: (m) => safePct(m?.falseAlarms, m?.safeTotal) },
];

export default function ComparisonChart({ modes }) {
  if (!modes) return null;

  // ── Layout constants ───────────────────────────────────────────────────────
  const LX     = 94;   // bar start x (mode label area ends here)
  const BW     = 230;  // bar max width = 100%
  const BH     = 18;   // bar height
  const BG     = 7;    // gap between bars in a group
  const MH     = 22;   // metric header height (above first bar in group)
  const GG     = 20;   // gap between metric groups
  const PAD_B  = 6;    // bottom padding
  const PAD_T  = 4;    // top padding

  const groupH   = MH + MODE_CFG.length * (BH + BG) - BG;  // 22 + 3*25 - 7 = 90
  const totalH   = PAD_T + METRICS.length * groupH + (METRICS.length - 1) * GG + PAD_B;
  const totalW   = LX + BW + 52; // 52 for value label area

  return (
    <figure style={{ margin: 0 }}>
      <svg
        viewBox={`0 0 ${totalW} ${totalH}`}
        style={{ width: '100%', height: 'auto' }}
        role="img"
        aria-label="Grouped horizontal bar chart: accuracy, scams caught, and false alarms for AI only, Rules and AI, and Cloud modes"
      >
        {METRICS.map((metric, gi) => {
          const gy = PAD_T + gi * (groupH + GG);

          return (
            <g key={metric.id} role="group" aria-label={metric.title}>
              {/* Metric label */}
              <text
                x={LX}
                y={gy + 13}
                fontSize={9.5}
                fontWeight={700}
                fill="#9ca3af"
                letterSpacing={0.8}
              >
                {metric.title}
              </text>

              {MODE_CFG.map((m, bi) => {
                const val    = metric.get(modes[m.key]);
                const barW   = Math.round((val / 100) * BW);
                const by     = gy + MH + bi * (BH + BG);
                const hasData = modes[m.key] != null;

                return (
                  <g key={m.key}>
                    {/* Mode label */}
                    <text
                      x={LX - 7}
                      y={by + BH / 2 + 4}
                      textAnchor="end"
                      fontSize={11}
                      fill={m.bold ? '#1d4ed8' : '#6b7280'}
                      fontWeight={m.bold ? 700 : 400}
                    >
                      {m.label}
                    </text>

                    {/* Track */}
                    <rect x={LX} y={by} width={BW} height={BH} fill="#f1f5f9" rx={3} />

                    {hasData ? (
                      <>
                        {barW > 0 && (
                          <rect
                            x={LX}
                            y={by}
                            width={barW}
                            height={BH}
                            fill={m.color}
                            rx={3}
                            opacity={m.bold ? 1 : 0.72}
                          />
                        )}
                        <text
                          x={LX + Math.max(barW + 5, 5)}
                          y={by + BH / 2 + 4}
                          fontSize={11}
                          fill={m.bold ? '#1d4ed8' : '#374151'}
                          fontWeight={m.bold ? 700 : 400}
                        >
                          {val}%
                        </text>
                      </>
                    ) : (
                      <text x={LX + 5} y={by + BH / 2 + 4} fontSize={11} fill="#9ca3af">—</text>
                    )}
                  </g>
                );
              })}
            </g>
          );
        })}
      </svg>
      <figcaption style={{ fontSize: '0.72rem', color: '#9ca3af', marginTop: 4 }}>
        ↓ = lower is better for False alarms.&nbsp;&nbsp;★ = Rules + AI, our primary design.
      </figcaption>
    </figure>
  );
}
