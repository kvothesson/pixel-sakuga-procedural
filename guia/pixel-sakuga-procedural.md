# Pixel Sakuga Procedural — guía reutilizable

Técnica para hacer escenas de acción con dirección de anime (sakuga) en **pixel art generado por código**, en una sola página HTML con canvas. Salió de iterar tres versiones (neón, siluetas vectoriales y pixel art) y de un intento fallido con sprites dibujados a mano.

**Idea central:** el código no compite con un estudio en *dibujo*, pero sí puede competir en *ritmo, timing y efectos*. Hay que elegir un estilo donde la simplicidad sea estética (pixel art) y poner todo el esfuerzo en la dirección.

---

## 1. Qué funcionó y qué no

| Funcionó | No funcionó |
|---|---|
| Personajes como **esqueleto de poses** (11 articulaciones) pixelado en cada frame | **Sprites ASCII dibujados a mano**: proporciones raras, no se leen como personajes |
| Pixel art a baja resolución: lo tosco se lee como intencional | Vector o canvas con antialias: se nota que es "dibujo de código" |
| Siluetas con un **rasgo distintivo** (capucha; coleta + bufanda) | Pelo en punta: parecía una mano abierta y se acercaba a un personaje conocido |
| Contorno + **1 px de luz del lado de la fuente** (luna) | Contorno parejo: el personaje queda plano |
| Puños grandes (disco en cada mano) | Manos del grosor del brazo: no se lee quién pega |
| Primeros planos de **ojos** con sprite chico escalado | Rostros en plano general: con pocos píxeles se pierden |

**Bug a evitar:** no dibujar líneas de 1 px dentro del cuerpo (por ejemplo, una línea de brillo del pecho a la cadera). Se leen como **líneas guía del esqueleto**. Si hace falta brillo, que sea en el borde (rim light), nunca en el medio.

---

## 2. Pipeline técnico

1. **Buffer de baja resolución:** se dibuja en un canvas offscreen de unos 150 px en su lado corto.
   - `PX = max(1, round(min(Wd,Hd)/150))`, `PW = ceil(Wd/PX)`, `PH = ceil(Hd/PX)` (Wd y Hd en píxeles de dispositivo).
   - Se escala al canvas real con `imageSmoothingEnabled=false` y un factor **entero**. CSS: `image-rendering: pixelated`.
2. **Solo primitivas pixel**, sin `arc` ni gradientes del canvas (generan antialias):
   - `R(x,y,w,h,c)`: `fillRect` con coordenadas redondeadas.
   - `line()`: Bresenham con pincel cuadrado de ancho `w` (sirve para extremidades, rayos y líneas de foco).
   - `disc()`: círculo relleno por filas (cabezas, puños, luna, núcleo de energía).
   - `ring()`: elipse punteada (ondas expansivas).
   - **Dither Bayer 4×4** (`ditherDisc`, `ditherFill`) en lugar de alpha: auras, halos, humo, flashes y fundidos.
   - `pixText()`: renderiza el texto en un canvas aparte, umbraliza el alpha (>110) y lo pinta píxel por píxel. Sirve para kanjis en los impact frames y sellos.
3. **Cámara manual:** `toPx(wx,wy) = [cx + (wx-camX)*k, cy + (wy-camY)*k]` con `k = zoom*u` y `u = PH/420` (o `PW/220` en vertical). El zoom cambia cuántos píxeles mide cada unidad, pero todo se sigue dibujando en la grilla, así que nunca se pierde la nitidez.
   - El shake se aplica en **píxeles enteros**, sorteado a 24 fps con un hash.
4. **Determinismo:** todo lo aleatorio sale de `hash(n)` (seno fractal), nada de `Math.random()` por frame. Así cualquier `t` se puede reproducir, pausar o adelantar (`window.__seek(t)` para testear).
5. **Tipografía:** *DotGothic16* (Google Fonts) cubre el japonés y el latín en estilo pixel. Se usa para subtítulos (DOM), UI y `pixText`.

---

## 3. Personajes

