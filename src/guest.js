import {getClient} from "./client.js";
const form=document.querySelector("#request-form"),feedback=document.querySelector("#feedback"),button=document.querySelector("#submit");
const message=(text,type="")=>{feedback.textContent=text;feedback.className="feedback "+type};
form.addEventListener("submit",async e=>{
 e.preventDefault();button.disabled=true;message("Sending your request…");
 const guest_name=document.querySelector("#guest").value.trim(),song_title=document.querySelector("#title").value.trim(),artist=document.querySelector("#artist").value.trim();
 try{
  if(!guest_name||!song_title||!artist) throw new Error("Please complete all three fields.");
  const client=await getClient();
  let guestToken=localStorage.getItem("musicrequest-guest-token");
  if(!guestToken){
   guestToken=crypto.randomUUID();
   localStorage.setItem("musicrequest-guest-token",guestToken);
  }
  const {error}=await client.rpc("submit_evening_song_request",{
   p_guest_name:guest_name,p_song_title:song_title,p_artist:artist,p_guest_token:guestToken
  });
  if(error) throw error;
  form.reset();message("Thanks! Your song request has been sent.","success");
 }catch(err){
  if(err?.code==="P0030"){
   message("Bitte warte einen Moment, bevor du deinen nächsten Musikwunsch abschickst.","error");
   return;
  }
  console.error(err);message("Couldn't send your request. "+(err?.message||"Please try again or ask the DJ."),"error")}
 finally{button.disabled=false}
});