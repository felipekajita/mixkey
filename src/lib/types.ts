export type Camelot = string; // "8A", "11B" ...

export interface SourceReading {
  source: string;          // id da fonte (ex: "essentia", "reccobeats", "tags")
  label: string;           // nome amigável
  key?: Camelot;
  bpm?: number;
  coverUrl?: string;
  url?: string;            // link para a página da faixa na fonte
  matchScore?: number;     // 0..1 similaridade do nome encontrado
  matchedTitle?: string;
  matchedArtist?: string;
  durationSec?: number;
  isrc?: string;
  previewUrl?: string;
  genres?: string[];
  energy?: number;        // 1..10
  note?: string;          // detalhe exibido (ex.: "identificada por ISRC")
  weight?: number;        // multiplicador do peso na votação (ex.: escuta acelerada pesa menos)
  error?: string;
}

export type Confidence = "high" | "medium" | "low" | "none";

export interface Track {
  id: string;
  title: string;
  artist: string;
  version?: string;        // "Extended Mix", "Original Mix"...
  durationSec?: number;
  key?: Camelot;
  bpm?: number;
  energy?: number;         // 1..10
  coverUrl?: string;
  previewUrl?: string;
  genres?: string[];
  isrc?: string;
  fileName?: string;       // nome do arquivo local (para M3U8)
  filePath?: string;       // caminho completo, quando conhecido (ex.: biblioteca do Mixxx)
  origin: "audio" | "list" | "suggestion";
  readings: SourceReading[];
  keyConfidence: Confidence;
  bpmConfidence: Confidence;
  manualKey?: boolean;
  manualBpm?: boolean;
  bpmNote?: string;        // explicação quando o BPM foi corrigido (meio/dobro tempo)
  manualEnergy?: boolean;
  status: "pending" | "analyzing" | "looking-up" | "done" | "error";
  statusText?: string;
  // métricas de áudio (análise local)
  loudness?: number;
  danceability?: number;
}

export interface LookupQuery {
  title: string;
  artist: string;
  version?: string;
  durationSec?: number;
  isrc?: string;
  spotifyId?: string;
}
