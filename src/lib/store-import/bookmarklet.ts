import { extractStoreTracks } from "./extract";

/**
 * Gera o código do favorito ("bookmarklet"). Ao ser clicado numa página do Beatport,
 * lê as faixas da página aberta e abre o MixKey com elas (ou copia para a área de transferência).
 */
export function makeBookmarklet(appOrigin: string): string {
  const body = `(function(){try{
var extract=${extractStoreTracks.toString()};
var r=extract(document,location.href);
if(!r.tracks.length){alert("MixKey: nenhuma faixa com BPM/key encontrada nesta página. Abra uma página de faixa, release, chart, playlist ou busca do Beatport.");return;}
var payload=JSON.stringify({mixkey:"store",v:1,store:r.store,page:r.page,url:location.href,tracks:r.tracks});
var b64=btoa(unescape(encodeURIComponent(payload)));
try{navigator.clipboard&&navigator.clipboard.writeText(payload);}catch(e){}
var w=window.open(${JSON.stringify(appOrigin)}+"/#mk-store="+encodeURIComponent(b64),"mixkey");
if(!w){alert("MixKey: "+r.tracks.length+" faixa(s) copiadas. Abra o MixKey e cole na aba Colar.");}
}catch(e){alert("MixKey: não foi possível ler esta página ("+e.message+")");}})();`;
  return "javascript:" + encodeURIComponent(body);
}