- **Esqueleto:** `hip, chest, head, lE, lH, rE, rH, lK, lF, rK, rF` en unidades de mundo (unos 95 de alto), mirando a la derecha, con y negativo hacia arriba.
- **Poses base:** `stance`, `stance2` (respiración), `crouch` (anticipación), `dash`, `strike`, `after` (remate agachado). Se interpolan con `lerpPose`.
- **Transformación:** `dir` (±1 para espejar), `rot` (pivote en los pies, para caídas o ataques en picada), `x` e `y`.
- **Capas de dibujo**, en orden:
  1. Contorno: todo con grosor +2, en negro o en el color del aura si está "encendido".
  2. Rim light: todo con grosor 0, en el color de la luz, desplazado 1 px hacia la fuente.
  3. Cuerpo: colores reales (abrigo, pantalón, piel, guantes, rasgo distintivo).
  4. Detalle: un píxel de ojo brillante.
- **Modo `ink`:** el cuerpo entero en un solo color. Sirve para impact frames e imágenes fantasma.
- **Rasgos que leen bien a baja resolución:** capucha (disco grande y punta hacia atrás), coleta o bufanda (cadena de segmentos con onda senoidal). Un personaje = una silueta reconocible.

---

## 4. Dirección (lo que da la sensación de sakuga)

### Timing mixto
- **Respiración en threes (8 fps):** `floor(t*8)/8`.
- **Movimiento en twos (12 fps):** posiciones y poses con `floor(t*12)/12`.
- **Efectos en ones (24 fps):** rayos, impact frames y líneas de foco.
- La cámara puede ir fluida o a 24.

### Recursos, en orden de impacto
1. **Anticipación:** 3 o 4 cuadros agachado antes de salir. Sin eso, el golpe no pesa.
2. **Hit-stop:** congelar el mundo entero 0,1 a 0,15 s en el contacto (fijar `t` mientras se dibuja), **en silencio**.
3. **Impact frames:** 0,4 a 0,6 s alternando fondo blanco con tinta negra, fondo negro con tinta blanca y fondo rojo con tinta negra, cada 2 cuadros a 24 fps. Llevan líneas de foco, siluetas en `ink`, un estallido invertido y un kanji gigante (衝).
4. **Líneas de foco (集中線):** líneas radiales desde los bordes hasta un radio interior aleatorio.
5. **Speed lines** horizontales durante la embestida.
6. **Imágenes fantasma:** 3 copias en `ink` con el color del aura, cada vez más oscuras, en las posiciones de los cuadros anteriores.
7. **Corte de plano:** dentro de una cámara lenta larga, a mitad, cortar a otro encuadre (los pies que quiebran el piso).
8. **Pausa antes de la reacción:** el golpeado se queda quieto con el tajo y recién después cae.
9. **Flash:** `ditherFill` blanco que sube y después baja con el corte.
10. **Letterbox** de 7,5 % arriba y abajo, y fundido con dither.

### Plantilla de timeline (duelo, unos 10 s)
```
0.0  carga (auras, brasas, zoom lento)        "—Frase corta."
2.0  anticipación (crouch)
2.35 embestida (easeIn, fantasmas, speed lines)
2.9  hit-stop (silencio)
3.05 impact frames
3.6  choque en cámara lenta (rayos, ondas, escombros, grietas)
4.6  corte a los pies
5.0  vuelta al choque, flash creciente
5.9  remate: pasaron de largo, de espaldas         "—…Demasiado lento."
6.5  tajo · pausa · 7.25 caída
7.9  primer plano de ojos + sello 決着
9.5  fundido
```

---

## 5. Sonido (Web Audio, sin archivos)

Se activa con un botón, porque los navegadores exigen un gesto del usuario. Pasa por un compresor antes de la salida.

| Efecto | Receta |
|---|---|
| Zumbido de energía | 3 sierras (55, 55,6 y 82,4 Hz) → lowpass a 320 Hz → ganancia por fase (`setTargetAtTime`) |
| Inhalar / subida | Ruido bandpass o highpass con barrido ascendente y ganancia que **crece** |
| Whoosh | Ruido bandpass de 2200 a 280 Hz en 0,5 s |
| BOOM | Seno de 150 a 32 Hz + ruido lowpass de 5000 a 180 Hz + cuadrada corta grave |
| Chisporroteo | Ráfagas de ruido highpass de 50 ms, sorteadas con hash en cada frame a 24 fps |
| Tajo metálico | Dos triángulos agudos levemente desafinados (2400 y 3150 Hz) + ruido highpass muy corto |
| Caída / sello | Seno grave corto (115 a 45 Hz), más un bandpass corto para el "toc" |
| Lluvia | Ruido en loop → highpass a 1200 Hz → lowpass a 7000 Hz, ganancia baja constante |

