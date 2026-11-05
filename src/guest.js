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
 const category=document.querySelector('input[name="category"]:checked')?.value;
 try{
  if(!guest_name||!song_title||!artist||!category)throw new Error("Please complete all fields and choose a music category.");
  const client=await getClient();
  const {error}=await client.rpc("submit_song_request_v3",{
    p_guest_name:guest_name,p_song_title:song_title,p_artist:artist,
    p_client_token:getBrowserToken(),p_category:category
  });
  if(error)throw error;
  const categoryNames={german:"KARNEVAL",latino:"SPANISH/LATINO",international:"ENGLISH/OTHER"};
  form.reset();message("Song request sent to "+categoryNames[category]+".","success");
 }catch(err){
  console.error(err);
  if(err?.message?.includes("RATE_LIMIT")){
    message("Please wait a moment before sending your next song request.","error");
  }else if(err?.code==="PGRST202"||err?.code==="42883"||err?.message?.includes("Could not find the function")){
    message("Song requests are temporarily unavailable while the DJ completes setup. Please try again shortly.","error");
  }else{
    message("Couldn't send your request. Please try again or ask the DJ.","error");
  }
 }finally{button.disabled=false;}
});