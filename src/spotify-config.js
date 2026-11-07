// Public OAuth client ID only. NEVER add a Spotify client secret here.
// Alternatively enter the client ID in the dashboard's Spotify dialog (this browser only).
export const SPOTIFY_CLIENT_ID = "83ddd15003534bb48090faea1558cf0e";
// Exact redirect URI: the same origin and repository path as the dashboard.
export const SPOTIFY_REDIRECT_URI = new URL("../dj/spotify-callback.html", import.meta.url).href;