- **El silencio es un efecto:** cortar el zumbido a 0 en el hit-stop (constante de tiempo de 8 ms) hace que el BOOM pegue el doble.
- Los eventos se disparan cuando `t` cruza su marca entre un frame y el siguiente, contemplando el salto del loop.

---

## 6. Loops que enganchan (shorts)

- **Gancho en el primer segundo:** arrancar con algo que ya está pasando (ojos que se abren con brillo y un sonido) y, si suma, un texto corto ("NO PARPADEES").
- **Loop perfecto:** que el último cuadro sea igual al primero. Funciona muy bien cerrar en los ojos que se cierran y abrir con los ojos que se abren.
- **Narrativa circular:** una frase que haga que el loop tenga sentido ("—Otra vez."). Así el espectador siente que la escena se repite a propósito.
- **Formato vertical 9:16:** acción en el eje vertical (ataque que cae desde arriba). Personaje grande, con unas 220 unidades de ancho visibles.
- **Duración:** de 7 a 9 s, para que el loop se vea varias veces.

---

## 7. Checklist antes de publicar

- [ ] Sin antialias: solo `fillRect`, ni `arc` ni `ctx.scale` en el buffer.
- [ ] Sin líneas internas tipo esqueleto.
- [ ] Cada personaje se reconoce en silueta y no se parece a uno con copyright.
- [ ] La anticipación, el hit-stop y la pausa antes de la reacción están.
- [ ] Los impact frames van a 24 fps; el movimiento, a 12.
- [ ] Hay silencio en el hit-stop.
- [ ] Funciona a 400 px de ancho; el stage tiene el aspecto correcto (16:9, 4:5 o 9:16).
- [ ] `prefers-reduced-motion` arranca en pausa en un frame lindo.
- [ ] Revisión visual con capturas en momentos clave vía `__seek(t)`.

---

## 8. El motor (`engine/sakuga.js`) — desde el Ep. 2

Una escena ya no copia código: carga el motor y define solo **personajes + `state(t)` puro + `render(s)`**.

```js
Sakuga.start({
  loop, vertical, camCy, reducedT,
  chars:{id:{head:'hood'|'hair', pal:{…}, chains:[…]}},
  light:{x, rim},               // de qué lado cae el borde de luz
  state(t) → {phase, cam:{zoom,camX,camY,shake}, chars:[{id,pose,x,y,dir,rot,…}], freeze?},
  wind(t) → [wx,wy],            // empuja las cadenas físicas
  render(s), post(s),           // dibujo de la escena (post va encima de todo: lluvia, viento)
  sfx:[[t,fn]], drone(s), ambience(s)→{rain,wind,windFreq}, crackle(s),
  subs, hook, el:{stage,canvas,toggle,sound,sub,hook}
})
```

- **`state(t)` tiene que ser pura**: depende solo de `t`. El motor la llama muchas veces por frame para la física.
- **`freeze`** en el state = hit-stop: el motor congela el tiempo mientras dibuja.
- **Empaquetar para compartir:** `python3 tools/bundle.py escenas/X/index.html salida.html` inlinea el motor en un único HTML.

### Física secundaria determinista (Verlet)
- Cada personaje declara cadenas: `{key, anchor:'head'|'chest'|'hip', off, n, len, w:[inicio,fin], col, tip, tipFrom, grav, wind, when}`.
- **Truco clave:** para dibujar el instante T, se re-simula desde T−0,8 s con paso fijo de 1/60, leyendo `state()` en cada subpaso. Se obtiene física real (inercia, latigazo, viento) que igual es **reproducible**: funciona con seek, con pausa y con loops.
- La física también va en twos: se simula al instante cuantizado a 12 fps y se cachea.
- Si el ancla salta más de 70 unidades entre subpasos (un corte de plano), la cadena se reinicia, para que no se estire como un elástico.
- El abrigo, la bufanda, la coleta y la trenza son cadenas. La diferencia con las poses rígidas se nota al instante: es el mayor salto de calidad desde el pixel art.

