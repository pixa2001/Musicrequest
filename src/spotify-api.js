import {SPOTIFY_CLIENT_ID,SPOTIFY_REDIRECT_URI} from "./spotify-config.js";
const SETTINGS="musicrequest.spotify.settings",SESSION="musicrequest.spotify.session",PENDING="musicrequest.spotify.pkce";
let refreshing=null,epoch=0;
const PLAYLIST_SCOPES=["playlist-read-private","playlist-modify-private","playlist-modify-public","user-read-private"];
let playlistWrite=null;
const read=key=>{try{return JSON.parse(sessionStorage.getItem(key)||"null");}catch{return null;}};
export function settings(){
 let local={};try{local=JSON.parse(localStorage.getItem(SETTINGS)||"{}");}catch{}
 return {clientId:local.clientId||SPOTIFY_CLIENT_ID||"",redirectUri:SPOTIFY_REDIRECT_URI};
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
 // Playlist permissions are requested only through explicit Spotify consent.
 url.search=new URLSearchParams({client_id:config.clientId,response_type:"code",scope:PLAYLIST_SCOPES.join(" "),redirect_uri:config.redirectUri,state,code_challenge_method:"S256",code_challenge:challenge}).toString();
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
function storeToken(data,clientId,previousRefresh,previousScope=""){
 sessionStorage.setItem(SESSION,JSON.stringify({clientId,accessToken:data.access_token,refreshToken:data.refresh_token||previousRefresh||null,scope:data.scope??previousScope,expiresAt:Date.now()+data.expires_in*1000}));
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
  storeToken(data,settings().clientId,current.refreshToken,current.scope);
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

export function playlistPermission(){
 const scopes=new Set((read(SESSION)?.scope||"").split(" "));
 return connected()&&PLAYLIST_SCOPES.every(scope=>scopes.has(scope));
}
async function spotifyRequest(path,{method="GET",body}={}){
 if(!playlistPermission())throw new Error("Bitte erneut mit Spotify verbinden und die Playlist-Berechtigungen bestätigen.");
 const generation=epoch;
 const url=new URL(path,"https://api.spotify.com/v1/");
 if(url.origin!=="https://api.spotify.com"||!url.pathname.startsWith("/v1/"))throw new Error("Ungültige Spotify-Adresse.");
 const request=async token=>{
  if(generation!==epoch)throw new Error("Spotify-Verbindung wurde getrennt.");
  return fetch(url,{method,headers:{Authorization:`Bearer ${token}`,...(body?{"Content-Type":"application/json"}:{})},...(body?{body:JSON.stringify(body)}:{}),credentials:"omit",cache:"no-store"});
 };
 let response;
 try{response=await request(await accessToken());if(response.status===401)response=await request(await refresh());}
 catch(error){if(error instanceof TypeError)throw new Error(method==="POST"?"Verbindung unterbrochen. Der Vorgang wurde möglicherweise ausgeführt. Playlist neu laden; vor erneutem Hinzufügen wird nochmals auf Duplikate geprüft.":"Spotify ist nicht erreichbar. Bitte erneut versuchen.");throw error;}
 if(generation!==epoch)throw new Error("Spotify-Verbindung wurde getrennt. Playlist bitte in Spotify prüfen.");
 if(response.status===401){disconnect();throw new Error("Bitte Spotify erneut verbinden.");}
 if(response.status===403)throw new Error("Spotify verweigert den Playlist-Zugriff. Bitte erneut verbinden, Playlist-Berechtigungen bestätigen und eine eigene Playlist wählen.");
 if(response.status===429){const delay=Number(response.headers.get("Retry-After"));throw new Error(`Spotify-Limit erreicht. Bitte ${delay>0?delay+" Sekunden warten":"später erneut versuchen"}.`);}
 if(!response.ok){const error=new Error("Spotify konnte die Playlist nicht bearbeiten. Bitte neu laden und erneut prüfen.");error.status=response.status;throw error;}
 return response.status===204?{}:response.json();
}
async function allPages(path){
 const result=[],seen=new Set();
 while(path){if(seen.has(path))throw new Error("Spotify hat eine ungültige Seitennavigation geliefert.");seen.add(path);const page=await spotifyRequest(path);result.push(...(page.items||[]));path=page.next;}
 return result;
}
export async function loadPlaylists(){
 const user=await spotifyRequest("me");
 const lists=await allPages("me/playlists?limit=50");
 return {userId:user.id,playlists:lists.filter(p=>p?.id&&p.owner?.id===user.id)};
}
export async function createRequestPlaylist(){
 if(playlistWrite)throw new Error("Eine Playlist-Änderung läuft bereits. Bitte kurz warten.");
 playlistWrite=(async()=>{
  const {userId,playlists}=await loadPlaylists();
  const existing=playlists.find(p=>p.name==="Taberna Flamenca – Requests");if(existing)return existing;
  const body={name:"Taberna Flamenca – Requests",public:false,description:"Manuell bestätigte Musikwünsche der Taberna Flamenca"};
  try{return await spotifyRequest("me/playlists",{method:"POST",body});}
  catch(error){if(![404,405].includes(error.status))throw error;return spotifyRequest(`users/${encodeURIComponent(userId)}/playlists`,{method:"POST",body});}
 })();
 try{return await playlistWrite;}finally{playlistWrite=null;}
}
export async function addTrackToPlaylist(playlistId,track){
 if(!/^[a-zA-Z0-9]+$/.test(playlistId)||!/^spotify:track:[a-zA-Z0-9]+$/.test(track.uri||""))throw new Error("Bitte einen gültigen Spotify-Titel und eine Playlist auswählen.");
 if(playlistWrite)throw new Error("Eine Playlist-Änderung läuft bereits. Bitte kurz warten.");
 playlistWrite=(async()=>{
  const {playlists}=await loadPlaylists();
  if(!playlists.some(p=>p.id===playlistId))throw new Error("Bitte eine eigene, beschreibbare Playlist auswählen.");
  let endpoint=`playlists/${encodeURIComponent(playlistId)}/items`;
  let items;
  try{items=await allPages(endpoint+"?limit=50");}
  catch(error){if(![404,405].includes(error.status))throw error;endpoint=`playlists/${encodeURIComponent(playlistId)}/tracks`;items=await allPages(endpoint+"?limit=50");}
  const uris=new Set([track.uri,track.linked_from?.uri].filter(Boolean));
  const duplicate=items.some(item=>{const song=item?.item||item?.track;return uris.has(song?.uri)||uris.has(song?.linked_from?.uri);});
  if(duplicate)return {duplicate:true};
  // No automatic retry after a timeout/uncertain write. A new attempt rechecks membership.
  await spotifyRequest(endpoint,{method:"POST",body:{uris:[track.uri]}});
  return {duplicate:false};
 })();
 try{return await playlistWrite;}finally{playlistWrite=null;}
}
