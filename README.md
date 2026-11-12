# MixKey 🎛️ — sets harmônicos (Camelot + BPM) para Rekordbox

Envie **arquivos de áudio**, uma **lista/planilha**, **cole um texto** ou **cole links** (Spotify, Deezer, Apple Music, YouTube, YouTube Music, SoundCloud…). O MixKey:

1. Identifica **key (Camelot)** e **BPM** de cada faixa:
   - pelas **tags** do arquivo (TKEY/TBPM gravados pelo Rekordbox ou Mixed In Key);
   - pela **IA de key [OpenKeyScan](https://github.com/rekordcloud/openkeyscan-analyzer)** (rede neural treinada com música eletrônica, rodando no navegador), como segunda opinião independente;
   - pela **análise do áudio no navegador** (Essentia.js, os arquivos nunca saem do seu computador), na **faixa inteira**: 3 trechos (início, meio e fim) analisados e comparados;
   - pela **análise de até 3 prévias de 30 s de plataformas diferentes** (Deezer, Apple Music, Spotify) das faixas que vieram de lista ou link;
   - pela **ReccoBeats** (sem chave), encontrada pelo ID do Spotify do link, pelo **ISRC** (código único da gravação, vindo do Deezer, MusicBrainz ou Spotify) ou por busca de nome;
   - O resultado final é decidido por **votação**. Cada valor vem com um indicador de confiança (🟢🟡🔴) e a lista "fonte → valor".
2. Busca as **capas** (tags, Deezer, Spotify, Apple Music, YouTube Music, Last.fm e MusicBrainz). Um resultado só é aceito quando o **nome confere** (título + artista; remix ≠ original).
3. Sugere **várias sequências** (Set A/B/C) que respeitam a roda Camelot, a tolerância de pitch e a **curva de energia** da vibe escolhida:
   - **Vibes:** Jornada clássica, Warm-up, Peak time, Até o clímax, Sunset/After, Montanha-russa, Esquenta, Lounge e Fluxo harmônico puro;
   - **Final do set:** no clímax, animado, mais leve ou bem suave.
4. Mostra o set de forma visual: timeline com as transições (✓ mesmo tom, ↕ relativa, ⚡ boost, ⚠ conflito), dicas de mixagem, gráfico de energia, caminho na roda Camelot, grade de capas e **modo cabine** em tela cheia para usar ao vivo.
5. Exporta **XML do Rekordbox** (playlist já com BPM, tom e dica de transição em cada faixa) e **M3U8**, além de CSV e texto, sempre no formato "Título - Artista". Sugere **faixas dos mesmos artistas ou de artistas parecidos**, com prévia e nota de compatibilidade.

## Colar links

Na aba **Links**, cole um link por linha. Também dá para colar links na aba **Colar** ou arrastá-los para a tela.

| Plataforma | Faixa | Álbum | Playlist |
|---|---|---|---|
| Spotify (também `spotify:track:…` e `spotify.link`) | ✅ | ✅ | ✅ até 50 faixas sem chave; inteira com a chave da API |
| Deezer (também `link.deezer.com`) | ✅ | ✅ | ✅ (públicas) |
| Apple Music | ✅ | ✅ | ✅ |
| YouTube / YouTube Music / youtu.be | ✅ (limpa "Official Video" etc.) | ✅ (álbuns `OLAK5uy_…`) | ✅ primeiras ~100 faixas (mixes automáticos "RD…" não) |
| SoundCloud | ✅ | — | ❌ só o nome do set |
| Beatport | ⚠️ só o título (o site bloqueia leitura automática) | — | — |
| Tidal, Bandcamp, Shazam e outros | ⚠️ pelas meta tags da página, quando disponíveis | | |
| Amazon Music | ❌ a página não expõe os dados — cole o nome | | |

As faixas lidas dos links passam pelo mesmo cruzamento de fontes e pela análise da prévia para obter key/BPM.

## Dados oficiais do Beatport (favorito "→ MixKey")

O Beatport bloqueia leitura automática, então o MixKey não consulta o site sozinho. Para trazer os dados oficiais (BPM, key, gênero, selo, ISRC e capa em alta), use o favorito:
1. Na aba **Links**, arraste o botão **→ MixKey** para a barra de favoritos do navegador.
2. Abra no Beatport uma página de faixa, release, chart, playlist ou busca.
3. Clique no favorito. O MixKey abre com as faixas da página para você confirmar.

Faixas que já estão na biblioteca ganham os dados do Beatport como fonte "Lojas oficiais", que tem peso alto na votação. As demais são adicionadas. Nos detalhes da faixa, o **Comparativo** mostra lado a lado a análise do MixKey, as plataformas, as lojas oficiais e os seus dados.

## Ouvir e analisar (música completa)

Para faixas que só existem online, como no YouTube, abra os detalhes da faixa e clique em **🎧 Ouvir e analisar**. Você toca a música e o MixKey escuta por 60 a 120 s, analisa vários trechos e adiciona o resultado como uma fonte "Escuta ao vivo", que entra na votação e no Comparativo.

- **Aba do navegador** (recomendado; Chrome ou Edge no computador): toque a música em outra aba, clique em Começar, escolha a aba e marque "Compartilhar áudio da aba".
- **Microfone** (qualquer navegador, inclusive celular): para música tocando em caixa de som, vinil etc. Tem um pouco mais de ruído, por isso pesa menos na votação.

**Mais rápido com música acelerada:** acelere no player do YouTube (⚙ → Velocidade) e informe a velocidade no MixKey (1,25×, 1,5× ou 2×). O YouTube acelera sem mudar o tom, então a key continua certa, e o MixKey divide o BPM medido pela velocidade. Ex.: 90 s de música a 1,5× levam 60 s. Para house/techno, use até 1,5×; 2× só para faixas até ~100 BPM. Escutas aceleradas pesam um pouco menos na votação (1,5× −10%, 2× −20%).

O áudio não é gravado nem enviado: a análise acontece no seu navegador, e as amostras são descartadas logo em seguida.

## Biblioteca do Mixxx

Na aba **Lista**, envie o arquivo `mixxxdb.sqlite` do Mixxx:
- Windows: `%LOCALAPPDATA%\Mixxx\mixxxdb.sqlite`
- macOS: `~/Library/Containers/org.mixxx.mixxx/Data/Library/Application Support/Mixxx/mixxxdb.sqlite` (ou `~/Library/Application Support/Mixxx/`)
- Linux: `~/.mixxx/mixxxdb.sqlite`

Dá para importar a biblioteca inteira ou só uma playlist ou crate. BPM e key vêm da análise do Mixxx e entram como fonte "Seus dados". Os caminhos dos arquivos são mantidos, então o M3U8 e o XML exportados já apontam para os arquivos certos. O arquivo é lido no navegador e não é enviado.

## Planilhas: mapeamento de colunas

Ao importar CSV/XLSX ou colar células de planilha, o MixKey detecta sozinho o que é título, artista, key, BPM e duração. Na pré-visualização, cada coluna tem um seletor para corrigir a detecção. Também dá para marcar ou desmarcar "Primeira linha é cabeçalho".

## Backup

A biblioteca e os sets ficam salvos no navegador. No botão **Backup** (no topo), baixe um `.json` com tudo: faixas analisadas, sets salvos e preferências. Para restaurar em outro navegador ou computador, use o mesmo botão; dá para **juntar** sem duplicar ou **substituir** tudo. Os arquivos de áudio não entram no backup.

## Cache de buscas

Os dados buscados nas plataformas e a análise das prévias de 30 s ficam guardados no navegador por 30 dias. Faixas repetidas, playlists reimportadas e backups restaurados aparecem na hora, sem consultar Deezer, Spotify, Apple Music etc. de novo. **Buscar novamente**, nos detalhes da faixa, ignora o cache. Para ver o tamanho do cache ou limpá-lo, use o botão **Backup**.

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
| Spotify | `SPOTIFY_CLIENT_ID/SECRET` | capa, ISRC, playlists inteiras, busca extra para a ReccoBeats |
| ReccoBeats | — | **key, BPM, energia** (por ID do Spotify, ISRC ou nome) |
| SongBPM (songbpm.com) | — | key, BPM (dados do Spotify; confirma a ReccoBeats) |
| Last.fm | `LASTFM_API_KEY` | faixas similares, gêneros |

**Observações:**
- Cada faixa tem links para **verificar manualmente** a key/BPM no VocalRemover, LANDR e Ghost Production (que analisam o arquivo enviado), além de links de busca nas plataformas de streaming.
- As análises de áudio usam o mesmo detector e às vezes erram juntas em meio tempo. Por isso, na escolha entre meio e dobro tempo, elas pesam menos que o BPM de catálogo (ReccoBeats, Deezer, tags).
- **Buscar novamente** (nos detalhes da faixa) ignora o cache e descarta as edições manuais. Para desfazer só uma edição, use "↺ Automático" na key ou o ↺ ao lado do campo editado.

## Importar no Rekordbox

Na tela **Sequências → Exportar**, informe a pasta onde estão suas músicas.

**XML do Rekordbox (recomendado):** cria a playlist na ordem do set, já com BPM, tom e um comentário em cada faixa (posição no set e dica da próxima transição).
1. Baixe o `.xml`.
2. No Rekordbox, vá em **Preferências → Avançado → Banco de dados → rekordbox xml** e escolha o arquivo.
3. Se a árvore "rekordbox xml" não aparecer na barra lateral, ative em **Preferências → Visualização → Layout**.
4. Abra **rekordbox xml → Playlists**, clique com o botão direito no set e escolha **Importar playlist**.

**M3U8:** só a ordem das faixas. Use **Arquivo → Importar → Importar playlist** ou arraste o arquivo para "Playlists".

Faixas que vieram de lista ou link (sem arquivo) recebem o nome presumido `Título - Artista.mp3`. Se o seu arquivo tiver outro nome, use **Relocate** no Rekordbox.

## BPM

O BPM é sempre arredondado para o inteiro mais próximo.

### Meio ou dobro tempo

Detectores às vezes leem metade ou o dobro do BPM real (ex.: 85 em vez de 171). O MixKey trata leituras ×2/÷2 de fontes diferentes como a mesma e escolhe o valor pelos votos das fontes e pela faixa típica do gênero (house 110–132, techno 122–150, drum and bass 160–180, dubstep 135–155, hip hop 75–115…). Quando o BPM é corrigido, os detalhes da faixa mostram um aviso explicando o ajuste.

## Formatos aceitos

- **Áudio:** MP3, WAV, FLAC, AIFF, M4A/AAC, OGG, OPUS (o navegador precisa conseguir decodificar o formato; o Safari não decodifica OGG, por exemplo).
- **Listas:** TXT, CSV, TSV, XLSX/XLS/ODS, M3U/M3U8, XML do Rekordbox, JSON e texto colado. O cabeçalho pode estar em português ou inglês; sem cabeçalho, as colunas são detectadas pelo conteúdo.
- **Notação de key:** `8A`, `Am`, `A minor`, `Lá menor`, `A♭m`, `G#m`, Open Key `1m`/`1d`.

## Créditos

- [Essentia.js](https://mtg.github.io/essentia.js/) (AGPL-3.0): análise de key/BPM.
- [OpenKeyScan](https://github.com/rekordcloud/openkeyscan-analyzer) (MIT, © 2025 Alexander Sommer), baseado no [MusicalKeyCNN](https://github.com/a1ex90/MusicalKeyCNN): o modelo `openkeyscan3` foi convertido para ONNX (float16) e roda no navegador com [onnxruntime-web](https://onnxruntime.ai/). O espectrograma CQT foi reescrito em TypeScript e verificado contra o `librosa`. A licença está em `public/models/OPENKEYSCAN-LICENSE.txt`.
- [Mixxx](https://github.com/mixxxdj/mixxx): formato da biblioteca (`mixxxdb.sqlite`) e da key (`keys.proto`), usados para importar a biblioteca. Nenhum código do Mixxx foi incorporado.
- [sql.js](https://github.com/sql-js/sql.js) (MIT): leitura do SQLite no navegador.
- Dados: ReccoBeats, SongBPM, Deezer, MusicBrainz/Cover Art Archive, Apple Music, Spotify, Last.fm.

## Licença

Este projeto usa o [Essentia.js](https://mtg.github.io/essentia.js/) (AGPL-3.0). Ao publicar o site, mantenha o código-fonte disponível.