### Recursos nuevos del Ep. 2
- **Finta con disolución:** el personaje se dibuja en una capa aparte y se perfora con Bayer (`Sakuga.dissolve(level, fn)`). El puño la atraviesa y ella desaparece en píxeles.
- **Ataque en picada:** las speed lines pasan a vertical (`speedLines(π/2)`) y la cámara inclina hacia arriba.
- **Derrape:** chispas que salen de los pies hacia atrás (`skidSparks`) más un sonido de raspado (bandpass agudo y lowpass grave).
- **Viento visible:** trazos horizontales tenues, lluvia inclinada (`rain(.6)`), un ambiente de viento con un bandpass que sigue la ráfaga y cadenas que flamean.
- **Revelación de diseño:** que se le caiga la capucha y aparezca la trenza genera un gancho de personaje sin tener que dibujar una cara.

### Gancho de serie
- El Ep. 2 abre con los ojos *de ella* y "ESTA VEZ NO", que contesta el "Otra vez" del Ep. 1, y cierra con "—Ahora sí.".
- Cada episodio es un loop perfecto por sí solo, pero la serie avanza. Funciona como teaser del siguiente.

---

## 9. Ep. 3 — vueltas 1 y 2

- **Intercambio de golpes:** jab contra parry, patada contra agachada, uppercut contra esquive. Cada contacto lleva un mini hit-stop (0,06 s), una chispa y un sonido `tap`. Los que no conectan llevan un `swish`.
- **Cámara inclinada (dutch angle):** se rota el buffer ya dibujado con vecino más cercano. Las líneas quedan con los dientes típicos del Mode 7 de la SNES y no se pierde el pixel art. Se escala un poco para no ver esquinas negras.
- **Primer plano partido:** `closeup(open, flare, look, region)` dibuja dentro de un recorte. Dos regiones forman una pantalla partida.
- **Teaser de un tercer personaje:** una silueta negra en la antena que solo se revela con el flash de un rayo, y después queda con borde y ojos verdes.
- **Arcos (en el motor, para todas las escenas):** `lerpPose` interpola cada hueso por ángulo alrededor de su padre. Los miembros barren en curva y no se acortan. `lerpPoseLinear` queda para casos puntuales.
- **Smears automáticos:** si una mano o un pie avanza más de 18 unidades entre cuadros a 12 fps, el motor dibuja el arco recorrido como un trazo que se afina, con contorno y borde de luz incluidos.
- **Lección de física:** una cadena con poca amortiguación queda como un palo cuando el ancla baja de golpe. Para bufandas y coletas conviene `damp` entre 0,88 y 0,9 y `grav` cerca de 1.

---

## 10. Ep. 4 — anatomía

- **`poly(pts)`:** relleno por líneas de barrido, sin antialias. Es la base de toda forma que no sea una línea o un círculo.
- **`limb(a, b, wa, wb)`:** trapecio más articulaciones redondeadas. Los miembros se afinan hacia los extremos (muslo 12 → rodilla 9 → tobillo 5,5), y los brazos igual (8 → 6,5 → 5).
- **Torso de 6 puntos:** hombros (10,5 de medio ancho), cintura (7) y cadera (8), con hombros redondeados con discos. Pasar del tubo al torso es lo que más "humaniza".
- **Pies con punta** (8 unidades hacia adelante, color `boot`), **cuello** (`neck` o piel) y **pierna trasera más oscura** (`pantsD`) para leer la profundidad.
- El contorno y el borde de luz salen solos: la misma geometría se dibuja con los anchos agrandados (`+o`).
- **Cadenas que arrancan colgando:** si una cadena aparece estirada en horizontal tarda en caer y parece un brazo o un arma. Ahora se inicializa casi vertical.
- **Personaje sin cara:** con capucha, máscara oscura y dos ojos de color, el misterio se sostiene y no hace falta dibujar rasgos.
- **Ep. 4 en sí:** cae desde la antena con speed lines verticales, aterriza con una onda elíptica, grietas y un congelado, frena dos golpes a la vez con una cúpula, y la onda despide a ambos con chispas de derrape. Cierra con los diálogos "¿Juntos?" / "…Por esta vez.", que anuncian una alianza para el próximo episodio.

---

## 11. Ep. 5 — pies clavados, marcha procedural y sombras

