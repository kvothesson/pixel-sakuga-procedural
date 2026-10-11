"""Renderiza una escena a MP4 1080×1920 listo para YouTube (Shorts), con los globos de texto del DOM incluidos.

Video: cuadro por cuadro con window.__seek(t) (determinista, no depende de la velocidad de la máquina).
Audio: una pasada en tiempo real grabando el master de Web Audio con MediaRecorder.
Después ffmpeg junta las dos cosas (H.264 + AAC, faststart).

Uso: python3 tools/render_mp4.py escenas/X/index.html salida.mp4 [--fps 30] [--dur SEGUNDOS] [--font carpeta-con-woff2]
"""
import asyncio, argparse, base64, pathlib, shutil, subprocess, tempfile
from playwright.async_api import async_playwright

ap = argparse.ArgumentParser()
ap.add_argument('page'); ap.add_argument('out')
ap.add_argument('--fps', type=int, default=30)
ap.add_argument('--dur', type=float, default=None, help='por defecto, el largo del loop de la escena')
ap.add_argument('--font', default=None, help='carpeta con dotgothic16-latin-400-normal.woff2 (sin red, Google Fonts no carga)')
a = ap.parse_args()

# el stage mide 360×640 CSS a escala 3: sale 1080×1920 y los globos tienen el tamaño de un celular
VIEW = {'width': 392, 'height': 900}
CSS = """.stage{border-radius:0!important;box-shadow:none!important}.controls{display:none!important}"""

async def setup(b, path):
    pg = await b.new_page(viewport=VIEW, device_scale_factor=3)
    await pg.goto(pathlib.Path(path).resolve().as_uri())
    css = CSS
    if a.font:
        f = pathlib.Path(a.font).resolve() / 'dotgothic16-latin-400-normal.woff2'
        css += "@font-face{font-family:'DotGothic16';src:url('%s') format('woff2')}" % f.as_uri()
    await pg.add_style_tag(content=css)
    await pg.evaluate("document.fonts.load('16px DotGothic16')")
    await pg.wait_for_timeout(800)
    return pg

async def main():
    tmp = pathlib.Path(tempfile.mkdtemp(prefix='render_'))
    async with async_playwright() as p:
        b = await p.chromium.launch(args=['--autoplay-policy=no-user-gesture-required'])
        pg = await setup(b, a.page)
        await pg.evaluate('Sakuga.running=false')  # pausa: el video sale de __seek, no del reloj
        dur = a.dur or await pg.evaluate('Sakuga.scene.loop')
        n = round(dur * a.fps)
        stage = pg.locator('#stage')
        for i in range(n):
            await pg.evaluate(f'window.__seek({i / a.fps})')
            await stage.screenshot(path=str(tmp / f'{i:05d}.png'))
            if i % 150 == 0: print(f'cuadro {i}/{n}', flush=True)
        await pg.close()

        # audio en tiempo real: se graba el master desde t=0 durante todo el largo
        pg = await setup(b, a.page)
        await pg.evaluate("document.getElementById('sound').click()")
        await pg.wait_for_timeout(300)
        b64 = await pg.evaluate("""async (dur)=>{
          const S=Sakuga,A=S.audio,dest=A.ctx.createMediaStreamDestination();A.master.connect(dest);
          const rec=new MediaRecorder(dest.stream,{mimeType:'audio/webm;codecs=opus',audioBitsPerSecond:192000}),chunks=[];
          rec.ondataavailable=e=>e.data.size&&chunks.push(e.data);const done=new Promise(r=>rec.onstop=r);
          S.t=0;S.running=true;rec.start(250);
          await new Promise(r=>setTimeout(r,dur*1000+400));rec.stop();await done;
          const buf=await new Blob(chunks).arrayBuffer();let s='';const u=new Uint8Array(buf);
          for(let i=0;i<u.length;i+=32768)s+=String.fromCharCode.apply(null,u.subarray(i,i+32768));return btoa(s)}""", dur)
        (tmp / 'audio.webm').write_bytes(base64.b64decode(b64))
        await b.close()
    print('codificando…', flush=True)
    subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-framerate', str(a.fps), '-i', str(tmp / '%05d.png'),
                    '-i', str(tmp / 'audio.webm'), '-t', str(dur),
                    '-c:v', 'libx264', '-preset', 'slow', '-crf', '16', '-pix_fmt', 'yuv420p', '-r', str(a.fps),
                    '-af', 'loudnorm=I=-14:TP=-1.5:LRA=11', '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-movflags', '+faststart', a.out], check=True)
    shutil.rmtree(tmp)
    print('listo:', a.out)

asyncio.run(main())
