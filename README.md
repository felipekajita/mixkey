# MixKey 🎛️ — sets harmônicos (Camelot + BPM) para Rekordbox

> Dados de BPM/key: [GetSongBPM](https://getsongbpm.com) · ReccoBeats · Deezer · MusicBrainz

Envie **arquivos de áudio**, uma **lista/planilha** ou **cole um texto** com faixas. O MixKey:

1. Identifica **key (Camelot)** e **BPM** de cada faixa:
   - pelas **tags** do arquivo (TKEY/TBPM gravados pelo Rekordbox ou Mixed In Key);
   - pela **análise do áudio no navegador** (Essentia.js — os arquivos nunca saem do seu computador);
   - pela **análise da prévia de 30 s** (Deezer) das faixas que vieram de uma lista;
   - por **cruzamento com plataformas**: ReccoBeats (via Spotify), GetSongBPM/GetSongKey, Beatport, Tunebat, Deezer…
   - O resultado final é decidido por **votação**. Cada valor vem com um indicador de confiança (🟢🟡🔴) e a lista "fonte → valor".
2. Busca as **capas** (tags, Deezer, Spotify, Apple Music, Beatport, Tunebat, YouTube Music, Last.fm, MusicBrainz e Google Imagens). Um resultado só é aceito quando o **nome confere** (título + artista; remix ≠ original).
3. Sugere **várias sequências** (Set A/B/C) que respeitam a roda Camelot, a tolerância de pitch e a **curva de energia** da vibe escolhida:
   - **Vibes:** Jornada clássica, Warm-up, Peak time, Até o clímax, Sunset/After, Montanha-russa, Esquenta, Lounge e Fluxo harmônico puro;
   - **Final do set:** no clímax, animado, mais leve ou bem suave.
4. Mostra o set de forma visual: timeline com as transições (✓ mesmo tom, ↕ relativa, ⚡ boost, ⚠ conflito), dicas de mixagem, gráfico de energia, caminho na roda Camelot, grade de capas e **modo cabine** em tela cheia para usar ao vivo.
5. Exporta **M3U8** para o Rekordbox, além de CSV e texto. Sugere **faixas dos mesmos artistas ou de artistas parecidos**, com prévia e nota de compatibilidade.

## Rodar localmente

```bash
npm install
cp .env.example .env.local   # opcional: coloque suas chaves
npm run dev                  # http://localhost:3000
npm test                     # testes unitários
```

## Deploy na Vercel

1. Suba este projeto para um repositório no GitHub (**público**, por causa da licença AGPL do Essentia.js).
2. Em vercel.com → **Add New → Project**, importe o repositório (o framework Next.js é detectado sozinho).
3. Em **Settings → Environment Variables**, cadastre as chaves do `.env.example` e o `NEXT_PUBLIC_SOURCE_URL` (link do repositório).
4. Faça o deploy.

## Fontes e chaves

| Fonte | Chave | Fornece |
|---|---|---|
| Essentia.js (navegador) | — | key, BPM, energia |
| Deezer | — | capa, prévia de 30 s (analisada pelo Essentia), artistas relacionados |
| Apple Music (iTunes Search) | — | capa em alta |
| MusicBrainz + Cover Art Archive | — | capa, ISRC |
| YouTube Music (site) | — | capa |
| Spotify | `SPOTIFY_CLIENT_ID/SECRET` | capa, ISRC, **habilita a ReccoBeats** |
| ReccoBeats | (usa o Spotify) | **key, BPM, energia** |
| GetSongBPM / GetSongKey | `GETSONGBPM_API_KEY` | key, BPM |
| Last.fm | `LASTFM_API_KEY` | faixas similares, gêneros |
| Google Imagens | `GOOGLE_CSE_KEY` + `GOOGLE_CSE_CX` | capa (último recurso) |
| Tunebat, GetSongKey (site), Beatport | — (scraping) | key, BPM, capa — *ver observação* |

**Observações:**
- Tunebat, GetSongKey e Beatport usam proteção anti-robô (Cloudflare) e normalmente recusam consultas automáticas. Os scrapers tentam e, se forem bloqueados, a fonte aparece como "Bloqueado". Cada faixa tem links para **verificar manualmente** nesses sites, além de VocalRemover, LANDR e Ghost Production, que só analisam arquivos enviados e não têm busca.
- Recomendação: **crie a chave do Spotify**. Ela é gratuita e libera a ReccoBeats, a fonte online mais completa de key/BPM.

## Importar no Rekordbox

Na tela **Sequências → Exportar**, informe a pasta onde estão suas músicas e baixe o `.m3u8`. No Rekordbox, use **Arquivo → Importar → Importar playlist** ou arraste o arquivo para "Playlists". Faixas que vieram de lista (sem arquivo) recebem o nome `Artista - Título.mp3`; use **Relocate** no Rekordbox, se for preciso.

## Formatos aceitos

- **Áudio:** MP3, WAV, FLAC, AIFF, M4A/AAC, OGG, OPUS (o navegador precisa conseguir decodificar o formato; o Safari não decodifica OGG, por exemplo).
- **Listas:** TXT, CSV, TSV, XLSX/XLS/ODS, M3U/M3U8, XML do Rekordbox, JSON e texto colado. O cabeçalho pode estar em português ou inglês; sem cabeçalho, as colunas são detectadas pelo conteúdo.
- **Notação de key:** `8A`, `Am`, `A minor`, `Lá menor`, `A♭m`, `G#m`, Open Key `1m`/`1d`.

## Créditos

- Dados de BPM e key fornecidos por [GetSongBPM](https://getsongbpm.com).
- Análise de áudio: [Essentia.js](https://mtg.github.io/essentia.js/).
- Metadados e capas: Deezer, MusicBrainz / Cover Art Archive, Apple Music, Spotify, ReccoBeats, Last.fm.

## Licença

Este projeto usa o [Essentia.js](https://mtg.github.io/essentia.js/) (AGPL-3.0). Ao publicar o site, mantenha o código-fonte disponível.
