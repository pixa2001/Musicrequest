"""Offline integration tests: python3 -m unittest discover -s tests -v
Requires Python Playwright and /usr/bin/chromium. No real credentials or API writes.
"""
import base64, hashlib, threading, unittest
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]
ID='a'*32
MOCK='''export const configured=true;let played=false,change=()=>{};window.emitAuth=e=>change(e,null);export async function getClient(){return {auth:{getUser:async()=>({data:{user:{id:'dj'}}}),onAuthStateChange:f=>change=f,signOut:async()=>change('SIGNED_OUT',null)},rpc:async(name,args)=>{if(name==='dj_event_list')return {data:[{id:42,session_date:new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Berlin'}).format(new Date())}]};if(name==='dj_mark_request_played'){played=args.p_played;return {}}return {data:[{id:1,position:1,song_title:'Bailando',artist:'Enrique Iglesias',category:'latino',request_count:2,guest_names:['Ana'],played,first_requested_at:'2026-11-05T20:00:00Z'}]}},channel:()=>({on(){return this},subscribe(){return this}}),removeChannel:async()=>{}}}'''
TRACK={'id':'track1','type':'track','uri':'spotify:track:track1','name':'Bailando','artists':[{'name':'Enrique Iglesias'}],'album':{'images':[{'url':'https://i.scdn.co/image/test'}]},'external_urls':{'spotify':'https://open.spotify.com/track/track1'}}
class Quiet(SimpleHTTPRequestHandler):
 def log_message(self,*_):pass
