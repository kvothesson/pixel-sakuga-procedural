/* Producción — herramientas para episodios largos: secuenciador de planos medidos en beats,
 * música procedural sincronizada con el tiempo de la escena y exportación de video con audio.
 * Requiere engine/sakuga.js (y sakuga3d.js si los planos son 3D).
 */
(function(){
'use strict';
const E=window.Sakuga;

// ---------- secuenciador ----------
// shots: [{id, beats, phase?, state(lt, k, t) → {cam3, chars, ...}}]. Los cortes caen siempre en un beat.
E.sequence=function(shots,{bpm=120}={}){
  const beat=60/bpm;let t=0;for(const sh of shots){sh.t0=t;sh.dur=sh.beats*beat;t+=sh.dur;sh.t1=t}
  const at=tt=>{for(const sh of shots)if(tt<sh.t1)return sh;return shots[shots.length-1]};
  return{shots,total:t,beat,bpm,at,start:id=>shots.find(x=>x.id===id).t0,end:id=>shots.find(x=>x.id===id).t1,
    state(tt){const sh=at(tt),lt=tt-sh.t0,k=Math.min(1,lt/sh.dur),st=sh.state?sh.state(lt,k,tt):{};
      return Object.assign({phase:sh.phase||sh.id,shot:sh,lt,k,cam:{},cam3:{},chars:[]},st)}};
};

// ---------- música procedural ----------
// section(t) → {kick, snare, hat, bass:[notas], pad:[frecuencias], crash, level}; se dispara cada semicorchea que cruza el tiempo.
const N=n=>440*Math.pow(2,(n-69)/12); // MIDI → Hz
E.note=N;
E.musicTick=function(prev,cur,bpm,section){
  const st=60/bpm/4,a=Math.floor(prev/st),b=Math.floor(cur/st);if(b===a||cur<prev&&b>a)return;
  const steps=cur<prev?[b]:Array.from({length:Math.min(4,b-a)},(_,i)=>a+1+i);
  for(const step of steps){const t=step*st,sec=section(t);if(!sec)continue;const pos=step%16,lv=sec.level??1;
    if(sec.kick&&(pos===0||pos===8||(sec.kick>1&&(pos===10))))E.tone(.28,'sine',150,38,.9*lv);
    if(sec.snare&&(pos===4||pos===12)){E.noise(.14,'bandpass',2200,1200,.45*lv,.8);E.tone(.1,'triangle',220,160,.2*lv)}
    if(sec.hat&&pos%2===0)E.noise(.03,'highpass',8000,9000,(pos%4?.1:.16)*lv);
    if(sec.bass&&pos%4===0){const n=sec.bass[Math.floor(step/16)%sec.bass.length];if(n)E.tone(st*3.6,'sawtooth',N(n),N(n)*.995,.2*lv)}
    if(sec.pad&&pos===0&&Math.floor(step/16)%2===0)for(const n of sec.pad)E.tone(st*30,'triangle',N(n),N(n)*1.002,.05*lv);
    if(sec.crash&&pos===0&&(sec.crashOnce?Math.floor(step/16)===sec.crashOnce:true))E.noise(1.4,'highpass',5000,3000,.3*lv);
    if(sec.arp&&pos%2===0){const n=sec.arp[(step/2|0)%sec.arp.length];E.tone(st*1.8,'square',N(n),N(n),.035*lv)}
  }
};

// ---------- exportar video ----------
// Graba el canvas a 1080×1920 (resolución interna 135×240 ×8, pixel perfecto) con el audio de la escena y los textos quemados.
// Nota: dentro de un artifact de claude.ai el navegador bloquea la descarga; funciona abriendo el archivo local o desde GitHub Pages.
E.exportVideo=async function({duration,fps=30,filename='otra-vez',onStatus=()=>{}}){
  const A=E.audio;
  if(!A.ctx){onStatus('Activá el sonido primero (botón ♪)');return}
  const mimes=['video/mp4;codecs=avc1.42E01E,mp4a.40.2','video/mp4','video/webm;codecs=vp9,opus','video/webm'];
  const mime=mimes.find(m=>window.MediaRecorder&&MediaRecorder.isTypeSupported(m));if(!mime){onStatus('Este navegador no puede grabar video');return}
  E.setExport(true);E.t=0;E.running=true;
  const dest=A.ctx.createMediaStreamDestination();A.master.connect(dest);
  const stream=E.canvas().captureStream(fps);for(const tr of dest.stream.getAudioTracks())stream.addTrack(tr);
  const rec=new MediaRecorder(stream,{mimeType:mime,videoBitsPerSecond:9e6}),chunks=[];rec.ondataavailable=e=>e.data.size&&chunks.push(e.data);
  const done=new Promise(r=>rec.onstop=r);rec.start(250);
  const t0=performance.now();
  await new Promise(r=>{const tick=()=>{const el=(performance.now()-t0)/1000;onStatus(`Grabando… ${Math.min(100,Math.round(el/duration*100))} %`);if(el>=duration)r();else setTimeout(tick,200)};tick()});
  rec.stop();await done;A.master.disconnect(dest);E.setExport(false);
  const blob=new Blob(chunks,{type:mime.split(';')[0]}),ext=mime.includes('mp4')?'mp4':'webm',name=`${filename}.${ext}`,mb=(blob.size/1e6).toFixed(1);
  // dentro de claude.ai: la capacidad `downloads` (el visor pide confirmación); afuera: descarga directa
  const dl=await downloadsNS;
  if(dl){try{await dl.save({filename:name,data:blob});onStatus(`Listo: ${name} (${mb} MB)`)}
    catch(e){onStatus(e&&e.code==='declined'?'Descarga cancelada.':`No se pudo guardar el video (${e&&e.code||'error'}).`)}return}
  const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();
  onStatus(`Listo: ${name} (${mb} MB)`);
};
// se pide al cargar: fuera de un visor de claude.ai resuelve null (hasta 10 s), así no demora la exportación
const downloadsNS=(window.claude&&window.claude.use?window.claude.use('downloads').catch(()=>null):Promise.resolve(null));
})();
