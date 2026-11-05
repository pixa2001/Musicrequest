import {getClient} from "./client.js";
const form=document.querySelector("#request-form"),feedback=document.querySelector("#feedback"),button=document.querySelector("#submit");
const message=(text,type="")=>{feedback.textContent=text;feedback.className="feedback "+type;};
function getBrowserToken(){
 const key="musicrequest-browser-id";
 let value=localStorage.getItem(key);
 if(!value){value=crypto.randomUUID();localStorage.setItem(key,value);}
 return value;
}
form.addEventListener("submit",async e=>{
 e.preventDefault();button.disabled=true;message("Sending your request…");
 const guest_name=document.querySelector("#guest").value.trim();
 const song_title=document.querySelector("#title").value.trim();
 const artist=document.querySelector("#artist").value.trim();
 try{
  if(!guest_name||!song_title||!artist)throw new Error("Please complete all three fields.");
  const client=await getClient();
  const result=await client.rpc("submit_song_request_v2",{
    p_guest_name:guest_name,p_song_title:song_title,p_artist:artist,p_client_token:getBrowserToken()
  });
  if(result.error){
   // Guest form stays operational while DJ is applying the additive DB migration.
   if(result.error.code==="PGRST202"||result.error.code==="42883"){
     const fallback=await client.rpc("submit_song_request",{p_guest_name:guest_name,p_song_title:song_title,p_artist:artist});
     if(fallback.error)throw fallback.error;
   }else throw result.error;
  }
  form.reset();message("Thanks! Your song request has been sent.","success");
 }catch(err){
  console.error(err);
  if(err?.message?.includes("RATE_LIMIT")){
    message("Please wait a moment before sending your next song request.","error");
  }else{
    message("Couldn't send your request. Please try again or ask the DJ.","error");
  }
 }finally{button.disabled=false;}
});