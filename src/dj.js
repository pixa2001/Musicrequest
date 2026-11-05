import {getClient,configured} from "./client.js";
const $=s=>document.querySelector(s),loginPanel=$("#login-panel"),requestPanel=$("#request-panel"),logout=$("#logout");
const loginFeedback=$("#login-feedback"),connection=$("#connection"),list=$("#requests"),count=$("#request-count");
let client,channel,requests=[];
function setFeedback(text){loginFeedback.textContent=text;loginFeedback.className="feedback error";}
function ready(user){loginPanel.classList.toggle("hidden",!!user);requestPanel.classList.toggle("hidden",!user);logout.classList.toggle("hidden",!user);connection.textContent=user?"Live":"Sign in";connection.classList.toggle("connected",!!user);}
function display(){
 const showDone=$("#show-done").checked;
 const visible=requests.filter(r=>showDone||!r.played);
 count.textContent=visible.length+" song"+(visible.length===1?"":"s");
 list.replaceChildren();
 if(!visible.length){const empty=document.createElement("div");empty.className="empty";empty.textContent="No song requests yet.";list.append(empty);return;}
 for(const row of visible){
  const el=document.createElement("article");el.className="request"+(row.played?" done":"");
  const index=document.createElement("div");index.className="number";index.textContent=String(row.position);
  const details=document.createElement("div");
  const title=document.createElement("div");title.className="song-title";title.textContent=row.song_title;
  const artist=document.createElement("div");artist.className="artist";artist.textContent=row.artist;
  const names=document.createElement("div");names.className="requesters";names.textContent=(row.guest_names||[]).join(", ");
  details.append(title,artist,names);
  const side=document.createElement("div");side.className="row-side";
  if(row.request_count>1){const plus=document.createElement("span");plus.className="plus";plus.textContent="+"+(row.request_count-1);side.append(plus);}
  const button=document.createElement("button");button.className="mark";button.textContent=row.played?"Reopen":"Played";
  button.addEventListener("click",()=>markPlayed(row.id,!row.played));side.append(button);
  el.append(index,details,side);list.append(el);
 }
}
async function load(){
 if(!client)return;
 const {data,error}=await client.rpc("dj_song_request_list");
 if(error){connection.textContent="Connection error";console.error(error);return;}
 requests=data||[];display();connection.textContent="Live";connection.classList.add("connected");
}
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
 client.auth.onAuthStateChange((event,session)=>{if(event==="SIGNED_OUT"){ready(null);requests=[];display();}else if(event==="SIGNED_IN"&&session){ready(session.user);queueMicrotask(async()=>{await load();await subscribe()});}});
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