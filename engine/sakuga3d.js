/* Sakuga 3D — extensión del motor: esqueleto con profundidad, giro y cámara orbital con perspectiva,
 * siempre pixelado sobre el mismo buffer. Requiere engine/sakuga.js.
 * Convención: x adelante del personaje (yaw 0 = mira a +x), y hacia abajo (piso en y=0), z hacia la cámara.
 */
(function(){
'use strict';
const E=window.Sakuga,{lerp,ease,clamp,hash,BAYER}=E;
const C3={yaw:0,pitch:0,D:420,tx:0,ty:-55,tz:0,K:1,cx:0,cy:0};E.cam3=C3;

// ---------- cámara orbital ----------
E.setCam3=function(c){
  const sh=c.shake||0,sx=Math.round((hash(Math.floor(E.t*24))-.5)*sh),sy=Math.round((hash(Math.floor(E.t*24)+99)-.5)*sh);
  Object.assign(C3,{yaw:c.yaw||0,pitch:c.pitch||0,D:c.D||420,tx:c.tx||0,ty:c.ty??-55,tz:c.tz||0,K:(c.zoom||1)*E.u,cx:E.PW/2+sx,cy:E.PH*(c.cy??.5)+sy});
  E.cam.k=C3.K;E.cam.rot=c.rot||0;
};
// proyección: devuelve [x, y, escala, profundidad]
E.proj=function(x,y,z){
  const dx=x-C3.tx,dy=y-C3.ty,dz=z-C3.tz,cs=Math.cos(C3.yaw),sn=Math.sin(C3.yaw);
  const xr=dx*cs-dz*sn,zr=dx*sn+dz*cs,cp=Math.cos(C3.pitch),sp=Math.sin(C3.pitch),yr=dy*cp-zr*sp,zz=dy*sp+zr*cp;
  const depth=C3.D-zz,s=C3.D/Math.max(25,depth);return[C3.cx+xr*s*C3.K,C3.cy+yr*s*C3.K,s,depth];
};
E.horizon=()=>C3.cy-Math.tan(C3.pitch)*C3.D*C3.K;

// ---------- esqueleto 3D ----------
// las poses 2D de perfil se convierten solas: lado izquierdo hacia el fondo (z−), derecho hacia la cámara (z+)
const ZD={hip:0,chest:0,head:0,lE:-8,lH:-7,rE:8,rH:7,lK:-5,lF:-5,rK:5,rF:5};
E.to3=pose=>{const o={};for(const j in pose){const p=pose[j];o[j]=p.length===3?p.slice():[p[0],p[1],ZD[j]||0]}return o};
E.w3=(ch,[lx,ly,lz])=>{const sc=ch.scale||1,cs=Math.cos(ch.yaw||0),sn=Math.sin(ch.yaw||0);lx*=sc;ly*=sc;lz*=sc;return[ch.x+lx*cs-lz*sn,(ch.y||0)+ly,(ch.z||0)+lx*sn+lz*cs]};
// cuánto mira el personaje hacia la cámara (1 de frente, 0 de perfil, −1 de espaldas)
// pies clavados en 3D: ch.plant3 = {lF:[x,y,z], rF:[x,y,z]} en mundo; la IK se resuelve en el plano del personaje
E.pose3=ch=>{const p2=E.plantPose({pose:ch.pose});
  if(ch.plant3)for(const[K2,F]of[['lK','lF'],['rK','rF']]){const w=ch.plant3[F];if(!w)continue;const dx=w[0]-ch.x,dz=w[2]-(ch.z||0),yw=ch.yaw||0;
    E.ikLeg(p2,K2,F,[dx*Math.cos(yw)+dz*Math.sin(yw),w[1]-(ch.y||0)])}
  return E.to3(p2)};
// marcha en cualquier dirección del piso: usa la marcha 2D sobre el eje (cos yaw, sin yaw) y separa los pies a los costados
E.gait3=function(d,{x0,z0,yaw=0,...o}){const g=E.gait(d,{x0:0,dir:1,...o}),c=Math.cos(yaw),sn=Math.sin(yaw),side=(v,s2)=>[x0+c*v[0]-sn*s2*4,v[1],z0+sn*v[0]+c*s2*4];
  return{x:x0+c*g.x,z:z0+sn*g.x,y:g.y,swing:g.swing,plant3:{lF:side(g.l,-1),rF:side(g.r,1)}}};
// poses clave SOSTENIDAS (estilo FighterZ / animación limitada): sin interpolar; un solo cuadro intermedio al cambiar
E.keyPose=function(t,keys,breakdown=true){let i=0;while(i+1<keys.length&&keys[i+1][0]<=t)i++;
  if(breakdown&&i>0&&t-keys[i][0]<1/24*1.5)return E.lerpPose(keys[i-1][1],keys[i][1],.6);return keys[i][1]};
E.facing3=ch=>{const fx=Math.cos(ch.yaw||0),fz=Math.sin(ch.yaw||0);return fx*Math.sin(C3.yaw)+fz*Math.cos(C3.yaw)};
const hull=pts=>{const P=pts.slice().sort((a,b)=>a[0]-b[0]||a[1]-b[1]),cr=(o,a,b)=>(a[0]-o[0])*(b[1]-o[1])-(a[1]-o[1])*(b[0]-o[0]),lo=[],up=[];
  for(const p of P){while(lo.length>=2&&cr(lo[lo.length-2],lo[lo.length-1],p)<=0)lo.pop();lo.push(p)}
  for(let i=P.length-1;i>=0;i--){const p=P[i];while(up.length>=2&&cr(up[up.length-2],up[up.length-1],p)<=0)up.pop();up.push(p)}
  return lo.slice(0,-1).concat(up.slice(0,-1))};

// dibujo por GRUPOS ordenados por profundidad: cada grupo (pierna, brazo, cuerpo, cadena) lleva su contorno,
// así un brazo delante del torso se separa con línea, pero las articulaciones de un mismo miembro no se cortan.
E.figure3=function(ch,mode='glow',inkCol,{mirror=false}={}){
  const def=E.scene.chars[ch.id],pal=def.pal,K=C3.K*(ch.scale||1);
  const p=E.pose3(ch);
  const W=q=>{const w=E.w3(ch,q);if(mirror)w[1]=-w[1];return w},Pj=q=>E.proj(...W(q));
  const dh=ch.headYaw!=null?ch.headYaw-(ch.yaw||0):0;
  const HR=q=>{if(!dh)return q;const h=p.head,dx=q[0]-h[0],dz=q[2]-h[2],c=Math.cos(dh),sn2=Math.sin(dh);return[h[0]+dx*c-dz*sn2,q[1],h[2]+dx*sn2+dz*c]};
  const add=(a,b2)=>[a[0]+b2[0],a[1]+b2[1],a[2]+b2[2]];
  const groups=[];
  const limbG=(pts,ws,col)=>{const pr=pts.map(Pj);groups.push({d:pr.reduce((s,q)=>s+q[3],0)/pr.length,parts:pr.slice(0,-1).map((a,i)=>({t:'limb',a,b:pr[i+1],wa:ws[i]*a[2]*K,wb:ws[i+1]*pr[i+1][2]*K,col}))})};
  // piernas: cadera lateral → rodilla → tobillo → bota
  for(const[s,K2,F,c]of[[-1,'lK','lF',pal.pantsD||pal.pants],[1,'rK','rF',pal.pants]]){
    const hipS=add(p.hip,[0,-4,s*4.5]),ank=add(p[F],[0,-8,0]),heel=add(p[F],[-3.5,-2.5,0]),toe=add(p[F],[9,-1.5,0]);
    limbG([hipS,p[K2],ank],[12,9.5,7.5],c);groups[groups.length-1].leg=1;groups[groups.length-1].knee=Pj(p[K2])[3];
    const pr=[heel,toe].map(Pj);groups[groups.length-1].parts.push({t:'limb',a:pr[0],b:pr[1],wa:6*pr[0][2]*K,wb:4.5*pr[1][2]*K,col:pal.boot||c});
  }
  // brazos: hombro → codo → puño
  for(const[s,E2,H,c]of[[-1,'lE','lH',pal.coatD],[1,'rE','rH',pal.coat]]){
    const sh=add(p.chest,[0,3,s*8]);limbG([sh,p[E2],p[H]],[8,6.5,5],c);
    const fh=Pj(p[H]);groups[groups.length-1].parts.push({t:'disc',a:fh,r:3.6*fh[2]*K,col:pal.glove});
  }
  // cuerpo: torso como envolvente convexa de hombros, pecho, cintura y cadera
  {const c0=p.chest,h0=p.hip,m=[(c0[0]+h0[0])/2,(c0[1]+h0[1])/2,0];
    const tp=[add(c0,[0,1,10.5]),add(c0,[0,1,-10.5]),add(c0,[6.5,3,0]),add(c0,[-6,3,0]),add(c0,[0,-3,0]),
      add(m,[0,0,7.5]),add(m,[0,0,-7.5]),add(m,[5.5,0,0]),add(m,[-5.5,0,0]),add(h0,[0,0,8.5]),add(h0,[0,0,-8.5]),add(h0,[6,0,0]),add(h0,[-6,0,0]),add(h0,[0,5,9]),add(h0,[0,5,-9]),add(h0,[5.5,5,0]),add(h0,[-5.5,5,0]),
      // faldón del abrigo: alarga el torso hasta medio muslo (más largo atrás); tapa la unión con las piernas
      ...(def.skirt===false?[]:[add(h0,[-8,15,0]),add(h0,[4,11,0]),add(h0,[-2,13,9]),add(h0,[-2,13,-9])])].map(Pj);
    const hd=Pj(p.head),nk=Pj(add(c0,[1,-5,0])),cl=Pj(add(c0,[0,-3,0])),rH=8.5*hd[2]*K,parts=[{t:'poly',pts:hull(tp.map(q=>[q[0],q[1]])),col:pal.coat},
      {t:'limb',a:nk,b:hd,wa:7*nk[2]*K,wb:6.5*hd[2]*K,col:pal.neck||pal.skin},{t:'disc',a:cl,r:6.5*cl[2]*K,col:pal.coat}];
    const face=E.facing3({...ch,yaw:(ch.yaw||0)+dh});
    if(def.head==='hood'&&!ch.hoodDown){const bk=Pj(HR(add(p.head,[-15,-4,0])));parts.push({t:'limb',a:hd,b:bk,wa:9*hd[2]*K,wb:3*bk[2]*K,col:pal.hood},{t:'disc',a:hd,r:rH*1.22,col:pal.hood});
      if(face>-.35){const fc=Pj(HR(add(p.head,[4,1.5,0])));parts.push({t:'disc',a:fc,r:5.2*fc[2]*K,col:pal.skin,face:1})}}
    else{parts.push({t:'disc',a:hd,r:rH,col:pal.skin});const tp2=Pj(HR(add(p.head,[-2.5,-4,0])));parts.push({t:'disc',a:tp2,r:7.2*tp2[2]*K,col:pal.hair,hair:1})}
    // ojos: dos de frente, uno de perfil, ninguno de espaldas
    const eyes=[];if(face>-.2){for(const ez of(Math.abs(face)>.55?[-3,3]:[3])){const e=Pj(HR(add(p.head,[5.5,-1,ez*(Math.abs(face)>.55?1:Math.sign(Math.sin((ch.yaw||0)+dh+C3.yaw))||1)])));eyes.push(e)}}
    groups.push({d:tp.reduce((s,q)=>s+q[3],0)/tp.length,parts,eyes});}
  // cadenas físicas (faldón, capa, pelo, bufanda)
  const cache=E.chainCache&&E.chainCache[ch.id];
  if(cache)for(const sp of(def.chains||[]).filter(Boolean)){if(mirror&&!sp.cloth)continue;if(sp.when&&!sp.when(ch))continue;const nodes=cache.chains[sp.key];if(!nodes)continue;
    const dx=ch.x-cache.x,dy=(ch.y||0)-cache.y,dz=(ch.z||0)-cache.z,pr=nodes.map(n=>E.proj(n.p[0]+dx,n.p[1]+dy,n.p[2]+dz)),n=pr.length-1;
    const dBack=pr.reduce((s,q)=>s+q[3],0)/pr.length+(sp.key.startsWith('coat')||sp.cloth?6:0);
    if(sp.cloth){const L=[],R=[];for(let i=0;i<=n;i++){const a=pr[Math.max(0,i-1)],b2=pr[Math.min(n,i+1)],dx=b2[0]-a[0],dy=b2[1]-a[1],d=Math.hypot(dx,dy)||1,
        w=lerp(sp.w[0],sp.w[1],i/n)*pr[i][2]*K*.5;L.push([pr[i][0]-dy/d*w,pr[i][1]+dx/d*w]);R.push([pr[i][0]+dy/d*w,pr[i][1]-dx/d*w])}
      const hem=[],l=L[n],r=R[n],teeth=3;for(let j=1;j<teeth*2;j++){const q=j/(teeth*2),up=j%2?-4*pr[n][2]*K:0;hem.push([lerp(l[0],r[0],q),lerp(l[1],r[1],q)+up])}
      groups.push({d:dBack,parts:[{t:'poly',pts:L.concat(hem,R.reverse()),col:pal[sp.col]}]});continue}
    groups.push({d:dBack,parts:pr.slice(0,-1).map((a,i)=>({t:'limb',a,b:pr[i+1],
      wa:lerp(sp.w[0],sp.w[1],i/n)*a[2]*K,wb:lerp(sp.w[0],sp.w[1],(i+1)/n)*pr[i+1][2]*K,col:sp.tipFrom!=null&&i>=sp.tipFrom?pal[sp.tip]:pal[sp.col]}))})}
  const torso=groups.find(g=>g.eyes!==undefined);
  for(const g of groups)if(g.leg&&torso&&g.knee>torso.d-14)g.d=Math.max(g.d,torso.d+1);
  groups.sort((a,b2)=>b2.d-a.d);
  const out=mode==='ink'?inkCol:mode==='glow'?pal.aura:'#000',ink=mode==='ink';
  const drawPart=(pt,extra,col)=>{if(pt.t==='limb')E.limb(pt.a,pt.b,pt.wa+extra,pt.wb+extra,col);else if(pt.t==='disc')E.disc(pt.a[0],pt.a[1],pt.r+extra/2,col);else{E.poly(pt.pts,col);if(extra>0)for(let i=0;i<pt.pts.length;i++){const a=pt.pts[i],b2=pt.pts[(i+1)%pt.pts.length];E.line(a[0],a[1],b2[0],b2[1],extra,col)}}};
  const Ls=lightScreen();
  // 1) silueta exterior gruesa (todas las partes juntas) → 2) por grupo: línea interior fina + color + sombra cel
  if(!ink)for(const g of groups)for(const pt of g.parts)if(!pt.face)drawPart(pt,3,out);
  for(const g of groups){
    if(!ink)for(const pt of g.parts)if(!pt.face)drawPart(pt,1,'#0a0610');
    for(const pt of g.parts){drawPart(pt,0,ink?inkCol:pt.col);if(!ink&&!mirror)celShade(pt,Ls)}
    if(g.eyes&&mode!=='ink')for(const e of g.eyes)E.R(e[0]-Math.max(1,e[2]*K),e[1],Math.max(1,Math.round(e[2]*K*1.6)),Math.max(1,Math.round(e[2]*K*.8)),mode==='glow'?pal.aura:'#fff');
  }
};

// ---------- sombreado cel ----------
// luz principal en el mundo (arriba, a la derecha y hacia la cámara); se proyecta a pantalla según el giro de la cámara
E.keyLight=[.55,-.75,.4];
const shadeCache={};
function darker(hex,f=.62){if(shadeCache[hex+f])return shadeCache[hex+f];const n=parseInt(hex.slice(1).padEnd(6,'0').slice(0,6),16);
  const r=Math.round(((n>>16)&255)*f),g=Math.round(((n>>8)&255)*f),bl=Math.round((n&255)*f);return shadeCache[hex+f]='#'+((1<<24)|(r<<16)|(g<<8)|bl).toString(16).slice(1)}
E.darker=darker;
function lightScreen(){const[lx,ly,lz]=E.keyLight,cs=Math.cos(C3.yaw),sn=Math.sin(C3.yaw),x=lx*cs-lz*sn,d=Math.hypot(x,ly)||1;return[x/d,ly/d]}
function celShade(pt,[lx,ly]){
  if(pt.col===undefined||pt.face)return;const sh=darker(pt.col);
  if(pt.t==='limb'){const dx=pt.b[0]-pt.a[0],dy=pt.b[1]-pt.a[1],d=Math.hypot(dx,dy)||1;let nx=-dy/d,ny=dx/d;if(nx*lx+ny*ly>0){nx=-nx;ny=-ny}
    const oa=pt.wa*.22,ob=pt.wb*.22;E.limb([pt.a[0]+nx*oa,pt.a[1]+ny*oa],[pt.b[0]+nx*ob,pt.b[1]+ny*ob],pt.wa*.52,pt.wb*.52,sh)}
  else if(pt.t==='disc'){const r=Math.round(pt.r),cx=Math.round(pt.a[0]),cy=Math.round(pt.a[1]),ox=cx+lx*r*.55,oy=cy+ly*r*.55,b=E.ctx();b.fillStyle=sh;
    for(let y=-r;y<=r;y++)for(let x=-r;x<=r;x++){if(x*x+y*y>r*r+r*.8)continue;const qx=cx+x-ox,qy=cy+y-oy;if(qx*qx+qy*qy>r*r)b.fillRect(cx+x,cy+y,1,1)}}
  else if(pt.t==='poly'){let y0=Infinity,y1=-Infinity;for(const q of pt.pts){y0=Math.min(y0,q[1]);y1=Math.max(y1,q[1])}const b=E.ctx(),n=pt.pts.length;b.fillStyle=sh;
    for(let y=Math.floor(y0);y<=Math.ceil(y1);y++){const yc=y+.5,xs=[];for(let i=0;i<n;i++){const p=pt.pts[i],q=pt.pts[(i+1)%n];if((p[1]<=yc&&q[1]>yc)||(q[1]<=yc&&p[1]>yc))xs.push(p[0]+(yc-p[1])/(q[1]-p[1])*(q[0]-p[0]))}
      if(xs.length<2)continue;xs.sort((a,c)=>a-c);const xa=Math.round(xs[0]),xb=Math.round(xs[xs.length-1]),w=xb-xa,sw=Math.round(w*.36);
      if(sw>0)b.fillRect(lx>0?xa:xb-sw,y,sw,1)}}
}
// luz de la energía en 3D: tiñe con dither todo lo que está cerca de cada fuente (personajes, piso, sombras)
E.lightPass=function(lights){const b=E.ctx(),img=b.getImageData(0,0,E.PW,E.PH),d=img.data,W=E.PW;
  const Ls=lights.map(L=>{const pp=E.proj(L.x,L.y,L.z||0);return{px:pp[0],py:pp[1],r:L.r*pp[2]*C3.K,c:L.c,i:L.i}}).filter(L=>L.i>0&&L.r>1);if(!Ls.length)return;
  for(const L of Ls){const x0=Math.max(0,Math.floor(L.px-L.r)),x1=Math.min(W-1,Math.ceil(L.px+L.r)),y0=Math.max(0,Math.floor(L.py-L.r)),y1=Math.min(E.PH-1,Math.ceil(L.py+L.r));
    for(let y=y0;y<=y1;y++)for(let x=x0;x<=x1;x++){const f=(1-Math.hypot(x-L.px,y-L.py)/L.r)*L.i;if(f<=0||BAYER[y&3][x&3]/16>=f)continue;const o=(y*W+x)*4;
      d[o]=d[o]*.45+L.c[0]*.55;d[o+1]=d[o+1]*.45+L.c[1]*.55;d[o+2]=d[o+2]*.45+L.c[2]*.55}}
  b.putImageData(img,0,0)};
E.beam3=function(a,b2,w,col,lite){const pa=E.proj(...a),pb=E.proj(...b2);E.beam(pa,pb,w*(pa[2]+pb[2])/2*C3.K,col,lite)};

// ---------- cut-in (estilo juego de pelea / remate de anime) ----------
// {k: 0→1 progreso, y: centro vertical (fracción), h: alto (fracción), slope, look (para closeup), name, sub, col}
E.cutIn=function({k,y=.3,h=.2,slope=-.18,look,name,sub,col='#ffffff',dir=1}){
  if(k<=0)return;const PW=E.PW,PH=E.PH,yc=PH*y,hh=PH*h,slide=Math.round((1-E.easeOut(Math.min(1,k/.35)))*PW*1.2)*dir,out=k>.85?(k-.85)/.15:0;
  const lay=E.withLayer(()=>{E.R(0,yc-hh,PW,hh*2,'#05030a');E.speedLines(0,18,'#2a2440');E.closeup(1,0,look,{x:0,y:Math.round(yc-hh*.62),w:PW,h:Math.round(hh*1.1)})});
  const L=lay.getImageData(0,0,PW,PH).data,b=E.ctx(),M=b.getImageData(0,0,PW,PH),m=M.data;
  const inside=(x,y2)=>{const v=y2-yc-slope*(x-PW/2);return Math.abs(v)<=hh*.5*(1-out)};
  for(let y2=Math.max(0,Math.floor(yc-hh*2));y2<Math.min(PH,yc+hh*2);y2++)for(let x=0;x<PW;x++){if(!inside(x,y2))continue;const sx=x+slide;if(sx<0||sx>=PW)continue;
    const si=(y2*PW+sx)*4,o=(y2*PW+x)*4;m[o]=L[si];m[o+1]=L[si+1];m[o+2]=L[si+2];m[o+3]=255}
  b.putImageData(M,0,0);
  const edge=s2=>{for(let x=0;x<PW;x++){const y2=Math.round(yc+slope*(x-PW/2)+s2*hh*.5*(1-out));if(x-slide>=0&&x-slide<PW)E.R(x-slide,y2,1,2,col)}};edge(-1);edge(1);
  // ojos en el centro de la franja; nombre abajo y técnica arriba, sin taparlos
  if(name&&k<.9){const fs=Math.max(9,Math.round(hh*.22)),x0=PW*.5-slide*.6,nx=x0+PW*.16,sx=x0-PW*.16;
    E.pixText(name,nx,yc+hh*.36+slope*(nx-PW/2),fs,'#ffffff');if(sub)E.pixText(sub,sx,yc-hh*.36+slope*(sx-PW/2),Math.max(8,Math.round(fs*.7)),col)}
};

// ---------- física 3D: mismas cadenas Verlet que el motor 2D, con profundidad ----------
const SIM_STEPS=48,SIM_DT=1/60,GRAV=520;
E.simulate3=function(T){
  const sc=E.scene,L=sc.loop,wrap=tt=>((tt%L)+L)%L,res={},prevA={};
  for(let i=0;i<=SIM_STEPS;i++){
    const tt=T-(SIM_STEPS-i)*SIM_DT,st=sc.state(wrap(tt)),wind=sc.wind?sc.wind(wrap(tt)):[0,0,0];
    for(const ch of st.chars||[]){const def=sc.chars[ch.id];if(!def||!def.chains)continue;
      const r=res[ch.id]||(res[ch.id]={chains:{}});r.x=ch.x;r.y=ch.y||0;r.z=ch.z||0;
      const p=E.pose3(ch);
      for(const sp of def.chains.filter(Boolean)){const off=sp.off.length===3?sp.off:[sp.off[0],sp.off[1],0],q=p[sp.anchor],a=E.w3(ch,[q[0]+off[0],q[1]+off[1],q[2]+off[2]]);
        const key=ch.id+sp.key,pa=prevA[key];let nodes=r.chains[sp.key];
        if(!nodes||!pa||Math.hypot(a[0]-pa[0],a[1]-pa[1],a[2]-pa[2])>70){nodes=[];const bx=-Math.cos(ch.yaw||0),bz=-Math.sin(ch.yaw||0);
          for(let j=0;j<=sp.n;j++){const pp=[a[0]+bx*j*sp.len*.35,a[1]+j*sp.len*.92,a[2]+bz*j*sp.len*.35];nodes.push({p:pp,o:pp.slice()})}r.chains[sp.key]=nodes}
        prevA[key]=a;nodes[0].p=a.slice();nodes[0].o=a.slice();
        const g=GRAV*(sp.grav??1),wf=sp.wind??1,damp=sp.damp??.94;
        for(let j=1;j<nodes.length;j++){const nd=nodes[j],v=[0,1,2].map(k=>(nd.p[k]-nd.o[k])*damp),fl=Math.sin(tt*11+j*1.3)*(wind[0]||0)*.25;
          nd.o=nd.p.slice();nd.p=[nd.p[0]+v[0]+(wind[0]||0)*wf*SIM_DT*SIM_DT,nd.p[1]+v[1]+(g+(wind[1]||0)*wf+fl)*SIM_DT*SIM_DT,nd.p[2]+v[2]+(wind[2]||0)*wf*SIM_DT*SIM_DT]}
        for(let it=0;it<4;it++)for(let j=1;j<nodes.length;j++){const A=nodes[j-1].p,B=nodes[j].p,d=[B[0]-A[0],B[1]-A[1],B[2]-A[2]],dl=Math.hypot(...d)||1e-4,df=(dl-sp.len)/dl;
          for(let k=0;k<3;k++){if(j===1)B[k]-=d[k]*df;else{A[k]+=d[k]*df*.5;B[k]-=d[k]*df*.5}}}
      }
    }
  }
  return res;
};

// ---------- mundo ----------
E.sky3=function(bands){const hz=Math.max(2,Math.min(E.PH,E.horizon())),bh=hz/bands.length;
  bands.forEach((c,i)=>{E.R(0,i*bh,E.PW,bh+1,c);if(i<bands.length-1)E.ditherFill(.5,bands[i+1],0,(i+1)*bh-2,E.PW,(i+1)*bh)})};
// objetos lejanos ubicados por acimut: la ciudad y la luna giran con la cámara
const azX=a=>{let r=((a+C3.yaw+Math.PI)%(2*Math.PI)+2*Math.PI)%(2*Math.PI)-Math.PI;if(Math.abs(r)>1.3)return null;return C3.cx+Math.tan(r)*E.PW*.55};
E.moon3=function(az,yFrac,r){const x=azX(az);if(x==null)return;const y=E.PH*yFrac;E.ditherDisc(x,y,r*1.7,'#5a1028',.5);
  E.disc(x,y,r,'#d8243a');E.disc(x+r*.22,y-r*.08,r*.8,'#a81830');E.disc(x+r*.38,y-r*.12,r*.55,'#7e1026')};
E.skyline3=function(){const hz=E.horizon();
  for(let i=0;i<72;i++){const a=i/72*Math.PI*2,x=azX(a);if(x==null)continue;const w=E.PW*(.05+hash(i)*.06),h=E.PH*(.04+hash(i+50)*.14);
    E.R(x-w/2,hz-h,w,h+1,'#0d0817');for(let j=0;j<4;j++)if(hash(i*13+j)>.45)E.R(x-w/2+2+hash(i*7+j)*(w-4),hz-h+3+hash(i*3+j)*(h-5),1,1,hash(i+j)>.6?'#ffb070':'#7080ff')}};
// piso en perspectiva: relleno + grilla de baldosas (lo que más vende la profundidad cuando la cámara gira)
E.floor3=function(fill,lineCol,ext=320,step=40){const hz=E.horizon();E.R(0,hz,E.PW,E.PH-hz,fill);E.R(0,hz,E.PW,1,'#7a1830');
  for(let v=-ext;v<=ext;v+=step)for(const[a,b2]of[[[v,0,-ext],[v,0,ext]],[[-ext,0,v],[ext,0,v]]]){
    const n=16;let prev=null;for(let i=0;i<=n;i++){const q=[lerp(a[0],b2[0],i/n),0,lerp(a[2],b2[2],i/n)],pp=E.proj(...q);
      if(pp[3]<40){prev=null;continue}if(prev)E.line(prev[0],prev[1],pp[0],pp[1],1,lineCol);prev=pp}}};
E.shadow3=function(ch){const pp=E.proj(ch.x,0,ch.z||0),h=Math.max(0,-(ch.y||0)),sc=ch.scale||1;
  E.ditherEllipse(pp[0],pp[1],(22*sc-h*.05)*pp[2]*C3.K,(6+3*Math.abs(Math.sin(C3.yaw)))*sc*pp[2]*C3.K*.6,'#05030a',Math.max(0,.9-h/160))};
// reflejo correcto para piso plano: cada personaje se espeja sobre su propio pie (y → −y), no sobre el horizonte
E.reflect3=function(chars,level=.45){
  const lay=E.withLayer(()=>{for(const ch of chars)E.figure3(ch,'plain',null,{mirror:true})}),Ld=lay.getImageData(0,0,E.PW,E.PH).data;
  const b=E.ctx(),M=b.getImageData(0,0,E.PW,E.PH),m=M.data,hz=E.horizon(),f=Math.floor(E.t*12);
  for(let y=Math.max(0,Math.ceil(hz));y<E.PH;y++){const xw=Math.round(Math.sin(y*.9+f*.8));for(let x=0;x<E.PW;x++){if(BAYER[y&3][x&3]/16>=level)continue;
    const sx=x+xw;if(sx<0||sx>=E.PW)continue;const si=(y*E.PW+sx)*4;if(!Ld[si+3])continue;const o=(y*E.PW+x)*4;
    m[o]=Ld[si]*.5+m[o]*.3;m[o+1]=Ld[si+1]*.5+m[o+1]*.3;m[o+2]=Ld[si+2]*.55+m[o+2]*.35}}
  b.putImageData(M,0,0);
};
// impacto contra el lente: grietas de vidrio desde un punto
E.glassCrack=function(cx,cy,k,seed=3){const R=Math.hypot(E.PW,E.PH);
  for(let i=0;i<11;i++){const a=hash(seed+i)*Math.PI*2,len=R*(.3+hash(seed*7+i)*.6)*k;let px=cx,py=cy;
    for(let s=1;s<=7;s++){const r=len*s/7,j=(hash(seed+i*9+s)-.5)*14,nx=cx+Math.cos(a)*r-Math.sin(a)*j,ny=cy+Math.sin(a)*r+Math.cos(a)*j;E.line(px,py,nx,ny,s<3?2:1,s<3?'#ffffff':'#c8dcff');px=nx;py=ny}}
  for(let ring=1;ring<=3;ring++){const r=ring*16*k;for(let i=0;i<9;i++){if(hash(seed*3+ring*11+i)<.4)continue;const a0=i/9*Math.PI*2,a1=a0+.5;
    E.line(cx+Math.cos(a0)*r,cy+Math.sin(a0)*r,cx+Math.cos(a1)*r*1.1,cy+Math.sin(a1)*r*1.1,1,'#e8f0ff')}}};
E.impact3=function(t0,cx,cy,chars,kanji){
  const f=Math.floor((E.t-t0)*24),m=Math.floor(f/2)%3,bg=['#f4f1ec','#05040a','#c4102a'][m],ink=['#05040a','#f4f1ec','#05040a'][m];
  E.R(0,0,E.PW,E.PH,bg);E.focusLines(ink,70,2,24,cx,cy);E.R(0,E.horizon(),E.PW,E.PH,ink);
  for(const ch of chars)E.figure3(ch,'ink',ink);
  if(m!==1&&kanji)E.pixText(kanji,E.PW*.5,E.PH*(Math.floor(f/2)%2?.8:.22),Math.min(E.PW,E.PH)*.42,ink);
};
})();
