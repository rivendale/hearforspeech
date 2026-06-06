import type { SessionLog } from '../db/database';

interface ProgressChartProps {
  logs: SessionLog[];
}

export function ProgressChart({ logs }: ProgressChartProps) {
  if (logs.length === 0) return null;

  const points = logs.slice(-6);

  return (
    <div className="bg-slate-800 border border-slate-700/80 p-5 rounded-3xl shadow-xl space-y-4">
      <h4 className="text-xs font-bold text-slate-400 tracking-widest uppercase block border-b border-slate-700/50 pb-2 text-left">
        Longitudinal Intelligibility Progress
      </h4>
      
      <div className="relative w-full h-[200px]">
        <svg viewBox="0 0 400 200" className="w-full h-full">
          {/* Grid Lines */}
          {[25, 50, 75, 100].map((level) => {
            const y = 170 - (level / 100) * 145;
            return (
              <g key={level}>
                <line 
                  x1="45" 
                  y1={y} 
                  x2="385" 
                  y2={y} 
                  stroke="#334155" 
                  strokeDasharray="4 4" 
                  strokeWidth="1" 
                />
                <text 
                  x="10" 
                  y={y + 3} 
                  fill="#64748b" 
                  className="text-[9px] font-bold font-mono"
                >
                  {level}%
                </text>
              </g>
            );
          })}

          {/* X Axis Date labels */}
          {(() => {
            return points.map((log, idx) => {
              const x = 45 + (points.length > 1 ? (idx * 340) / (points.length - 1) : 170);
              const dateParts = log.date.split(',')[0].split('/');
              const displayDate = dateParts[0] && dateParts[1] ? `${dateParts[0]}/${dateParts[1]}` : dateParts[0];
              return (
                <text
                  key={log.id ?? idx}
                  x={x}
                  y="188"
                  fill="#64748b"
                  textAnchor="middle"
                  className="text-[8px] font-bold font-mono"
                >
                  {displayDate}
                </text>
              );
            });
          })()}

          {/* Draw PCC Path */}
          {(() => {
            if (points.length === 0) return null;
            const pathD = points.map((log, idx) => {
              const x = 45 + (points.length > 1 ? (idx * 340) / (points.length - 1) : 170);
              const y = 170 - (log.pcc / 100) * 145;
              return `${idx === 0 ? 'M' : 'L'} ${x} ${y}`;
            }).join(' ');

            return (
              <>
                <path
                  d={pathD}
                  fill="none"
                  stroke="#6366f1"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                {points.map((log, idx) => {
                  const x = 45 + (points.length > 1 ? (idx * 340) / (points.length - 1) : 170);
                  const y = 170 - (log.pcc / 100) * 145;
                  return (
                    <g key={log.id ?? idx}>
                      <circle
                        cx={x}
                        cy={y}
                        r="5"
                        fill="#0f172a"
                        stroke="#6366f1"
                        strokeWidth="2"
                      />
                      <circle
                        cx={x}
                        cy={y}
                        r="2"
                        fill="#6366f1"
                      />
                    </g>
                  );
                })}
              </>
            );
          })()}

          {/* Draw Listener Check Path (only for logs with naiveListenerScore) */}
          {(() => {
            const naivePoints = points
              .map((log, idx) => ({
                id: log.id ?? idx,
                x: 45 + (points.length > 1 ? (idx * 340) / (points.length - 1) : 170),
                score: log.naiveListenerScore
              }))
              .filter(p => p.score !== undefined);

            if (naivePoints.length === 0) return null;

            const pathD = naivePoints.map((p, idx) => {
              const y = 170 - (p.score! / 100) * 145;
              return `${idx === 0 ? 'M' : 'L'} ${p.x} ${y}`;
            }).join(' ');

            return (
              <>
                <path
                  d={pathD}
                  fill="none"
                  stroke="#10b981"
                  strokeWidth="2"
                  strokeDasharray="3 3"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                {naivePoints.map((p) => {
                  const y = 170 - (p.score! / 100) * 145;
                  return (
                    <g key={p.id}>
                      <circle
                        cx={p.x}
                        cy={y}
                        r="4"
                        fill="#0f172a"
                        stroke="#10b981"
                        strokeWidth="2"
                      />
                      <circle
                        cx={p.x}
                        cy={y}
                        r="1.5"
                        fill="#10b981"
                      />
                    </g>
                  );
                })}
              </>
            );
          })()}
        </svg>
      </div>

      {/* Legend */}
      <div className="flex justify-center gap-5 text-[9px] font-bold uppercase tracking-wider pt-1 border-t border-slate-700/50">
        <div className="flex items-center gap-1.5 text-indigo-400">
          <span className="w-2 h-2 rounded-full bg-indigo-500 inline-block" />
          <span>Clinician PCC</span>
        </div>
        <div className="flex items-center gap-1.5 text-emerald-400">
          <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block border border-slate-800" />
          <span>Listener Check</span>
        </div>
      </div>
    </div>
  );
}