class SpotifyTests(unittest.TestCase):
 @classmethod
 def setUpClass(cls):
  cls.server=ThreadingHTTPServer(('127.0.0.1',0),partial(Quiet,directory=str(ROOT)));threading.Thread(target=cls.server.serve_forever,daemon=True).start();cls.base=f'http://127.0.0.1:{cls.server.server_port}'
  cls.pw=sync_playwright().start();cls.browser=cls.pw.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
 @classmethod
 def tearDownClass(cls):
  cls.browser.close();cls.pw.stop();cls.server.shutdown();cls.server.server_close()
 def setUp(self):
  self.context=self.browser.new_context(viewport={'width':1440,'height':1000},accept_downloads=True);self.page=self.context.new_page();self.tokens=[];self.searches=[]
  self.page.route('**/src/spotify-config.js',lambda r:r.fulfill(content_type='application/javascript',body='export const SPOTIFY_CLIENT_ID="'+ID+'";export const SPOTIFY_REDIRECT_URI=new URL("../dj/spotify-callback.html",import.meta.url).href;'))
  self.page.route('**/src/client.js',lambda r:r.fulfill(content_type='application/javascript',body=MOCK));self.page.route('https://i.scdn.co/**',lambda r:r.fulfill(status=204));self.page.route('https://accounts.spotify.com/api/token',self.token);self.page.route('https://api.spotify.com/v1/search?*',self.search)
  self.page.goto(self.base+'/dj/');self.page.locator('.spotify-song-button').wait_for();self.page.evaluate('(id)=>localStorage.setItem("musicrequest.spotify.settings",JSON.stringify({clientId:id}))',ID)
 def tearDown(self):self.context.close()
 def token(self,r):
  self.tokens.append(parse_qs(r.request.post_data));r.fulfill(json={'access_token':'fake-access','refresh_token':'fake-refresh','token_type':'Bearer','expires_in':3600})
 def search(self,r):
  self.searches.append(r.request);r.fulfill(json={'tracks':{'items':[TRACK]}})
 def session(self,expired=False):self.page.evaluate('([id,expired])=>sessionStorage.setItem("musicrequest.spotify.session",JSON.stringify({clientId:id,accessToken:"fake-old",refreshToken:"fake-refresh",expiresAt:Date.now()+(expired?-1000:3600000)}))',[ID,expired])
 def open(self):self.page.locator('.spotify-song-button').click(modifiers=['Shift'])
 def pending(self,age=0):self.page.evaluate('([id,age,uri])=>sessionStorage.setItem("musicrequest.spotify.pkce",JSON.stringify({clientId:id,state:"expected",verifier:"v".repeat(64),createdAt:Date.now()-age,redirectUri:uri}))',[ID,age,self.base+'/dj/spotify-callback.html'])
 def test_search_selection_and_dashboard(self):
  self.session();self.open();self.page.locator('.spotify-result').wait_for();self.assertEqual(parse_qs(urlparse(self.searches[0].url).query)['q'],['Bailando Enrique Iglesias']);self.page.locator('input[name=spotify-track]').check();self.assertIn('Ausgewählt: Bailando',self.page.locator('.spotify-selected').inner_text());self.assertTrue(self.page.get_by_role('button',name='Zur Spotify-Playlist hinzufügen',exact=True).is_disabled())
  self.page.get_by_role('button',name='Schließen',exact=True).click();self.page.get_by_role('button',name='Als gespielt markieren: Bailando',exact=True).click();self.page.wait_for_function('document.querySelector("#open-count").textContent==="0"');self.page.locator('#show-done').check()
  with self.page.expect_download() as download:self.page.locator('#export').click()
  self.assertIn('Bailando',Path(download.value.path()).read_text(encoding='utf-8-sig'));self.assertEqual(self.page.locator('.category-select').count(),0)
 def test_refresh(self):
  self.session(True);self.open();self.page.locator('.spotify-result').wait_for();self.assertEqual(self.tokens[0]['grant_type'],['refresh_token']);self.assertEqual(self.searches[0].headers['authorization'],'Bearer fake-access');self.assertNotIn('fake-access',self.page.content())
 def test_concurrent_refresh_is_shared(self):
  self.session(True)
  self.page.evaluate("async()=>{const api=await import('../src/spotify-api.js');await Promise.all([api.searchTracks('first'),api.searchTracks('second')]);}")
  self.assertEqual(len(self.tokens),1);self.assertEqual(len(self.searches),2)
 def test_401_retry_once(self):
  self.session();calls=[]
  def route(r):
   calls.append(1)
   if len(calls)==1:r.fulfill(status=401,json={})
   else:r.fulfill(json={'tracks':{'items':[TRACK]}})
  self.page.route('https://api.spotify.com/v1/search?*',route);self.open();self.page.locator('.spotify-result').wait_for();self.assertEqual(len(calls),2);self.assertEqual(len(self.tokens),1)
 def test_rate_limit(self):
  self.session();self.page.route('https://api.spotify.com/v1/search?*',lambda r:r.fulfill(status=429,headers={'Retry-After':'12','Access-Control-Expose-Headers':'Retry-After'},json={}));self.open();self.page.locator('.spotify-status').filter(has_text='12 Sekunden').wait_for()
 def test_forbidden_and_network_failure(self):
  self.session();self.page.route('https://api.spotify.com/v1/search?*',lambda r:r.fulfill(status=403,json={}))
  self.open();self.page.locator('.spotify-status').filter(has_text='verweigert').wait_for()
  self.page.route('https://api.spotify.com/v1/search?*',lambda r:r.abort('internetdisconnected'))
  self.page.get_by_role('button',name='Suchen',exact=True).click();self.page.locator('.spotify-status').filter(has_text='Internetverbindung').wait_for()
 def test_refresh_rejected(self):
  self.session(True);self.page.route('https://accounts.spotify.com/api/token',lambda r:r.fulfill(status=400,json={}));self.open();self.page.locator('.spotify-status').filter(has_text='Bitte erneut verbinden').wait_for();self.assertIsNone(self.page.evaluate('sessionStorage.getItem("musicrequest.spotify.session")'))
 def test_untrusted_and_empty_results(self):
  self.session();bad={**TRACK,'name':'<img src=x onerror=alert(1)>','album':{'images':[{'url':'https://attacker.invalid/x'}]},'external_urls':{'spotify':'javascript:alert(1)'}};self.page.route('https://api.spotify.com/v1/search?*',lambda r:r.fulfill(json={'tracks':{'items':[bad]}}));self.open();self.page.locator('.spotify-result').wait_for();self.assertIn('<img src=x',self.page.locator('.spotify-result').inner_text());self.assertEqual(self.page.locator('.spotify-result img,.spotify-track-link').count(),0)
  self.page.route('https://api.spotify.com/v1/search?*',lambda r:r.fulfill(json={'tracks':{'items':[]}}));self.page.get_by_role('button',name='Suchen',exact=True).click();self.page.locator('.spotify-status').filter(has_text='Keine Treffer').wait_for()
 def test_pkce_round_trip_and_replay(self):
  self.page.route('https://accounts.spotify.com/authorize?*',lambda r:r.fulfill(content_type='text/html',body='Test OAuth'));self.open()
  with self.page.expect_navigation():self.page.get_by_role('button',name='Mit Spotify verbinden',exact=True).click()
  params=parse_qs(urlparse(self.page.url).query);self.assertEqual(params['code_challenge_method'],['S256']);self.assertIn('playlist-modify-private',params['scope'][0])
  self.page.goto(self.base+'/dj/');pending=self.page.evaluate('JSON.parse(sessionStorage.getItem("musicrequest.spotify.pkce"))');digest=base64.urlsafe_b64encode(hashlib.sha256(pending['verifier'].encode()).digest()).decode().rstrip('=');self.assertEqual(params['code_challenge'],[digest])
  self.page.goto(self.base+'/dj/spotify-callback.html?code=fake-code&state='+pending['state']);self.page.wait_for_url(self.base+'/dj/');self.assertEqual(self.tokens[0]['code_verifier'],[pending['verifier']]);self.assertNotIn('client_secret',self.tokens[0]);self.assertIsNone(self.page.evaluate('sessionStorage.getItem("musicrequest.spotify.pkce")'))
  self.page.goto(self.base+'/dj/spotify-callback.html?code=fake-code&state='+pending['state']);self.page.locator('#spotify-callback-status').filter(has_text='nicht sicher').wait_for();self.assertEqual(len(self.tokens),1);self.assertNotIn('code=',self.page.url)
 def test_wrong_and_expired_state(self):
  for state,age in [('wrong',0),('expected',700000)]:
   self.page.goto(self.base+'/dj/');self.pending(age);self.page.goto(self.base+'/dj/spotify-callback.html?code=fake&state='+state);self.page.locator('#spotify-callback-status').filter(has_text='nicht sicher').wait_for()
  self.assertEqual(len(self.tokens),0)
 def test_denied(self):
  self.pending();self.page.goto(self.base+'/dj/spotify-callback.html?error=access_denied&state=expected');self.page.locator('#spotify-callback-status').filter(has_text='abgebrochen').wait_for();self.assertEqual(len(self.tokens),0)
 def test_logout(self):
  self.session();self.open();self.page.locator('.spotify-result').wait_for();self.page.evaluate('window.emitAuth("SIGNED_OUT")');self.assertFalse(self.page.locator('.spotify-dialog').is_visible());self.assertIsNone(self.page.evaluate('sessionStorage.getItem("musicrequest.spotify.session")'));self.assertFalse(self.page.locator('#request-panel').is_visible())
 def test_mobile_keyboard(self):
  self.page.set_viewport_size({'width':390,'height':844});self.session();self.open();self.page.locator('.spotify-result').wait_for();self.assertTrue(self.page.evaluate('document.documentElement.scrollWidth<=innerWidth'));self.assertTrue(self.page.locator('.spotify-dialog').evaluate('(e)=>e.scrollWidth<=e.clientWidth'));self.page.keyboard.press('Escape');self.assertFalse(self.page.locator('.spotify-dialog').is_visible())
 def playlist_fixture(self,named=True,duplicate=False,paged=False):
  self.session()
  self.page.evaluate("()=>{const key='musicrequest.spotify.session',value=JSON.parse(sessionStorage.getItem(key));value.scope='playlist-read-private playlist-modify-private playlist-modify-public user-read-private';sessionStorage.setItem(key,JSON.stringify(value));}")
  writes=[]
  own={'id':'playlist1','name':'Taberna Flamenca – Requests' if named else 'Andere Playlist','owner':{'id':'owner'}}
  self.page.route('https://api.spotify.com/v1/me',lambda r:r.fulfill(json={'id':'owner'}))
  def playlists(r):
   if r.request.method=='POST':
    writes.append(('create',r.request.post_data_json));r.fulfill(status=201,json={**own,'name':'Taberna Flamenca – Requests'})
   else:r.fulfill(json={'items':[own,{'id':'foreign','name':'Fremde Playlist','owner':{'id':'other'}}],'next':None})
  self.page.route('https://api.spotify.com/v1/me/playlists**',playlists)
  def items(r):
   if r.request.method=='POST':writes.append(('add',r.request.post_data_json));r.fulfill(status=201,json={'snapshot_id':'test'})
   elif paged and 'offset=50' not in r.request.url:r.fulfill(json={'items':[],'next':'https://api.spotify.com/v1/playlists/playlist1/items?offset=50'})
   else:r.fulfill(json={'items':[{'item':TRACK}] if duplicate else [],'next':None})
  self.page.route('https://api.spotify.com/v1/playlists/playlist1/items**',items)
  return writes
 def choose_track(self):
  self.open();self.page.locator('.spotify-result').wait_for();self.page.locator('input[name=spotify-track]').check()
 def load_target(self):
  self.page.get_by_role('button',name='Playlists laden',exact=True).click();self.page.locator('#spotify-playlist option[value=playlist1]').wait_for(state='attached')
 def test_playlist_add_and_double_click(self):
  writes=self.playlist_fixture();self.choose_track();self.load_target()
  self.assertEqual(self.page.locator('#spotify-playlist option[value=foreign]').count(),0)
  self.page.get_by_role('button',name='Zur Spotify-Playlist hinzufügen',exact=True).dblclick()
  self.page.locator('.spotify-status').filter(has_text='wurde zu').wait_for()
  self.assertEqual(writes,[('add',{'uris':['spotify:track:track1']})])
 def test_playlist_duplicate_on_later_page(self):
  writes=self.playlist_fixture(duplicate=True,paged=True);self.choose_track();self.load_target();self.page.get_by_role('button',name='Zur Spotify-Playlist hinzufügen',exact=True).click();self.page.locator('.spotify-status').filter(has_text='kein Duplikat').wait_for();self.assertEqual(writes,[])
 def test_playlist_create_private(self):
  writes=self.playlist_fixture(named=False);self.open();self.page.get_by_role('button',name='Requests-Playlist anlegen / auswählen',exact=True).click();self.page.locator('.spotify-status').filter(has_text='Requests-Playlist ausgewählt').wait_for();self.assertEqual(writes[0][0],'create');self.assertEqual(writes[0][1]['public'],False);self.assertEqual(self.page.locator('#spotify-playlist').input_value(),'playlist1')
 def test_playlist_reuse_existing(self):
  writes=self.playlist_fixture();self.open();self.page.get_by_role('button',name='Requests-Playlist anlegen / auswählen',exact=True).click();self.page.locator('.spotify-status').filter(has_text='Requests-Playlist ausgewählt').wait_for();self.assertEqual(writes,[])
 def test_playlist_requires_new_consent(self):
  self.session();self.open();self.page.get_by_role('button',name='Playlists laden',exact=True).click();self.page.locator('.spotify-status').filter(has_text='zusätzlichen Playlist-Berechtigungen').wait_for()
 def test_playlist_uncertain_write_not_retried(self):
  self.playlist_fixture();calls=[]
  def items(r):
   if r.request.method=='POST':calls.append(1);r.abort('internetdisconnected')
   else:r.fulfill(json={'items':[],'next':None})
  self.page.route('https://api.spotify.com/v1/playlists/playlist1/items**',items)
  self.choose_track();self.load_target();self.page.get_by_role('button',name='Zur Spotify-Playlist hinzufügen',exact=True).click();self.page.locator('.spotify-status').filter(has_text='möglicherweise ausgeführt').wait_for();self.assertEqual(len(calls),1)
 def test_quick_add_without_confirmation(self):
  writes=self.playlist_fixture();self.page.locator('.spotify-song-button').click()
  self.page.locator('.spotify-quick-notice').filter(has_text='Hinzugefügt: Bailando').wait_for()
  self.assertFalse(self.page.locator('.spotify-dialog').is_visible());self.assertEqual(writes,[('add',{'uris':['spotify:track:track1']})])
  self.page.get_by_role('button',name='Manuell suchen',exact=True).click();self.page.locator('.spotify-result').wait_for()
 def test_quick_add_duplicate(self):
  writes=self.playlist_fixture(duplicate=True);self.page.locator('.spotify-song-button').click();self.page.locator('.spotify-quick-notice').filter(has_text='Bereits enthalten').wait_for();self.assertEqual(writes,[])
 def test_quick_add_empty_falls_back(self):
  writes=self.playlist_fixture();self.page.route('https://api.spotify.com/v1/search?*',lambda r:r.fulfill(json={'tracks':{'items':[]}}));self.page.locator('.spotify-song-button').click();self.page.locator('.spotify-dialog').wait_for();self.assertEqual(writes,[])
 def test_quick_add_requires_consent(self):
  self.session();self.page.locator('.spotify-song-button').click();self.page.locator('.spotify-status').filter(has_text='Playlist-Berechtigungen').wait_for()
 def test_quick_add_remembers_other_playlist(self):
  writes=self.playlist_fixture(named=False);self.open();self.load_target();self.page.locator('#spotify-playlist').select_option('playlist1');self.page.get_by_role('button',name='Schließen',exact=True).click();self.page.locator('.spotify-song-button').click();self.page.locator('.spotify-quick-notice').filter(has_text='Andere Playlist').filter(has_text='Hinzugefügt').wait_for();self.assertEqual(writes,[('add',{'uris':['spotify:track:track1']})])
if __name__=='__main__':unittest.main()
