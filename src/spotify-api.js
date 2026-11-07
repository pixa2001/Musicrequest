import {SPOTIFY_CLIENT_ID,SPOTIFY_REDIRECT_URI} from "./spotify-config.js";
const SETTINGS="musicrequest.spotify.settings",SESSION="musicrequest.spotify.session",PENDING="musicrequest.spotify.pkce";
let refreshing=null,epoch=0;
const read=key=>{try{return JSON.parse(sessionStorage.getItem(key)||"null");}catch{return null;}};
export function settings(){
 let local={};try{local=JSON.parse(localStorage.getItem(SETTINGS)||"{}");}catch{}
 return {clientId:SPOTIFY_CLIENT_ID||local.clientId||"",redirectUri:SPOTIFY_REDIRECT_URI};
}
export function saveClientId(value){
 const clientId=value.trim();
 if(!/^[a-f0-9]{32}$/i.test(clientId))throw new Error("Bitte die 32-stellige Spotify Client-ID eintragen, keinen Client-Secret.");
 disconnect();
 try{localStorage.setItem(SETTINGS,JSON.stringify({clientId}));}catch{throw new Error("Der Browser blockiert die lokale Speicherung. Bitte Website-Speicher erlauben.");}
}
export function connected(){const token=read(SESSION);return Boolean(token&&token.clientId===settings().clientId&&(token.refreshToken||token.expiresAt>Date.now()));}
export function disconnect(){
 epoch++;
 // Spotify must never prevent Supabase logout if browser storage is unavailable.
 for(const key of [SESSION,PENDING]){try{sessionStorage.removeItem(key);}catch{}}
}
function random(){return Array.from(crypto.getRandomValues(new Uint8Array(32)),b=>b.toString(16).padStart(2,"0")).join("");}
export async function authorize(){
 const config=settings();
 if(!config.clientId)throw new Error("Bitte zuerst deine Spotify Client-ID speichern.");
 const uri=new URL(config.redirectUri);
 if(uri.protocol!=="https:"&&!(uri.protocol==="http:"&&["127.0.0.1","[::1]"].includes(uri.hostname)))throw new Error("Spotify benötigt HTTPS oder die lokale Adresse 127.0.0.1 (nicht localhost).");
 const verifier=random(),state=random();
 const digest=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(verifier));
 const challenge=btoa(String.fromCharCode(...new Uint8Array(digest))).replace(/=/g,"").replace(/\+/g,"-").replace(/\//g,"_");
 sessionStorage.setItem(PENDING,JSON.stringify({...config,verifier,state,createdAt:Date.now()}));
 const url=new URL("https://accounts.spotify.com/authorize");
 // Phase 1: search only; no playlist/write or playback scopes requested.
 url.search=new URLSearchParams({client_id:config.clientId,response_type:"code",redirect_uri:config.redirectUri,state,code_challenge_method:"S256",code_challenge:challenge}).toString();
 location.assign(url.href);
}
async function tokenRequest(parameters){
 let response;
 try{response=await fetch("https://accounts.spotify.com/api/token",{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},body:new URLSearchParams(parameters),cache:"no-store",credentials:"omit"});}
 catch{throw new Error("Spotify ist nicht erreichbar. Bitte Internetverbindung prüfen und erneut versuchen.");}
 if(!response.ok){
  if([400,401].includes(response.status)){disconnect();throw new Error("Spotify-Anmeldung abgelaufen oder ungültig. Bitte erneut verbinden und Client-ID sowie Redirect-URL prüfen.");}
  throw new Error("Spotify-Anmeldung derzeit nicht möglich. Bitte später erneut versuchen.");
 }
 const data=await response.json();
 if(typeof data.access_token!=="string"||!Number.isFinite(data.expires_in)||data.expires_in<=0||data.token_type?.toLowerCase()!=="bearer")throw new Error("Spotify hat eine ungültige Anmeldeantwort geliefert.");
 return data;
}
function storeToken(data,clientId,previousRefresh){
 sessionStorage.setItem(SESSION,JSON.stringify({clientId,accessToken:data.access_token,refreshToken:data.refresh_token||previousRefresh||null,expiresAt:Date.now()+data.expires_in*1000}));
}
export async function completeAuthorization(){
 const params=new URLSearchParams(location.search),pending=read(PENDING);
 // Remove code/state from browser history before any network request.
 history.replaceState(null,"",location.pathname);
 sessionStorage.removeItem(PENDING);
 if(!pending||!params.get("state")||params.get("state")!==pending.state||Date.now()-pending.createdAt>600000||Date.now()<pending.createdAt||pending.clientId!==settings().clientId||pending.redirectUri!==settings().redirectUri)throw new Error("Anmeldung konnte nicht sicher zugeordnet werden oder ist abgelaufen. Bitte im Dashboard erneut verbinden.");
 if(params.has("error"))throw new Error(params.get("error")==="access_denied"?"Spotify-Anmeldung wurde abgebrochen. Du kannst sie im Dashboard erneut starten.":"Spotify-Anmeldung fehlgeschlagen. Bitte im Dashboard erneut versuchen.");
 const code=params.get("code");if(!code)throw new Error("Spotify hat keinen Anmeldecode zurückgegeben.");
 const currentEpoch=epoch;
 const token=await tokenRequest({grant_type:"authorization_code",code,redirect_uri:pending.redirectUri,client_id:pending.clientId,code_verifier:pending.verifier});
 if(epoch!==currentEpoch)throw new Error("Spotify-Verbindung wurde getrennt.");
 storeToken(token,pending.clientId);
}
async function refresh(){
 if(refreshing)return refreshing;
 const current=read(SESSION),currentEpoch=epoch;
 if(!current?.refreshToken){disconnect();throw new Error("Bitte Spotify erneut verbinden.");}
 refreshing=(async()=>{
  const data=await tokenRequest({grant_type:"refresh_token",refresh_token:current.refreshToken,client_id:settings().clientId});
  if(epoch!==currentEpoch)throw new Error("Spotify-Verbindung wurde getrennt.");
  storeToken(data,settings().clientId,current.refreshToken);
  return data.access_token;
 })().finally(()=>{refreshing=null;});
 return refreshing;
}
async function accessToken(){
 const current=read(SESSION);
 if(!current||current.clientId!==settings().clientId)throw new Error("Bitte Spotify verbinden.");
 return current.expiresAt>Date.now()+30000?current.accessToken:refresh();
}
export async function searchTracks(query,{signal}={}){
 const text=query.trim();if(!text)return [];
 const url=new URL("https://api.spotify.com/v1/search");url.search=new URLSearchParams({q:text,type:"track",limit:"10"}).toString();
 const request=token=>fetch(url,{headers:{Authorization:`Bearer ${token}`},signal,credentials:"omit",cache:"no-store"});
 let response;
 try{
  response=await request(await accessToken());
  if(response.status===401)response=await request(await refresh());
 }catch(error){if(error.name==="AbortError")throw error;if(error instanceof TypeError)throw new Error("Spotify-Suche nicht erreichbar. Bitte Internetverbindung prüfen.");throw error;}
 if(response.status===401){disconnect();throw new Error("Spotify-Anmeldung abgelaufen. Bitte erneut verbinden.");}
 if(response.status===403)throw new Error("Spotify verweigert den Zugriff. Bitte App-Freigabe, Testnutzer und Kontovoraussetzungen im Developer Dashboard prüfen.");
 if(response.status===429){const seconds=Number(response.headers.get("Retry-After"));throw new Error(Number.isFinite(seconds)&&seconds>0?`Spotify-Limit erreicht. Bitte in ${Math.ceil(seconds)} Sekunden erneut versuchen.`:"Spotify-Limit erreicht. Bitte später erneut versuchen.");}
 if(!response.ok)throw new Error("Spotify-Suche fehlgeschlagen. Bitte erneut versuchen.");
 const data=await response.json();return (data.tracks?.items||[]).filter(item=>item?.id&&item.type==="track");
}
