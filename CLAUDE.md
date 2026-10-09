# Pixel Sakuga Procedural

Escenas de acción con dirección de anime (sakuga) en pixel art generado por código. Cada escena es una página HTML autocontenida con canvas, sin build ni dependencias.

## Antes de tocar nada
- Leer `guia/pixel-sakuga-procedural.md`: ahí está todo lo que funciona, lo que no y por qué. Es la fuente de verdad de la técnica.
- Cada aprendizaje nuevo (algo que funcionó, algo que falló, un bug visual) se agrega a la guía **en el mismo commit** que el cambio.

## Reglas firmes
- Personajes = esqueleto de poses pixelado por código. **No usar sprites dibujados a mano en ASCII**: se probó y no funcionó.
- Nada de líneas internas de 1 px dentro del cuerpo: se leen como líneas guía del esqueleto.
- Solo primitivas pixel (`fillRect`, Bresenham, discos por filas, dither Bayer) sobre un buffer de baja resolución escalado con factor entero. Sin `arc`, gradientes ni antialias en el buffer.
- Todo lo aleatorio sale de `hash(n)`, así cualquier instante es reproducible con `window.__seek(t)`.
- Personajes originales. Nada que se parezca a uno con copyright (cuidado con el pelo blanco en punta).
- Regla 1 + 1: cada escena nueva estrena una técnica y un gancho para el espectador.

## Estructura
- `engine/sakuga.js`: motor compartido (primitivas, cámara, poses, física Verlet, efectos, sonido, runtime). Las escenas nuevas se construyen sobre él.
- `engine/sakuga3d.js`: extensión 3D (cámara orbital, esqueleto con profundidad y giro, física 3D, piso en perspectiva). Se carga después del motor.
- `engine/produccion.js`: secuenciador de planos en beats, música procedural, exportación de video.
- `tools/bundle.py`: inlinea el motor y deja una escena en un único HTML para compartirla.
- `guia/`: la guía viva de la técnica.
- `escenas/<nombre>/index.html`: una escena por carpeta, abrible directo en el navegador o con GitHub Pages.
- `escenas/archivo/`: versiones anteriores, como historial del estilo.
- `escenas/otra-vez/` y `escenas/kessen-16bit/` son anteriores al motor y siguen siendo autocontenidas. No migrarlas salvo que se pida.

## Cómo verificar una escena
Antes de publicar: `python3 tools/check.py` (abre todas las escenas, las recorre y falla si hay errores de JavaScript; un error en el motor congela la escena en el título).
Abrirla con Playwright, pausar, llamar `window.__seek(t)` en 6 a 12 momentos clave, sacar capturas y armar una grilla para revisarla de un vistazo. Una sola pasada de correcciones por revisión.

## Próximos pasos
Ep. 10 (episodio completo, 60 s) en producción por etapas; frenar al final de cada una:
1. ~~Secuenciador, música, exportación + animatic~~ (hecho).
2. Planos 1–6 (gancho y el eco) en calidad final.
3. Planos 7–15 (la pelea).
4. Planos 16–21 (clímax, amanecer) y pulido.
El guion está en `escenas/otra-vez-ep10/index.html` (constante `SEQ`). Correr `tools/check.py` antes de publicar.
