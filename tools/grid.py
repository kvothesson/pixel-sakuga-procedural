"""Captura una escena en varios instantes y arma una grilla para revisarla de un vistazo.
Uso: python3 tools/grid.py escenas/X/index.html salida.png 0 1.5 2.3 ... [--w 500 --h 900 --cols 6]
"""
import asyncio, sys, pathlib, argparse
from playwright.async_api import async_playwright
from PIL import Image
ap=argparse.ArgumentParser();ap.add_argument('page');ap.add_argument('out');ap.add_argument('times',nargs='+',type=float)
ap.add_argument('--w',type=int,default=500);ap.add_argument('--h',type=int,default=900);ap.add_argument('--cols',type=int,default=6)
a=ap.parse_args()
async def main():
    async with async_playwright() as p:
        b=await p.chromium.launch();pg=await b.new_page(viewport={'width':a.w,'height':a.h})
        errs=[];pg.on('pageerror',lambda e:errs.append(str(e)))
        await pg.goto(pathlib.Path(a.page).resolve().as_uri());await pg.wait_for_timeout(1200);await pg.click('#toggle')
        ims=[]
        for i,t in enumerate(a.times):
            await pg.evaluate(f'window.__seek({t})');f=f'/tmp/_g{i}.png';await pg.locator('#stage').screenshot(path=f);ims.append(Image.open(f))
        await b.close()
    w,h=ims[0].size;c=a.cols;r=(len(ims)+c-1)//c;g=Image.new('RGB',(w*c,h*r))
    for i,im in enumerate(ims):g.paste(im,((i%c)*w,(i//c)*h))
    g.thumbnail((1800,1800));g.save(a.out);print('errores:',errs)
asyncio.run(main())
