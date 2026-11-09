"""Guest theme/browser regression. All submissions use a simulated Supabase client."""
import threading, unittest
from functools import partial
from http.server import SimpleHTTPRequestHandler,ThreadingHTTPServer
from pathlib import Path
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]
class Quiet(SimpleHTTPRequestHandler):
 def log_message(self,*_):pass
class BohoGuestTests(unittest.TestCase):
 @classmethod
 def setUpClass(cls):
  cls.server=ThreadingHTTPServer(('127.0.0.1',0),partial(Quiet,directory=str(ROOT)));threading.Thread(target=cls.server.serve_forever,daemon=True).start();cls.base=f'http://127.0.0.1:{cls.server.server_port}'
  cls.pw=sync_playwright().start();cls.browser=cls.pw.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
 @classmethod
 def tearDownClass(cls):cls.browser.close();cls.pw.stop();cls.server.shutdown();cls.server.server_close()
 def setUp(self):
  self.context=self.browser.new_context(viewport={'width':390,'height':844});self.page=self.context.new_page();self.errors=[];self.bad=[]
  self.page.on('pageerror',lambda e:self.errors.append(str(e)))
  self.page.on('response',lambda r:self.bad.append((r.url,r.status)) if r.status>=400 else None)
  self.page.route('**/src/client.js',lambda r:r.fulfill(content_type='application/javascript',body='export async function getClient(){return {rpc:async(name,args)=>{window.sent=(window.sent||[]).concat({name,args});return {error:window.mockError||null}}}}'))
  self.page.goto(self.base+'/');self.page.evaluate('document.fonts.ready')
 def tearDown(self):self.context.close()
 def fill(self,category):
  self.page.locator('#guest').fill('Ana');self.page.locator('#title').fill('Bailando');self.page.locator('#artist').fill('Enrique Iglesias');self.page.locator(f'.category-choice:has(input[value="{category}"])').click()
 def test_layout_and_assets(self):
  for width in [320,375,390,430,768,1080,1440]:
   self.page.set_viewport_size({'width':width,'height':900})
   self.assertTrue(self.page.evaluate('document.documentElement.scrollWidth<=innerWidth'))
   self.assertTrue(self.page.locator('.guest-logo').evaluate('(e)=>e.complete&&e.naturalWidth>0'))
   self.assertTrue(self.page.evaluate('document.fonts.check("20px Flamenca Dry Brush")'))
   self.assertTrue(self.page.evaluate('document.fonts.check("20px Flamenca Hand")'))
   for selector in ['#guest','#title','#artist','#submit','.category-choice']:
    for box in self.page.locator(selector).all():self.assertGreaterEqual(box.bounding_box()['height'],44)
   self.assertEqual(self.page.locator('.category-choice').count(),3)
  self.assertEqual(self.errors,[]);self.assertEqual(self.bad,[])
 def test_required_validation(self):
  self.page.locator('#submit').click();self.assertIsNone(self.page.evaluate('window.sent'))
  self.page.locator('#guest').fill('Ana');self.page.locator('#title').fill('Song');self.page.locator('#artist').fill('Artist');self.page.locator('#submit').click();self.assertIsNone(self.page.evaluate('window.sent'))
 def test_all_categories_and_success(self):
  token=None
  for category in ['german','latino','international']:
   self.fill(category);self.page.locator('#submit').click();self.page.locator('#feedback.success').wait_for()
   sent=self.page.evaluate('window.sent.at(-1)');self.assertEqual(sent['name'],'submit_song_request_v3');self.assertEqual(sent['args']['p_category'],category);self.assertEqual(sent['args']['p_song_title'],'Bailando')
   if token:self.assertEqual(token,sent['args']['p_client_token'])
   token=sent['args']['p_client_token'];self.assertEqual(self.page.locator('#title').input_value(),'');self.assertIn('DJ TomaKetama knows what you like!',self.page.locator('#feedback').inner_text())
 def test_existing_error_messages(self):
  for err,expected in [({'message':'RATE_LIMIT'},'Please wait a moment'),({'code':'PGRST202'},'temporarily unavailable'),({'message':'offline'},"Couldn't send your request")]:
   self.page.evaluate('(e)=>window.mockError=e',err);self.fill('latino');self.page.locator('#submit').click();self.page.locator('#feedback.error').filter(has_text=expected).wait_for();self.assertTrue(self.page.locator('#submit').is_enabled())
 def test_keyboard_and_reduced_motion(self):
  self.page.locator('#guest').focus();self.page.keyboard.press('Tab');self.assertTrue(self.page.locator('#title').evaluate('(e)=>e===document.activeElement'))
  self.page.emulate_media(reduced_motion='reduce');self.assertEqual(self.page.locator('.glow-field').first.evaluate('(e)=>getComputedStyle(e).transitionDuration'),'0s')
if __name__=='__main__':unittest.main()
