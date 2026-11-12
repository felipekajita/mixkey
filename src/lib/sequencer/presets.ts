export interface VibePreset {
  id: string;
  name: string;
  emoji: string;
  description: string;
  situations: string;
  curve: [number, number][]; // (posição 0..1, energia relativa 0..1)
  energyWeight?: number;
}

export const VIBES: VibePreset[] = [
  {
    id: "journey", name: "Jornada clássica", emoji: "🎢",
    description: "Começo leve, sequência mais alegre, clímax perto do fim e desfecho suave.",
    situations: "Sets de 1–3 h, festas completas, quando você é o único DJ da noite.",
    curve: [[0, 0.2], [0.25, 0.45], [0.5, 0.65], [0.75, 0.92], [0.87, 1], [1, 0.5]],
  },
  {
    id: "warmup", name: "Warm-up / Abertura", emoji: "🌅",
    description: "Sobe devagar e de forma constante, sem roubar o clímax de quem toca depois.",
    situations: "Abrir a pista, início de festa, antes do headliner.",
    curve: [[0, 0.1], [0.5, 0.35], [1, 0.62]],
  },
  {
    id: "peak", name: "Peak time", emoji: "🔥",
    description: "Começa médio-alto e se mantém intenso, com picos frequentes.",
    situations: "Horário nobre, pista cheia, sets curtos de headliner.",
    curve: [[0, 0.6], [0.3, 0.82], [0.55, 0.9], [0.8, 1], [1, 0.95]],
  },
  {
    id: "buildup", name: "Até o clímax", emoji: "🚀",
    description: "Subida contínua de energia que termina no ponto mais alto.",
    situations: "Sets que terminam em contagem regressiva, virada de ano, encerramento de festival.",
    curve: [[0, 0.15], [0.5, 0.55], [1, 1]],
  },
  {
    id: "sunset", name: "Sunset / After", emoji: "🌇",
    description: "Começa animado e vai baixando até um final relaxado e melódico.",
    situations: "Pôr do sol, after-party, fechamento de noite, transição para o chill.",
    curve: [[0, 0.75], [0.25, 0.9], [0.6, 0.55], [1, 0.12]],
  },
  {
    id: "rollercoaster", name: "Montanha-russa", emoji: "🎡",
    description: "Ondas de tensão e alívio: sobe, respira, sobe mais alto.",
    situations: "Sets longos, pistas ecléticas, manter a pista surpreendida.",
    curve: [[0, 0.3], [0.2, 0.75], [0.33, 0.4], [0.55, 0.88], [0.68, 0.5], [0.88, 1], [1, 0.6]],
  },
  {
    id: "esquenta", name: "Esquenta / Pré-festa", emoji: "🍹",
    description: "Clima social que vai animando aos poucos e termina pra cima.",
    situations: "Pré-festa, churrasco, bar, aniversário.",
    curve: [[0, 0.25], [0.6, 0.55], [1, 0.85]],
  },
  {
    id: "lounge", name: "Lounge / Fundo", emoji: "🛋️",
    description: "Energia baixa e estável, transições suaves sem picos.",
    situations: "Jantar, café, loja, evento corporativo, música ambiente.",
    curve: [[0, 0.15], [0.5, 0.35], [1, 0.25]],
  },
  {
    id: "harmonic", name: "Fluxo harmônico puro", emoji: "🎹",
    description: "Ignora a curva de energia e prioriza as transições mais perfeitas de tom e BPM.",
    situations: "Quando você quer só a melhor ordem técnica (Mix in Key).",
    curve: [[0, 0.5], [1, 0.5]],
    energyWeight: 0,
  },
];

export const ENDINGS = [
  { id: "default", name: "Padrão da vibe", description: "Usa o final definido pela vibe escolhida." },
  { id: "peak", name: "No clímax", description: "Termina no ponto mais alto de energia." },
  { id: "high", name: "Animado", description: "Final pra cima, mas sem ser o pico absoluto." },
  { id: "soft", name: "Mais leve", description: "Desce a energia nas últimas faixas." },
  { id: "chill", name: "Bem suave", description: "Encerramento calmo e melódico, ideal para fechar a noite." },
] as const;

export type EndingId = (typeof ENDINGS)[number]["id"];

const ENDING_VALUE: Record<EndingId, number | null> = { default: null, peak: 1, high: 0.82, soft: 0.4, chill: 0.12 };

function interp(curve: [number, number][], t: number) {
  for (let i = 1; i < curve.length; i++) {
    const [x1, y1] = curve[i];
    const [x0, y0] = curve[i - 1];
    if (t <= x1) return y0 + ((y1 - y0) * (t - x0)) / Math.max(1e-9, x1 - x0);
  }
  return curve[curve.length - 1][1];
}

/** Curva-alvo (0..1) considerando o final escolhido */
export function targetCurve(vibe: VibePreset, ending: EndingId): (t: number) => number {
  const end = ENDING_VALUE[ending];
  return (t: number) => {
    const base = interp(vibe.curve, t);
    if (end == null || t < 0.7) return base;
    const w = (t - 0.7) / 0.3;
    const smooth = w * w * (3 - 2 * w);
    return base * (1 - smooth) + end * smooth;
  };
}
