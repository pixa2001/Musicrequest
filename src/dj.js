import {spotifyButton,setSpotifyDJSession} from "./spotify-ui.js";
import {getClient,configured} from "./client.js";
const $=s=>document.querySelector(s);
const loginPanel=$("#login-panel"),requestPanel=$("#request-panel"),logout=$("#logout");
const loginFeedback=$("#login-feedback"),connection=$("#connection"),count=$("#request-count");
const categories=["latino","german","international"];
const categoryLabels={latino:"Latino / Spanisch",german:"Karneval / Deutsch",international:"Englisch / International"};
let client,channel,requests=[],events=[],selectedEvent=null,legacy=false,refreshPending=false;
let selectedDate=null,lastCalendarDate=null;
function feedback(text){$("#dj-feedback").textContent=text;}
function setFeedback(text){loginFeedback.textContent=text;loginFeedback.className="feedback error";}
function ready(user){
 setSpotifyDJSession(user);
 loginPanel.classList.toggle("hidden",!!user);
 requestPanel.classList.toggle("hidden",!user);
 logout.classList.toggle("hidden",!user);
 connection.textContent=user?"Live":"Anmelden";
 connection.classList.toggle("connected",!!user);
}
function el(tag,className,text){
 const item=document.createElement(tag);
 if(className)item.className=className;
 if(text!==undefined)item.textContent=text;
 return item;
}
function display(){
 const showDone=$("#show-done").checked;
 const visible=requests.filter(r=>showDone||!r.played);
 $("#total-count").textContent=requests.reduce((sum,r)=>sum+Number(r.request_count||1),0);
 $("#played-count").textContent=requests.filter(r=>r.played).length;
 $("#open-count").textContent=requests.filter(r=>!r.played).length;
 count.textContent=visible.filter(r=>!r.played).length+" offene Songs";
 for(const category of categories){
  const list=$("#list-"+category);list.replaceChildren();
  const songs=visible.filter(r=>(r.category||"international")===category)
      .sort((a,b)=>new Date(a.first_requested_at)-new Date(b.first_requested_at)||a.id-b.id);
  $("#count-"+category).textContent=songs.length;
  if(!songs.length){list.append(el("div","empty","Noch keine Musikwünsche."));continue;}
  for(const row of songs){
   const article=el("article","request"+(row.played?" done":""));
   article.append(el("div","number",String(row.position)));
   const detail=el("div","song-details");
   detail.append(el("div","song-title",row.song_title),el("div","artist",row.artist));
   detail.append(el("div","requesters",(row.guest_names||[]).join(", ")));
   const side=el("div","row-side");
   if(Number(row.request_count)>1)side.append(el("span","plus","+"+(Number(row.request_count)-1)));
   const played=el("button","mark",row.played?"↶":"▶\uFE0E");
   played.type="button";
   played.setAttribute("aria-label",(row.played?"Wieder öffnen: ":"Als gespielt markieren: ")+row.song_title);
   played.title=row.played?"Wieder öffnen":"Als gespielt markieren";
   played.addEventListener("click",()=>markPlayed(row.id,!row.played));
   side.append(spotifyButton(row),played);detail.append(side);
   article.append(detail);list.append(article);
  }
 }
}
function berlinDate(now=new Date()){
 const parts=new Intl.DateTimeFormat("en-CA",{timeZone:"Europe/Berlin",year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(now);
 const value=type=>parts.find(p=>p.type===type).value;
 return `${value("year")}-${value("month")}-${value("day")}`;
}
function calendarDays(today){
 const date=new Date(today+"T12:00:00Z");
 return Array.from({length:7},(_,index)=>{
  const day=new Date(date);day.setUTCDate(day.getUTCDate()-index);
  return day.toISOString().slice(0,10);
 });
}
function setEvents(){
 const picker=$("#event-select"),today=berlinDate();
 const days=calendarDays(today);
 if(lastCalendarDate!==today||!days.includes(selectedDate))selectedDate=today;
 lastCalendarDate=today;
 picker.replaceChildren();
 for(const day of days){
  const option=el("option","",new Date(day+"T12:00:00Z").toLocaleDateString("de-DE",{timeZone:"Europe/Berlin"}));
  option.value=day;picker.append(option);
 }
 picker.value=selectedDate;
 selectedEvent=events.find(e=>e.session_date===selectedDate)?.id??null;
 picker.disabled=legacy;
}
function checkCalendarDay(){
 if(!requestPanel.classList.contains("hidden")&&lastCalendarDate!==berlinDate()){
  setEvents();requests=[];display();load();
 }
}
setInterval(checkCalendarDay,1000);
document.addEventListener("visibilitychange",()=>{if(!document.hidden)checkCalendarDay();});
window.addEventListener("focus",checkCalendarDay);
async function loadEvents(){
 const {data,error}=await client.rpc("dj_event_list");
 if(error){
  // Legacy compatibility until the upgrade SQL has been applied.
  if(error.code==="PGRST202"||error.code==="42883"){
   legacy=true;events=[{id:0,session_date:new Date().toISOString().slice(0,10)}];
   setEvents();feedback("Datenbank-Erweiterung noch nicht ausgeführt. Kategorien und Abend-Export werden nach der Migration aktiviert.");return;
  }
  throw error;
 }
 legacy=false;events=data||[];setEvents();feedback("");
}
async function load(){
 if(!client)return;
 try{
  await loadEvents();
  let result=legacy?await client.rpc("dj_song_request_list"):
    selectedEvent===null?{data:[],error:null}:await client.rpc("dj_song_request_list_v2",{p_event_id:selectedEvent});
  if(result.error)throw result.error;
  requests=(result.data||[]).map(r=>({...r,category:r.category||"international"}));
  display();connection.textContent="Live";connection.classList.add("connected");
 }catch(err){console.error(err);connection.textContent="Verbindungsfehler";feedback("Daten konnten nicht geladen werden: "+(err.message||"Unbekannter Fehler"));}
}
async function markPlayed(id,played){
 const {error}=await client.rpc("dj_mark_request_played",{p_request_id:id,p_played:played});
 if(error){feedback("Status konnte nicht geändert werden.");return;}
 await load();
}
function normalize(s){return (s||"").normalize("NFKD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z0-9]+/g," ").trim();}
function distance(a,b){
 if(a===b)return 0;
 const prev=Array.from({length:b.length+1},(_,i)=>i);
 for(let i=1;i<=a.length;i++){let diagonal=prev[0];prev[0]=i;
  for(let j=1;j<=b.length;j++){const above=prev[j];prev[j]=Math.min(prev[j]+1,prev[j-1]+1,diagonal+(a[i-1]===b[j-1]?0:1));diagonal=above;}
 }
 return prev[b.length];
}
function sameMusic(a,b){
 const x=normalize(a.song_title),y=normalize(b.song_title),ax=normalize(a.artist),ay=normalize(b.artist);
 return (ax===ay&&x===y)||
 (x.length>=6&&y.length>=6&&ax.length>=4&&ay.length>=4&&
 distance(x,y)<=Math.max(1,Math.floor(Math.max(x.length,y.length)*0.14))&&
 distance(ax,ay)<=Math.max(1,Math.floor(Math.max(ax.length,ay.length)*0.15)));
}
function exportList(){
 if(legacy){feedback("Bitte zuerst die SQL-Migration ausführen, damit pro DJ-Abend exportiert werden kann.");return;}
 if(!selectedEvent){feedback("Für diesen DJ-Abend sind noch keine Wünsche vorhanden.");return;}
 const date=selectedDate||berlinDate();
 const lines=["TABERNA FLAMENCA - DJ SONGWUENSCHE","DJ-Abend: "+new Date(date+"T12:00:00").toLocaleDateString("de-DE"),"Enthält auch gespielte Songs",""];
 // All rows for the selected event are loaded from Supabase, even played songs.
 // Deduplicate across the entire evening, even when later requests had different categories.
 const items=[];
 for(const row of requests){
  const match=items.find(x=>sameMusic(x,row));
  if(match){
   match.request_count+=Number(row.request_count);
   match.played=match.played&&row.played;
  }else items.push({...row,request_count:Number(row.request_count)});
 }
 for(const category of categories){
  lines.push("=== "+categoryLabels[category]+" ===");
  const songs=items.filter(r=>(r.category||"international")===category);
  for(const item of songs){
   const number=Number(item.request_count);
   lines.push(item.song_title+" - "+item.artist+" | "+number+" "+(number===1?"Wunsch":"Wünsche")+" | "+(item.played?"Gespielt":"Offen"));
  }
  if(!songs.length)lines.push("(Keine Songs)");
  lines.push("");
 }
 const blob=new Blob(["\uFEFF"+lines.join("\r\n")],{type:"text/plain;charset=utf-8"});
 const url=URL.createObjectURL(blob),a=document.createElement("a");
 a.href=url;a.download="DJ-Songwuensche-"+date.slice(8,10)+"-"+date.slice(5,7)+"-"+date.slice(0,4)+".txt";
 document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
function scheduleLoad(){if(refreshPending)return;refreshPending=true;setTimeout(()=>{refreshPending=false;load();},400);}
async function subscribe(){
 if(channel)await client.removeChannel(channel);
 channel=client.channel("dj-request-events")
 .on("postgres_changes",{event:"*",schema:"public",table:"song_requests"},scheduleLoad)
 .on("postgres_changes",{event:"*",schema:"public",table:"song_groups"},scheduleLoad)
 .subscribe();
}
async function initialize(){
 if(!configured){connection.textContent="Setup erforderlich";setFeedback("Supabase muss eingerichtet werden.");return;}
 try{
  client=await getClient();const {data:{user}}=await client.auth.getUser();
  ready(user);if(user){await load();await subscribe();}
  client.auth.onAuthStateChange((event,session)=>{
   if(event==="SIGNED_OUT"){ready(null);requests=[];events=[];display();}
   else if(event==="SIGNED_IN"&&session){ready(session.user);queueMicrotask(async()=>{await load();await subscribe();});}
  });
 }catch(err){console.error(err);setFeedback("Verbindung zu Supabase fehlgeschlagen.");}
}
$("#login-form").addEventListener("submit",async e=>{
 e.preventDefault();if(!client)return;setFeedback("");
 const {data,error}=await client.auth.signInWithPassword({email:$("#email").value.trim(),password:$("#password").value});
 if(error){setFeedback("Anmeldung fehlgeschlagen. Prüfe E-Mail und Passwort.");return;}
 ready(data.user);await load();await subscribe();
});
logout.addEventListener("click",async()=>{if(channel)await client.removeChannel(channel);await client.auth.signOut();ready(null);});
$("#refresh").addEventListener("click",load);
$("#show-done").addEventListener("change",display);
$("#event-select").addEventListener("change",e=>{selectedDate=e.target.value;selectedEvent=events.find(event=>event.session_date===selectedDate)?.id??null;requests=[];display();load();});
$("#export").addEventListener("click",exportList);
initialize();
