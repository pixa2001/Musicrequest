import {settings,saveClientId,connected,authorize,disconnect,searchTracks} from "./spotify-api.js";
let djReady=false,dialog,connectButton,status,results,searchInput,searchButton,selectedStatus,controller,focusBefore;
function element(tag,className,text){const node=document.createElement(tag);if(className)node.className=className;if(text!==undefined)node.textContent=text;return node;}
export function spotifyIcon(){
 const svg=document.createElementNS("http://www.w3.org/2000/svg","svg");svg.setAttribute("viewBox","0 0 24 24");svg.setAttribute("aria-hidden","true");
 const circle=document.createElementNS(svg.namespaceURI,"circle");circle.setAttribute("cx","12");circle.setAttribute("cy","12");circle.setAttribute("r","11");circle.setAttribute("fill","currentColor");svg.append(circle);
 for(const [d,width] of [["M6 9c4-1.4 8-1 12 1","1.6"],["M7 12c3-1 6.5-.7 9.5 1","1.4"],["M8 15c2.5-.7 4.7-.4 7 1","1.2"]]){const p=document.createElementNS(svg.namespaceURI,"path");p.setAttribute("d",d);p.setAttribute("stroke","#08120c");p.setAttribute("stroke-width",width);p.setAttribute("stroke-linecap","round");p.setAttribute("fill","none");svg.append(p);}return svg;
}
function button(text,handler){const node=element("button","secondary",text);node.type="button";node.addEventListener("click",handler);return node;}
function updateConnection(){if(connectButton)connectButton.textContent=connected()?"Spotify verbunden":"Spotify verbinden";}
function announce(message){status.textContent=message;updateConnection();}
function safeURL(value,kind){try{const url=new URL(value);if(url.protocol!=="https:")return null;if(kind==="track"&&url.hostname==="open.spotify.com")return url.href;if(kind==="cover"&&url.hostname==="i.scdn.co")return url.href;}catch{}return null;}
function mount(){
 if(dialog)return;
 dialog=element("dialog","spotify-dialog");dialog.setAttribute("aria-labelledby","spotify-dialog-title");
 const header=element("div","spotify-dialog-header");const title=element("h2","","Spotify-Suche");title.id="spotify-dialog-title";header.append(title,button("Schließen",()=>dialog.close()));dialog.append(header);
 const intro=element("p","spotify-muted","Phase 1 · Titel suchen und manuell auswählen. Playlists werden noch nicht verändert.");dialog.append(intro);
 const setup=element("details","spotify-setup");const summary=element("summary","","Spotify-Verbindung einrichten");setup.append(summary);
 const form=element("form");const label=element("label","","Spotify Client-ID (öffentlich)");const clientInput=element("input");clientInput.id="spotify-client-id";clientInput.value=settings().clientId;clientInput.autocomplete="off";clientInput.spellcheck=false;clientInput.required=true;clientInput.maxLength=32;label.htmlFor=clientInput.id;
 const redirect=element("p","spotify-muted","Redirect-URL in deiner Spotify-App exakt eintragen:");const uri=element("code","spotify-redirect",settings().redirectUri);
 const save=element("button","secondary","Client-ID speichern");save.type="submit";
 form.append(label,clientInput,redirect,uri,save);form.addEventListener("submit",event=>{event.preventDefault();try{saveClientId(clientInput.value);announce("Client-ID gespeichert. Jetzt mit Spotify verbinden.");}catch(error){announce(error.message);}});setup.append(form);dialog.append(setup);
 const actions=element("div","spotify-actions");actions.append(button("Mit Spotify verbinden",async()=>{try{await authorize();}catch(error){announce(error.message);}}),button("Spotify trennen",()=>{controller?.abort();results.replaceChildren();selectedStatus.textContent="";disconnect();announce("Spotify getrennt. Die DJ-Anmeldung bleibt bestehen.");}));dialog.append(actions);
 const search=element("form","spotify-search");const searchLabel=element("label","","Songtitel und Künstler");searchLabel.htmlFor="spotify-query";searchInput=element("input");searchInput.id=searchLabel.htmlFor;searchInput.type="search";searchInput.maxLength=260;searchInput.required=true;
 searchButton=element("button","secondary","Suchen");searchButton.type="submit";search.append(searchLabel,searchInput,searchButton);search.addEventListener("submit",event=>{event.preventDefault();runSearch();});dialog.append(search);
 status=element("p","spotify-status");status.setAttribute("role","status");dialog.append(status);
 results=element("fieldset","spotify-results");const legend=element("legend","sr-only","Passenden Spotify-Titel auswählen");results.append(legend);dialog.append(results);
 selectedStatus=element("p","spotify-selected");selectedStatus.setAttribute("role","status");dialog.append(selectedStatus);
 const source=element("a","spotify-source","Musikdaten von Spotify");source.href="https://open.spotify.com/";source.target="_blank";source.rel="noopener noreferrer";dialog.append(source);
 dialog.addEventListener("close",()=>{controller?.abort();focusBefore?.focus();});document.body.append(dialog);
 connectButton=button("Spotify verbinden",()=>openSpotify());connectButton.classList.add("spotify-connect");document.querySelector(".dashboard-controls>div").prepend(connectButton);updateConnection();
}
async function runSearch(){
 if(!djReady)return;
 controller?.abort();controller=new AbortController();const current=controller;
 results.replaceChildren();selectedStatus.textContent="";
 if(!connected()){announce("Bitte Spotify verbinden, um passende Titel zu suchen.");return;}
 searchButton.disabled=true;results.setAttribute("aria-busy","true");announce("Spotify wird durchsucht …");
 try{
  const tracks=await searchTracks(searchInput.value,{signal:current.signal});
  if(current.signal.aborted||!dialog.open||!djReady)return;
  for(const track of tracks){
   const label=element("label","spotify-result");const radio=element("input");radio.type="radio";radio.name="spotify-track";radio.value=track.id;
   const cover=safeURL(track.album?.images?.[0]?.url,"cover");
   if(cover){const img=element("img");img.src=cover;img.alt="";img.width=56;img.height=56;img.loading="lazy";img.referrerPolicy="no-referrer";img.addEventListener("error",()=>img.replaceWith(element("span","spotify-cover-placeholder","♫")),{once:true});label.append(img);}else label.append(element("span","spotify-cover-placeholder","♫"));
   const detail=element("span","spotify-track-info");detail.append(element("strong","",track.name),element("span","",(track.artists||[]).map(a=>a.name).join(", ")));
   const url=safeURL(track.external_urls?.spotify,"track");
   // A separate Spotify link avoids nesting an interactive link inside the radio label.
   label.prepend(radio);label.append(detail);const row=element("div","spotify-result-row");row.append(label);
   if(url){const link=element("a","spotify-track-link","Auf Spotify öffnen ↗");link.href=url;link.target="_blank";link.rel="noopener noreferrer";row.append(link);}
   radio.addEventListener("change",()=>{selectedStatus.textContent=`Ausgewählt: ${track.name} – ${(track.artists||[]).map(a=>a.name).join(", ")}. Das Hinzufügen zur Playlist folgt in Phase 2.`;});results.append(row);
  }
  announce(tracks.length?`${tracks.length} Treffer. Bitte die passende Version auswählen.`:"Keine Treffer. Bitte Songtitel oder Künstler anpassen.");
 }catch(error){if(error.name!=="AbortError"&&current===controller&&dialog.open)announce(error.message);}
 finally{if(current===controller){searchButton.disabled=false;results.removeAttribute("aria-busy");}}
}
function openSpotify(row){
 if(!djReady)return;mount();focusBefore=document.activeElement;
 controller?.abort();results.replaceChildren();selectedStatus.textContent="";searchButton.disabled=false;
 searchInput.value=row?`${row.song_title} ${row.artist}`:"";
 dialog.querySelector("details").open=!settings().clientId;
 announce(connected()?"Spotify verbunden. Suche starten oder einen Song auswählen.":"Spotify ist noch nicht verbunden.");
 if(!dialog.open)dialog.showModal();
 if(row&&connected())runSearch();
}
export function spotifyButton(row){
 const node=button("",()=>openSpotify(row));node.classList.add("spotify-song-button");node.append(spotifyIcon());node.title="Auf Spotify suchen";node.setAttribute("aria-label",`Auf Spotify suchen: ${row.song_title} – ${row.artist}`);return node;
}
export function setSpotifyDJSession(user){
 djReady=Boolean(user);
 if(djReady){mount();updateConnection();}
 else{dialog?.close();disconnect();updateConnection();}
}
