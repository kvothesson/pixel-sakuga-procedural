"""Captura el instante clave de cada plano del Ep. 10 en escenas/otra-vez-ep10/storyboard/. Uso: python3 tools/storyboard.py"""
import asyncio,pathlib,json
from playwright.async_api import async_playwright
# instante clave de cada plano (segundos dentro del plano)
KEY={'gancho':1.75,'azotea':2,'mano':1.15,'miran':1.4,'sigue':1.6,'sale':1.9,'cut_eco':.9,'kurenai':1.85,'devolvio':1,'aoi':1.3,'rayo':2.2,'cae':.5,
     'entiende':1.5,'quieto':3.2,'ahora':.9,'golpe':.58,'rompe':1.6,'calma':1.0,'otravez':1.55}
async def main():
    async with async_playwright() as p:
        b=await p.chromium.launch();pg=await b.new_page(viewport={'width':405,'height':800},device_scale_factor=1)
        await pg.goto(pathlib.Path('escenas/otra-vez-ep10/index.html').resolve().as_uri());await pg.wait_for_timeout(1300);await pg.click('#toggle')
        shots=await pg.evaluate("window.__SEQ.shots.map(s=>({id:s.id,t0:s.t0,dur:s.dur}))")
        for i,sh in enumerate(shots):
            await pg.evaluate(f"window.__seek({sh['t0']+KEY[sh['id']]})")
            await pg.locator('#stage').screenshot(path=f"escenas/otra-vez-ep10/storyboard/{i+1:02d}-{sh['id']}.png")
        json.dump(shots,open('/tmp/shots.json','w'));await b.close()
asyncio.run(main())
