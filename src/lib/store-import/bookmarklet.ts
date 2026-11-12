import { extractStoreTracks } from "./extract";

/**
 * Gera o código do favorito ("bookmarklet"). Ao ser clicado numa página do Beatport, lê os dados
 * ATUAIS da página — busca o HTML da própria URL (mesma origem, na sessão do usuário), porque o
 * script __NEXT_DATA__ do documento fica com os dados da primeira página quando se navega dentro
 * do site — e abre o MixKey com as faixas (ou copia para a área de transferência).
 */
export function makeBookmarklet(appOrigin: string): string {
  const body = `(function(){
var extract=${extractStoreTracks.toString()};
function done(nd,tt){try{
var r=extract(document,location.href,nd);
if(!r.tracks.length){alert(r.pageType==="track"?"MixKey: não encontrei esta faixa nos dados da página. Recarregue a página do Beatport (F5) e clique de novo.":"MixKey: nenhuma faixa com BPM/key encontrada nesta página. Abra uma página de faixa, release, chart, playlist ou busca do Beatport.");return;}
var payload=JSON.stringify({mixkey:"store",v:2,store:r.store,page:tt||r.page,url:location.href,pageType:r.pageType,pageId:r.pageId,tracks:r.tracks});
var b64=btoa(unescape(encodeURIComponent(payload)));
try{navigator.clipboard&&navigator.clipboard.writeText(payload);}catch(e){}
var w=window.open(${JSON.stringify(appOrigin)}+"/#mk-store="+encodeURIComponent(b64),"mixkey");
if(!w){alert("MixKey: "+r.tracks.length+" faixa(s) copiadas. Abra o MixKey e cole na aba Colar.");}
}catch(e){alert("MixKey: não foi possível ler esta página ("+e.message+")");}}
fetch(location.href,{credentials:"include"}).then(function(x){return x.text();}).then(function(h){var m=h.match(/<script id="__NEXT_DATA__"[^>]*>([\\s\\S]*?)<\\/script>/);var t=h.match(/<title>([^<]*)<\\/title>/);done(m?m[1]:null,t?t[1]:null);}).catch(function(){done(null,null);});
})();`;
  return "javascript:" + encodeURIComponent(body);
}