- **IK de dos huesos** (`ikLeg`): con el largo de muslo y canilla de la pose, la rodilla se resuelve hacia adelante y el pie llega al objetivo. Si el objetivo queda fuera de alcance, la pierna se estira al máximo.
- **`ch.plant = {lF:[x,y], rF:[x,y]}`** en coordenadas de mundo. El motor convierte a coordenadas locales (`localPt`) y aplica la IK antes de dibujar. Los pies no patinan aunque el cuerpo suba, baje o avance.
- **`gait(d, {x0, dir, stride, lift, lead, bob})`** es la marcha procedural:
  - Cada pie pasa el 60 % del ciclo clavado en un punto fijo del piso y el 40 % volando en arco hasta el siguiente.
  - Devuelve la posición del cuerpo, los dos pies, `swing` (para balancear los brazos entre `walkA` y `walkB`, o entre `runA` y `runB`) y el `bob` de la cadera.
  - Para caminar: zancada de 24 y elevación de 5. Para correr: zancada de 40, elevación de 11 y torso inclinado.
- **Sombras de contacto** (`shadow(ch)`): elipse con dither bajo la cadera que se achica y aclara con la altura, más un punto oscuro bajo cada pie apoyado. Los personajes dejan de flotar.
- **Ojo:** con pies clavados, los smears de pies se comparan contra la pose ya con IK, para no disparar estelas falsas.
- **Loop con el plano de los pies:** abrir y cerrar con los pies quietos en un charco. La pose final se calcula con la misma función (`finalGreen()`) en el primer y el último segmento, así el cuadro es idéntico. Las ondas de los charcos tienen un período de LOOP/12, así que también cierran.
- **Truco de giro:** espejar al personaje (`dir`) cada 2 cuadros con la pose de patada se lee como un giro completo, como en el anime.

### Corrección después del Ep. 5 (feedback: "la caminata no es natural, los pies se ven encorvados")
- **Rodillas rotas:** muchas poses dejaban la rodilla de la pierna de atrás doblada *hacia atrás* respecto de la línea cadera→pie. Con anatomía eso se lee como pies o piernas encorvadas. El motor ahora refleja cualquier rodilla hacia adelante sobre esa línea (`kneesForward`), sin cambiar el largo de los huesos. Corre en todas las poses.
- **Error en la marcha:** el pie apoyado tiene que pasar de adelante del cuerpo (+lead) a atrás (−lead). Antes quedaba siempre adelante y caminaban tirados para atrás.
- **Escala humana:** el ciclo de un pie mide unas 0,7 alturas (zancada de 64 unidades para 95 de alto); correr, cerca de 1 altura (92). Con zancadas cortas arrastran los pies.
- **Cadera alta al caminar:** casi el largo de la pierna (47,5 de 50), con las piernas casi estiradas en el apoyo. Con la cadera baja parecen agazapados.
- **Vuelo del pie:** despega por detrás y sube rápido, con el pico en el primer tercio del vuelo (`sin(π·q^0,7)`).
- **Faldones y capas:** se dibujan con el trazo afinado de los miembros (`limb`), no con pincel cuadrado. Tienen que abrirse hacia abajo (`w:[9,14]`) y usar el color de sombra, si no se leen como una tercera pierna o una caja.
- **Laboratorio:** `escenas/lab/` muestra un personaje solo y grande caminando, corriendo y parado. Se revisa cuadro por cuadro con `tools/grid.py` antes de usar un movimiento en un episodio.

### Corrección: pies y manos (feedback: "la junta de los pies se ve mal")
- La canilla no puede terminar en punta en el piso con un "tubo" de pie pegado: la forma se lee mal. Ahora la canilla termina ancha (7,5) en el tobillo, entra en una **bota poligonal** (talón, suela plana, punta redondeada, empeine) y un **ruedo** del pantalón tapa la unión.
- Las manos eran discos grandes (radio 5) que en reposo quedaban a la altura de la entrepierna. Ahora son **puños chicos y alargados** en la dirección del antebrazo (radio ~3,3).
- Para juzgar siluetas, el laboratorio usa un **fondo claro**: sobre el fondo oscuro de la escena, los errores de forma se esconden.

---

## 12. Ep. 6 — piso mojado y luz de la energía

