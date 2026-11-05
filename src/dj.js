import {getClient,configured} from "./client.js";
const $=s=>document.querySelector(s),loginPanel=$("#login-panel"),requestPanel=$("#request-panel"),logout=$("#logout");
const loginFeedback=$("#login-feedback"),connection=$("#connection"),list=$("#requests"),count=$("#request-count");
let client,channel,requests=[];
function setFeedback(text){loginFeedback.textContent=text;loginFeedback.className="feedback error";}
function ready(user){loginPanel.classList.toggle("hidden",!!user);requestPanel.classList.toggle("hidden",!user);logout.classList.toggle("hidden",!user);connection.textContent=user?"Live":"Sign in";connection.classList.toggle("connected",!!user);}
const categories={
 latino:"🇪🇸 Latino / Spanisch",
 german:"🎉 Karneval / Deutsch",
 international:"🇬🇧 Englisch / International"
};
const evening=$("#evening");
const dateFormat=new Intl.DateTimeFormat("de-DE",{timeZone:"Europe/Berlin",day:"2-digit",month:"2-digit",year:"numeric"});
const columns=new Map();
for(const [key,label] of Object.entries(categories)){
 const column=document.createElement("section");
 column.className="request-column";
 const heading=document.createElement("h2");
 heading.textContent=label;
 const rows=document.createElement("div");
 column.append(heading,rows);
 list.append(column);
 columns.set(key,rows);
}
let evenings=[],loadVersion=0,followCurrent=true;
function display(){
 const visible=requests.filter(row=>$("#show-done").checked||!row.played);
 count.textContent=visible.length+" Musikwünsche";
 for(const [key,column] of columns){
  column.replaceChildren();
  const rows=visible.filter(row=>row.category===key);
  if(!rows.length){
   const empty=document.createElement("div");
   empty.className="empty";
   empty.textContent="Keine Musikwünsche.";
   column.append(empty);
  }
  for(const row of rows) column.append(songCard(row));
 }
}
function songCard(row){
 const el=document.createElement("article");
 el.className="request"+(row.played?" done":"");
 const index=document.createElement("div");
 index.className="number";
 index.textContent=String(row.position);
 const details=document.createElement("div");
 const title=document.createElement("div");
 title.className="song-title";
 title.textContent=row.song_title;
 const artist=document.createElement("div");
 artist.className="artist";
 artist.textContent=row.artist;
 const names=document.createElement("div");
 names.className="requesters";
 names.textContent=row.guest_names.join(", ");
 const category=document.createElement("select");
 category.setAttribute("aria-label","Kategorie für "+row.song_title);
 for(const [key,label] of Object.entries(categories)) category.add(new Option(label,key));
 category.value=row.category;
 category.addEventListener("change",async()=>{
  category.disabled=true;
  const {error}=await client.rpc("dj_move_song",{p_id:row.id,p_category:category.value});
  if(error){
   category.value=row.category;
   alert("Die Kategorie konnte nicht gespeichert werden.");
  }else await load();
  category.disabled=false;
 });
 details.append(title,artist,names,category);
 const side=document.createElement("div");
 side.className="row-side";
 if(row.request_count>1){
  const plus=document.createElement("span");
  plus.className="plus";
  plus.textContent="+"+(row.request_count-1);
  side.append(plus);
 }
 const button=document.createElement("button");
 button.className="mark";
 button.textContent=row.played?"Wieder öffnen":"Gespielt";
 button.addEventListener("click",()=>markPlayed(row.id,!row.played));
 side.append(button);
 el.append(index,details,side);
 return el;
}
function selectedEvening(){
 return evenings.find(item=>String(item.id)===evening.value);
}
async function load(){
 if(!client)return;
 const version=++loadVersion;
 const {data,error}=await client.rpc("dj_evening_list");
 if(version!==loadVersion)return;
 if(error){connection.textContent="Connection error";console.error(error);return;}
 const previous=evening.value;
 evenings=data;
 evening.replaceChildren(new Option("Bestandswünsche",""));
 for(const item of evenings){
  const label=dateFormat.format(new Date(item.started_at))+" · #"+item.id+(item.ended_at?"":" · läuft");
  evening.add(new Option(label,String(item.id)));
 }
 evening.value=followCurrent?String(evenings[0]?.id??""):previous;
 const selected=selectedEvening();
 $("#end-evening").disabled=!selected||!!selected.ended_at;
 const result=await client.rpc("dj_evening_songs",{p_evening:selected?.id??null});
 if(version!==loadVersion)return;
 if(result.error){connection.textContent="Connection error";console.error(result.error);return;}
 requests=result.data;
 display();
 connection.textContent="Live";
 connection.classList.add("connected");
}
function exportText(rows){
 const oneLine=text=>text.replace(/\s+/g," ").trim();
 return Object.entries(categories).map(([key,label])=>{
  const titles=rows.filter(row=>row.category===key).map(row=>
   oneLine(row.song_title)+" — "+oneLine(row.artist)+" ("+row.request_count+")"
  );
  return [label,...titles].join("\n");
 }).join("\n\n")+"\n";
}
$("#export").addEventListener("click",async()=>{
 const selected=selectedEvening();
 const {data,error}=await client.rpc("dj_evening_export",{p_evening:selected?.id??null});
 if(error){alert("Die Songliste konnte nicht geladen werden.");return;}
 const date=selected?dateFormat.format(new Date(selected.started_at)).replaceAll(".","-"):"Bestand";
 const url=URL.createObjectURL(new Blob([exportText(data)],{type:"text/plain;charset=utf-8"}));
 const link=document.createElement("a");
 link.href=url;
 link.download="DJ-Songwuensche-"+date+".txt";
 link.click();
 setTimeout(()=>URL.revokeObjectURL(url),1000);
});
$("#end-evening").addEventListener("click",async()=>{
 const selected=selectedEvening();
 if(!selected||!confirm("DJ-Abend beenden? Der nächste Wunsch eröffnet einen neuen Abend."))return;
 const {error}=await client.rpc("dj_end_evening",{p_id:selected.id});
 if(error){alert("Der DJ-Abend konnte nicht beendet werden.");return;}
 await load();
});
evening.addEventListener("change",()=>{
 followCurrent=selectedEvening()?.id===evenings[0]?.id;
 requests=[];
 display();
 load();
});
async function markPlayed(id,played){
 const {error}=await client.rpc("dj_mark_request_played",{p_request_id:id,p_played:played});
 if(error){alert("Could not update this song. Please try again.");return}
 await load();
}
async function subscribe(){
 if(channel)await client.removeChannel(channel);
 channel=client.channel("dj-request-events").on("postgres_changes",{event:"*",schema:"public",table:"song_requests"},load).subscribe();
}
async function initialize(){
 if(!configured){connection.textContent="Setup required";setFeedback("Supabase setup is required before signing in.");return;}
 try{client=await getClient();const {data:{user}}=await client.auth.getUser();ready(user);if(user){await load();await subscribe();}
 client.auth.onAuthStateChange((event,session)=>{if(event==="SIGNED_OUT"){ready(null);loadVersion++;requests=[];evenings=[];followCurrent=true;display();}else if(event==="SIGNED_IN"&&session){ready(session.user);queueMicrotask(async()=>{await load();await subscribe()});}});
 }catch(err){console.error(err);setFeedback("Could not connect to the backend.");}
}
$("#login-form").addEventListener("submit",async e=>{
 e.preventDefault();if(!client)return;setFeedback("");const email=$("#email").value.trim(),password=$("#password").value;
 const {data,error}=await client.auth.signInWithPassword({email,password});
 if(error){setFeedback("Sign in failed. Check your email and password.");return;}
 ready(data.user);await load();await subscribe();
});
logout.addEventListener("click",async()=>{if(channel)await client.removeChannel(channel);await client.auth.signOut();ready(null)});
$("#refresh").addEventListener("click",load);$("#show-done").addEventListener("change",display);
initialize();