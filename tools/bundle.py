"""Empaqueta una escena en un solo HTML autocontenido (inlinea los <script src> locales).
Uso: python3 tools/bundle.py escenas/otra-vez-ep2/index.html salida.html
"""
import re, sys, pathlib
src = pathlib.Path(sys.argv[1]); out = pathlib.Path(sys.argv[2])
html = src.read_text(encoding='utf-8')
def inline(m):
    path = (src.parent / m.group(1)).resolve()
    return '<script>\n' + path.read_text(encoding='utf-8') + '\n</script>'
html = re.sub(r'<script src="(?!https?:)([^"]+)"></script>', inline, html)
out.write_text(html, encoding='utf-8'); print(f'{out} ({len(html)//1024} KB)')