- **`wetFloor(gy, {strength, amp, extra, extraLevel})`:** copia todo lo que está sobre el horizonte, lo espeja hacia abajo con dither Bayer, lo oscurece y lo ondula a 12 fps. Refleja figuras, rayos, ciudad y lluvia con una sola llamada al final del render.
- **Truco de historia, `extra`:** dibuja algo que existe *solo* en el reflejo. Tiene que tener un borde claro: una silueta negra sobre un piso oscuro, y encima reflejada, desaparece.
- **`litCast(lista, luces)`:** dibuja los personajes en una capa y tiñe cada píxel según la luz más cercana, con dither. Las luces tienen que ser chicas (radio de 20 a 50): con radios grandes tiñen todo de un color y se pierde la lectura de quién está iluminado.
- **`beam(a, b, w, color, claro)`:** tres capas (color, claro y núcleo blanco) que ondulan a 24 fps.
- **Gancho de re-visualización:** "MIRÁ EL CHARCO" más una figura que aparece medio segundo en el reflejo al principio y que se ve clara al final. Invita a mirar el loop otra vez.
- **El plano del charco necesita contenido propio:** una luna roja reflejada que ondula y ondas de lluvia con período LOOP/12. Si no, el cuadro del inicio y del final queda negro.

---

## 13. Dónde está el techo (evaluación después del Ep. 6)

| Aspecto | Antes (Kessen) | Ahora (Ep. 6) | Techo de este enfoque |
|---|---|---|---|
| Ritmo y dirección (timing, hit-stop, impact frames, cortes) | alto | alto | **ya está cerca del techo** |
| Efectos (energía, chispas, lluvia, reflejos, luz) | medio | alto | cerca del techo |
| Movimiento del cuerpo (arcos, smears, IK, marcha, física de tela) | bajo | medio-alto | rindiendo cada vez menos |
| Anatomía y silueta | bajo | medio | limitado por la resolución |
| Caras y expresión | nulo | nulo (capuchas, ojos en primer plano) | **techo duro** a ~150 px de ancho |
| Perspectiva y volumen | nulo | nulo: **todo es de perfil** | **techo duro del rig 2D** |

**Conclusión:** las mejoras incrementales sobre el rig 2D de perfil ya rinden poco. Cada vuelta suma menos que la anterior y los errores (rodillas, pies, manos) aparecen al acercarse a la "anatomía real". Para romper el techo hay que **cambiar de paradigma**, no seguir puliendo:
1. **Esqueleto 3D proyectado y pixelado:** el mismo rig con profundidad, rotación y cámara que orbita. Habilita giros reales, escorzo (un puño hacia la cámara), vistas 3/4 y planos con perspectiva. Es el salto más grande disponible.
2. **Herramienta de coreografía:** un editor visual de poses y timeline. Hoy cada pose es un número escrito a mano, y ese es el cuello de botella creativo.
3. **Rostros en primeros planos:** retratos pixelados a más resolución para los cortes de cara, sin tocar el plano general.

### Corrección: un rayo no puede atravesar a un aliado (feedback del Ep. 6)
- Si dos aliados disparan desde el mismo lado, alinearlos en la misma línea hace que el rayo de atrás le cruce el cuerpo al de adelante, y se lee como que lo ataca.
- Composición de combo: **el de adelante, agachado** (`lowcharge` / `lowfire`), y **el de atrás, de pie**, disparando por encima de su cabeza. Los rayos convergen en el blanco desde dos alturas.
- Regla general: antes de dibujar un proyectil, revisar que su trayectoria no pase por la silueta de un personaje que no es el objetivo.

---

## 14. Ep. 7 — esqueleto 3D proyectado (`engine/sakuga3d.js`)

El salto de paradigma recomendado en la sección 13. El mismo pixel art, pero ahora con profundidad.

- **Convención:** x es adelante del personaje (`yaw` 0 mira a +x), y apunta hacia abajo (el piso está en y=0) y z va hacia la cámara. `yaw = π/2` es mirar de frente a cámara.
- **Las poses 2D sirven tal cual:** `to3` les agrega profundidad (lado izquierdo z−, derecho z+). Toda la biblioteca de poses se reutiliza.
- **Cámara orbital** (`setCam3({yaw, pitch, D, tx, ty, tz, zoom})`) con perspectiva: los objetos a distancia `D` del objetivo quedan en escala 1 y los más cercanos crecen.
- **Dibujo por grupos ordenados por profundidad:** cada pierna, cada brazo, el cuerpo y cada cadena es un grupo con su propio contorno. Un brazo delante del torso se separa con línea, pero las articulaciones de un mismo miembro no se cortan.
- **Torso = envolvente convexa** de 13 puntos (hombros, pecho, cintura, cadera). Funciona desde cualquier ángulo.
- **Cara según orientación** (`facing3`): dos ojos de frente, uno de perfil, ninguno de espaldas. La capucha muestra la cara solo si mira hacia cámara.
- **Física 3D** (`simulate3`): las mismas cadenas Verlet, con profundidad y viento en z.
- **Mundo:**
  - `floor3` dibuja la grilla en perspectiva, que es lo que más vende la profundidad cuando la cámara gira.
  - `skyline3` y `moon3` ubican la ciudad y la luna por acimut, así rotan con la cámara.
  - `shadow3` proyecta la sombra en el piso.
  - `reflect3` refleja a cada personaje sobre su propio pie (correcto para un piso plano, a diferencia del espejo de horizonte 2D).
