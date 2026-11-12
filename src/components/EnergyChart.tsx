"use client";
import { ResponsiveContainer, ComposedChart, Area, Line, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";
import type { Track } from "@/lib/types";

export default function EnergyChart({ tracks, targets }: { tracks: Track[]; targets: number[] }) {
  const data = tracks.map((t, i) => ({ i: i + 1, alvo: targets[i], energia: t.energy, bpm: t.bpm, name: t.title }));
  return (
    <div className="h-56 w-full">
      <ResponsiveContainer>
        <ComposedChart data={data} margin={{ top: 8, right: 8, left: -24, bottom: 0 }}>
          <defs>
            <linearGradient id="en" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="rgb(var(--accent))" stopOpacity={0.5} /><stop offset="1" stopColor="rgb(var(--accent))" stopOpacity={0} /></linearGradient>
          </defs>
          <CartesianGrid stroke="rgb(var(--line))" strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="i" tick={{ fill: "rgb(var(--muted))", fontSize: 11 }} tickLine={false} axisLine={false} />
          <YAxis domain={[0, 10]} tick={{ fill: "rgb(var(--muted))", fontSize: 11 }} tickLine={false} axisLine={false} />
          <Tooltip
            contentStyle={{ background: "rgb(var(--panel))", border: "1px solid rgb(var(--line))", borderRadius: 12, fontSize: 12 }}
            labelFormatter={(_l, p) => (p?.[0]?.payload ? `${p[0].payload.i}. ${p[0].payload.name} · ${p[0].payload.bpm ?? "?"} BPM` : "")}
          />
          <Area type="monotone" dataKey="energia" name="Energia da faixa" stroke="rgb(var(--accent))" fill="url(#en)" strokeWidth={2.5} dot={{ r: 3 }} />
          <Line type="monotone" dataKey="alvo" name="Curva-alvo (vibe)" stroke="rgb(var(--accent2))" strokeDasharray="5 4" dot={false} strokeWidth={2} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
