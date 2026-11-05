import {getClient} from "./client.js";
const form=document.querySelector("#request-form"),feedback=document.querySelector("#feedback"),button=document.querySelector("#submit");
const message=(text,type="")=>{feedback.textContent=text;feedback.className="feedback "+type};
form.addEventListener("submit",async e=>{
 e.preventDefault();button.disabled=true;message("Sending your request…");
 const guest_name=form.guest.value.trim(),song_title=form.title.value.trim(),artist=form.artist.value.trim();
 try{
  if(!guest_name||!song_title||!artist) throw new Error("Please complete all three fields.");
  const client=await getClient();
  const {error}=await client.rpc("submit_song_request",{p_guest_name:guest_name,p_song_title:song_title,p_artist:artist});
  if(error) throw error;
  form.reset();message("Thanks! Your song request has been sent.","success");
 }catch(err){console.error(err);message("Couldn't send your request. Please try again or ask the DJ.","error")}
 finally{button.disabled=false}
});