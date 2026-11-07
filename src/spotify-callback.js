import {completeAuthorization} from "./spotify-api.js";
try{
 await completeAuthorization();
 location.replace(new URL("../dj/",import.meta.url).href);
}catch(error){document.querySelector("#spotify-callback-status").textContent=error.message||"Spotify konnte nicht verbunden werden. Bitte erneut versuchen.";}