- **Recursos nuevos:**
  - *Puño contra la cámara:* el personaje mira a cámara (`yaw ≈ π/2`), la cámara se pone a un brazo y medio (`D ≈ 118`) con zoom alto. El puño crece por perspectiva. Usar un guante claro: un puño negro sobre un cuerpo negro no se lee.
  - *Vidrio roto* (`glassCrack`): grietas radiales y arcos desde el punto de impacto, como si el golpe rompiera la pantalla.
  - *Tiempo congelado con cámara orbitando:* `freeze` en el state congela el mundo (también la lluvia, si se dibuja dentro de `render`) mientras la cámara, que sale del tiempo real, da la vuelta.
  - *Salir o hundirse en el charco:* recortar el dibujo en la línea del piso (`clip`) y agregar ondas en la base.
- **Lección de cámara:** con `pitch` 0 y los personajes casi en fila, la profundidad no se nota. Un `pitch` de 0,15 a 0,25 (mirar un poco hacia abajo) muestra el piso y las distancias.
- **Laboratorio 3D:** `escenas/lab3d/` muestra un giro de 360°, una órbita alrededor de un golpe y un puño a cámara, sobre fondo claro.

---

## 15. Ep. 8 — juntas, técnicas estilo FighterZ y composición en profundidad

### Juntas (feedback: "las juntas se ven raras")
- **Caderas:** el muslo no puede empezar como una bola que asome por debajo del torso. Ahora nace adentro de una **pelvis ancha** (puntos extra en la envolvente) y las piernas se dibujan **detrás del torso**, salvo que la rodilla venga claramente hacia la cámara (una patada al frente).
- **Cuello:** corto y ancho, con un **cuello de abrigo** (disco del color del torso) que tapa la unión. Se aplica en 2D y en 3D.
- **Faldón:** en 3D las solapas sueltas se leen como piernas extra. El abrigo largo pasa a ser parte del torso (puntos de faldón en la envolvente, más largo atrás) y tapa la unión con las piernas.

### Lo que tomamos de Dragon Ball FighterZ (modelos 3D que se ven 2D)
- **Sombreado cel de dos tonos** (`celShade`): una luz principal en el mundo (`E.keyLight`) se proyecta a pantalla según el giro de la cámara.
  - *Miembros:* banda oscura del lado opuesto a la luz.
  - *Cabeza y puños:* medialuna de sombra.
  - *Torso:* franja vertical de sombra.
  - El color de sombra se deriva solo (`darker`).
- **Contorno de grosor variable:** primero la silueta exterior de todo el personaje (gruesa, en el color del aura) y después, por grupo, una línea interior fina oscura. Separa las partes sin ensuciarlas.
- **Poses clave sostenidas** (`keyPose(t, [[t0,pose],[t1,pose],…])`): sin interpolación, la pose queda quieta hasta la siguiente clave, con **un solo cuadro intermedio** al 60 % al cambiar. Es lo que le da el golpe "a mano" a FighterZ.
- **Cambio de orientación en seco:** el personaje gira hacia su blanco en el cuadro de anticipación, sin rotación animada.

