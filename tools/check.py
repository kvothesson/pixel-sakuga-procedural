"""Abre cada escena, la recorre con __seek en varios instantes y reporta errores de JavaScript.
Uso: python3 tools/check.py                 (todas las escenas de escenas/*/index.html)
     python3 tools/check.py escenas/X/index.html ...
Correr SIEMPRE antes de publicar: un error en el motor congela la escena en el primer cuadro.
"""
import asyncio, sys, glob, pathlib
from playwright.async_api import async_playwright
IGNORAR=('ERR_TUNNEL_CONNECTION_FAILED','ERR_INTERNET_DISCONNECTED','fonts.g')
async def revisar(pg,path):
    errs=[]
    pg.on('pageerror',lambda e:errs.append(str(e).split('\n')[0]))
    await pg.goto(pathlib.Path(path).resolve().as_uri());await pg.wait_for_timeout(1500)
    for t in [i*0.7 for i in range(16)]+[11+i*2.5 for i in range(20)]:
        try:await pg.evaluate(f'window.__seek({t})')
        except Exception as e:errs.append(f't={t:.1f}: '+str(e).split('\n')[1][:160]);break
    return [e for e in errs if not any(x in e for x in IGNORAR)]
async def main():
    paths=sys.argv[1:] or sorted(glob.glob('escenas/*/index.html'))
    async with async_playwright() as p:
        b=await p.chromium.launch();malos=0
        for path in paths:
            pg=await b.new_page(viewport={'width':500,'height':900});errs=await revisar(pg,path);await pg.close()
            print(('OK   ' if not errs else 'FALLA')+'  '+path+('' if not errs else '\n       '+'\n       '.join(errs[:3])));malos+=bool(errs)
        await b.close();sys.exit(1 if malos else 0)
asyncio.run(main())