### 3D: luz, pies y composición
- `lightPass(luces)` tiñe con dither todo el buffer cerca de cada fuente (personajes, piso, sombras), con radio en unidades de mundo y perspectiva.
- `gait3` y `pose3`: la marcha procedural en cualquier dirección del piso, con pies clavados por IK (`ch.plant3`).
- **Reflejos antes que los personajes:** si se dibujan después, el reflejo de uno más lejano tapa los pies de uno más cercano.
- **Composición con muchos personajes:** con la cámara a la altura de los ojos, un anillo de 9 figuras se amontona en una franja. Con un **plano casi cenital** (`pitch` ≈ 0,9) el anillo se lee como anillo, y para el remate se baja la cámara (`pitch` 0,25) y se acerca.
- **Loop con cámara orbitando:** si la cámara da exactamente una vuelta por loop (`yaw = yaw0 + 2π·t/LOOP`) y el primer y el último segmento tienen el mismo contenido, la órbita también cierra.

### Corrección: el Ep. 7 no pasaba del título
- Al sacar los faldones con reemplazos de texto quedó un hueco en una lista de cadenas (`chains:[ , {…}]`). El motor leía `undefined.off`, tiraba error en cada cuadro y la escena se quedaba congelada en el primero.
- Ahora el motor ignora huecos en las listas, y `tools/check.py` recorre todas las escenas buscando errores de JavaScript. **Correrlo siempre antes de publicar:** cambiar el motor puede romper episodios viejos que no se volvieron a mirar.

---

## 16. Ep. 9 — montaje por planos, cut-ins y escala

- **Montaje: un plano por golpe.** Respuesta al amontonamiento del Ep. 8. Cada ataque tiene su propia cámara (`cam3` distinta por fase) y un corte seco entre planos. El espectador siempre sabe quién pega y dónde, porque en cuadro hay solo dos: el que ataca y el blanco.
- **Cut-in** (`cutIn({k, y, h, slope, look, name, sub, col, dir})`): franja diagonal que entra deslizando, con un primer plano de ojos (`closeup` en una capa, copiado solo dentro de la franja), bordes del color del personaje, nombre abajo y técnica arriba, sin tapar los ojos. Va antes de cada ataque especial, como en los juegos de pelea y los remates de anime. Con tres franjas cruzadas se arma un "cut-in triple" antes del remate en equipo.
- **Escala por personaje** (`ch.scale`): afecta posiciones, anchos y sombra. Un gigante de escala 3,3 frente a la luna enorme vende el tamaño. Si el atacante le pega en la rodilla, el plano cuenta la escala solo.
- **Plano contrapicado** (`pitch` negativo, mirando hacia arriba) para lo grande, y **plano picado** (`pitch` positivo) para la caída en picada sobre la cabeza.
- **Nombres originales** de los personajes: 紅 Kurenai (roja), 蒼 Aoi (azul), 翠 Midori (verde).
- Antes de publicar se corrió `tools/check.py` sobre todas las escenas.

---

## 17. Ep. 10 (episodio completo) — herramientas de producción (`engine/produccion.js`)

- **Secuenciador** (`sequence(shots, {bpm})`): cada plano es un dato `{id, beats, phase, state(lt, k, t)}`, donde `lt` es el tiempo local del plano y `k` va de 0 a 1. Los planos se miden **en beats**, así los cortes caen siempre en el ritmo de la música. `SEQ.start(id)` y `SEQ.end(id)` sirven para sincronizar efectos y sonidos sin escribir tiempos a mano. Reordenar o alargar un plano mueve todo lo demás solo.
- **Música procedural** (`musicTick(prev, cur, bpm, section)`): un secuenciador de semicorcheas (bombo, redoblante, hi-hat, bajo, pad, arpegio y platillo) que lee una **sección por plano**. Por ejemplo: calma = solo pad, pelea = batería completa, tiempo congelado = pad bajo, amanecer = cambio de La menor a Do mayor. Va atada al tiempo de la escena, así que respeta pausa, seek y loop.
- **Exportar video** (`exportVideo({duration})`):
  - Pasa a una resolución interna fija de 135×240 escalada ×8, o sea **1080×1920 pixel perfecto**.
  - Quema subtítulos y gancho en el canvas.
  - Graba el canvas más el audio de la escena con MediaRecorder y descarga el archivo. Probado headless: VP9 + Opus, 1080×1920.
  - Dentro de un artifact de claude.ai el navegador bloquea la descarga, así que hay que exportar desde el archivo local o desde GitHub Pages.
- **Animatic primero:** el episodio largo se arma primero como animatic (los 21 planos con cámara y poses básicas, la música completa y una etiqueta por plano). Así se aprueban historia y ritmo antes de invertir en pulir cada plano.
- `tools/check.py` ahora también recorre escenas largas (hasta 60 s).
