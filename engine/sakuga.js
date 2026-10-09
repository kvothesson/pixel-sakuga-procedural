/* Sakuga — motor de pixel sakuga procedural.
 * Una escena es: personajes (paleta + cadenas físicas) + state(t) puro + render(s).
 * Todo lo aleatorio sale de hash(n): cualquier instante es reproducible con window.__seek(t).
 * Ver guia/pixel-sakuga-procedural.md.
 */
(function(){
'use strict';
const E={t:0,PW:0,PH:0,PX:1,u:1,running:true,SHX:0,cam:{k:1,cx:0,cy:0,camX:0,camY:0},chainCache:{}};
let cv,ctx,buf,b,layer,lb,stageEl,scene;
const FONT='"DotGothic16","MS Gothic",monospace';

// ---------- matemática ----------
const clamp=k=>k<0?0:k>1?1:k, lerp=(a,c,k)=>a+(c-a)*k;
const ease=k=>{k=clamp(k);return k*k*(3-2*k)}, easeIn=k=>{k=clamp(k);return k*k*k}, easeOut=k=>{k=clamp(k);return 1-(1-k)**3};
const hash=n=>{const s=Math.sin(n*127.1+311.7)*43758.5453;return s-Math.floor(s)};
const segAt=(tt,a,c)=>clamp((tt-a)/(c-a));
const BAYER=[[0,8,2,10],[12,4,14,6],[3,11,1,9],[15,7,13,5]];
Object.assign(E,{clamp,lerp,ease,easeIn,easeOut,hash,segAt,seg:(a,c)=>segAt(E.t,a,c),BAYER,
  q8:tt=>Math.floor(tt*8)/8, q12:tt=>Math.floor(tt*12)/12, q24:tt=>Math.floor(tt*24)/24});

// ---------- primitivas pixel ----------
const R=(x,y,w,h,c)=>{b.fillStyle=c;b.fillRect(Math.round(x),Math.round(y),Math.round(w),Math.round(h))};
function line(x0,y0,x1,y1,w,c){
  x0=Math.round(x0);y0=Math.round(y0);x1=Math.round(x1);y1=Math.round(y1);w=Math.max(1,Math.round(w));
  b.fillStyle=c;const o=Math.floor(w/2);
  let dx=Math.abs(x1-x0),dy=-Math.abs(y1-y0),sx=x0<x1?1:-1,sy=y0<y1?1:-1,e=dx+dy,n=0;
  while(n++<3000){b.fillRect(x0-o,y0-o,w,w);if(x0===x1&&y0===y1)break;const e2=2*e;if(e2>=dy){e+=dy;x0+=sx}if(e2<=dx){e+=dx;y0+=sy}}
}
function disc(cx,cy,r,c){cx=Math.round(cx);cy=Math.round(cy);r=Math.max(0,Math.round(r));b.fillStyle=c;
  for(let dy=-r;dy<=r;dy++){const h=Math.floor(Math.sqrt(Math.max(0,r*r-dy*dy+r*.8)));b.fillRect(cx-h,cy+dy,2*h+1,1)}}
function ring(cx,cy,rx,ry,c){const n=Math.max(12,Math.round((rx+ry)*3));b.fillStyle=c;
  for(let i=0;i<n;i++){const a=i/n*Math.PI*2;b.fillRect(Math.round(cx+Math.cos(a)*rx),Math.round(cy+Math.sin(a)*ry),1,1)}}
function ditherDisc(cx,cy,r,c,level){cx=Math.round(cx);cy=Math.round(cy);r=Math.min(400,Math.round(r));if(r<1||level<=0)return;b.fillStyle=c;
  for(let dy=-r;dy<=r;dy++){const y=cy+dy;if(y<0||y>=E.PH)continue;for(let dx=-r;dx<=r;dx++){const x=cx+dx;if(x<0||x>=E.PW)continue;
    const d=Math.sqrt(dx*dx+dy*dy)/r;if(d>1)continue;if(BAYER[y&3][x&3]/16<level*(1-d))b.fillRect(x,y,1,1)}}}
function ditherFill(level,c,x0=0,y0=0,x1=E.PW,y1=E.PH){if(level<=0)return;b.fillStyle=c;
  for(let y=Math.max(0,y0|0);y<Math.min(E.PH,y1);y++)for(let x=Math.max(0,x0|0);x<Math.min(E.PW,x1);x++)if(BAYER[y&3][x&3]/16<level)b.fillRect(x,y,1,1)}
const tmp=document.createElement('canvas'),tc=tmp.getContext('2d',{willReadFrequently:true});
function pixText(str,x,y,size,c){
  size=Math.max(8,Math.round(size));tc.font=`${size}px ${FONT}`;const w=Math.ceil(tc.measureText(str).width)+2,h=size+4;
  tmp.width=w;tmp.height=h;tc.font=`${size}px ${FONT}`;tc.textBaseline='top';tc.fillStyle='#fff';tc.fillText(str,1,1);
  const d=tc.getImageData(0,0,w,h).data;b.fillStyle=c;const ox=Math.round(x-w/2),oy=Math.round(y-h/2);
  for(let j=0;j<h;j++)for(let i=0;i<w;i++)if(d[(j*w+i)*4+3]>110)b.fillRect(ox+i,oy+j,1,1);
}
// relleno de polígono por líneas de barrido: sin antialias, pixel-exacto
function poly(pts,c){let y0=Infinity,y1=-Infinity;for(const p of pts){y0=Math.min(y0,p[1]);y1=Math.max(y1,p[1])}b.fillStyle=c;const n=pts.length;
  for(let y=Math.floor(y0);y<=Math.ceil(y1);y++){const yc=y+.5,xs=[];
    for(let i=0;i<n;i++){const p=pts[i],q=pts[(i+1)%n];if((p[1]<=yc&&q[1]>yc)||(q[1]<=yc&&p[1]>yc))xs.push(p[0]+(yc-p[1])/(q[1]-p[1])*(q[0]-p[0]))}
    xs.sort((a,c)=>a-c);for(let i=0;i+1<xs.length;i+=2){const xa=Math.round(xs[i]),xb=Math.round(xs[i+1]);if(xb>xa)b.fillRect(xa,y,xb-xa,1)}}}
// miembro que se afina: trapecio + articulaciones redondeadas
function limb(a,c,wa,wc,col){const dx=c[0]-a[0],dy=c[1]-a[1],d=Math.hypot(dx,dy)||1,nx=-dy/d,ny=dx/d;
  poly([[a[0]+nx*wa/2,a[1]+ny*wa/2],[c[0]+nx*wc/2,c[1]+ny*wc/2],[c[0]-nx*wc/2,c[1]-ny*wc/2],[a[0]-nx*wa/2,a[1]-ny*wa/2]],col);
  disc(a[0],a[1],wa/2-.3,col);disc(c[0],c[1],wc/2-.3,col)}
Object.assign(E,{R,line,disc,ring,ditherDisc,ditherFill,pixText,poly,limb});

// ---------- cámara ----------
const toPx=(wx,wy)=>[E.cam.cx+(wx-E.cam.camX)*E.cam.k,E.cam.cy+(wy-E.cam.camY)*E.cam.k];
function wrect(x,y,w,h,c){const[a,bb]=toPx(x,y);R(a,bb,w*E.cam.k,h*E.cam.k,c)}
function setCam(c){
  const sh=c.shake||0,sx=Math.round((hash(Math.floor(E.t*24))-.5)*sh),sy=Math.round((hash(Math.floor(E.t*24)+99)-.5)*sh);
  E.cam={k:(c.zoom||1)*E.u,cx:E.PW/2+sx,cy:E.PH*(scene.camCy??.5)+sy,camX:c.camX||0,camY:c.camY||0,rot:c.rot||0};
}
// rotación de cámara pixel-exacta: se rota el buffer ya dibujado con vecino más cercano (como el Mode 7 de la SNES)
function rotateBuffer(a){
  const W=E.PW,H=E.PH,src=b.getImageData(0,0,W,H),dst=b.createImageData(W,H),zm=1+Math.abs(a)*.9,cs=Math.cos(a)/zm,sn=Math.sin(a)/zm,cx=W/2,cy=H/2,s=src.data,d=dst.data;
  for(let y=0;y<H;y++)for(let x=0;x<W;x++){const dx=x-cx,dy=y-cy,sx=Math.round(cx+dx*cs+dy*sn),sy=Math.round(cy-dx*sn+dy*cs),o=(y*W+x)*4;
    if(sx>=0&&sx<W&&sy>=0&&sy<H){const i=(sy*W+sx)*4;d[o]=s[i];d[o+1]=s[i+1];d[o+2]=s[i+2];d[o+3]=255}else d[o+3]=255}
  b.putImageData(dst,0,0);
}
Object.assign(E,{toPx,wrect});

// ---------- poses (mirando a la derecha, y negativo = arriba, ~95 unidades de alto) ----------
E.P={
 stance:{hip:[0,-45],chest:[3,-74],head:[6,-89],lE:[-8,-60],lH:[4,-52],rE:[16,-64],rH:[26,-70],lK:[-12,-23],lF:[-22,0],rK:[13,-23],rF:[20,0]},
 stance2:{hip:[0,-44],chest:[3,-72],head:[6,-87],lE:[-8,-58],lH:[4,-50],rE:[16,-62],rH:[26,-68],lK:[-12,-22],lF:[-22,0],rK:[13,-22],rF:[20,0]},
 crouch:{hip:[0,-30],chest:[-6,-55],head:[-4,-69],lE:[-14,-44],lH:[-22,-36],rE:[4,-44],rH:[-4,-36],lK:[-14,-16],lF:[-26,0],rK:[15,-20],rF:[24,0]},
 dash:{hip:[0,-36],chest:[20,-58],head:[30,-70],lE:[-6,-54],lH:[-24,-48],rE:[30,-56],rH:[44,-60],lK:[-16,-26],lF:[-40,-10],rK:[18,-28],rF:[12,-2]},
 strike:{hip:[0,-42],chest:[15,-69],head:[22,-82],lE:[-4,-62],lH:[-18,-54],rE:[38,-72],rH:[62,-74],lK:[-18,-21],lF:[-32,0],rK:[17,-24],rF:[27,0]},
 upper:{hip:[0,-42],chest:[6,-70],head:[10,-85],lE:[-10,-60],lH:[-4,-50],rE:[22,-88],rH:[30,-110],lK:[-16,-22],lF:[-26,0],rK:[14,-24],rF:[22,0]},
 block:{hip:[0,-42],chest:[2,-70],head:[3,-84],lE:[-8,-90],lH:[12,-104],rE:[14,-92],rH:[-6,-106],lK:[-16,-22],lF:[-26,0],rK:[14,-24],rF:[22,0]},
 divekick:{hip:[0,-46],chest:[3,-73],head:[5,-87],lE:[-12,-68],lH:[-20,-80],rE:[14,-72],rH:[24,-84],lK:[-3,-24],lF:[-2,0],rK:[14,-38],rF:[6,-30]},
 tuck:{hip:[0,-40],chest:[6,-58],head:[10,-70],lE:[-2,-50],lH:[10,-40],rE:[14,-50],rH:[18,-40],lK:[10,-30],lF:[0,-22],rK:[16,-28],rF:[6,-18]},
 jab:{hip:[0,-43],chest:[10,-71],head:[15,-85],lE:[2,-62],lH:[14,-70],rE:[34,-70],rH:[56,-71],lK:[-16,-22],lF:[-28,0],rK:[15,-23],rF:[24,0]},
 parry:{hip:[0,-44],chest:[0,-72],head:[1,-87],lE:[10,-72],lH:[18,-90],rE:[8,-58],rH:[16,-62],lK:[-14,-22],lF:[-24,0],rK:[13,-23],rF:[22,0]},
 kick:{hip:[0,-48],chest:[-12,-73],head:[-17,-86],lE:[-24,-62],lH:[-32,-50],rE:[2,-64],rH:[-4,-54],lK:[-3,-24],lF:[-6,0],rK:[24,-62],rF:[48,-80]},
 lean:{hip:[0,-42],chest:[-12,-66],head:[-21,-78],lE:[-24,-58],lH:[-30,-46],rE:[-2,-60],rH:[6,-52],lK:[-14,-22],lF:[-26,0],rK:[12,-24],rF:[22,0]},
 duck:{hip:[0,-24],chest:[8,-44],head:[14,-56],lE:[14,-40],lH:[22,-50],rE:[18,-36],rH:[26,-44],lK:[-14,-12],lF:[-26,0],rK:[16,-18],rF:[22,0]},
 land:{hip:[0,-26],chest:[8,-50],head:[14,-63],lE:[-6,-40],lH:[-4,-28],rE:[22,-36],rH:[26,-2],lK:[16,-16],lF:[22,0],rK:[-14,-6],rF:[-28,0]},
 dualblock:{hip:[0,-44],chest:[0,-72],head:[0,-87],lE:[-15,-73],lH:[-29,-76],rE:[15,-73],rH:[29,-76],lK:[-14,-22],lF:[-26,0],rK:[14,-22],rF:[26,0]},
 walkA:{hip:[0,-47.5],chest:[3,-76],head:[6,-91],lE:[-8,-62],lH:[-15,-50],rE:[11,-63],rH:[22,-53],lK:[-6,-24],lF:[-12,0],rK:[8,-24],rF:[14,0]},
 walkB:{hip:[0,-47.5],chest:[3,-76],head:[6,-91],lE:[10,-63],lH:[21,-53],rE:[-7,-62],rH:[-14,-50],lK:[-6,-24],lF:[-12,0],rK:[8,-24],rF:[14,0]},
 runA:{hip:[0,-40],chest:[10,-67],head:[16,-81],lE:[-8,-56],lH:[-4,-44],rE:[22,-58],rH:[28,-70],lK:[-8,-20],lF:[-14,0],rK:[12,-20],rF:[16,0]},
 runB:{hip:[0,-40],chest:[10,-67],head:[16,-81],lE:[20,-58],lH:[26,-70],rE:[-6,-56],rH:[-2,-44],lK:[-8,-20],lF:[-14,0],rK:[12,-20],rF:[16,0]},
 sweep:{hip:[0,-18],chest:[-10,-38],head:[-14,-51],lE:[-18,-28],lH:[-26,-14],rE:[-2,-30],rH:[-8,-16],lK:[-12,-8],lF:[-26,0],rK:[18,-10],rF:[42,-3]},
 charge:{hip:[0,-44],chest:[4,-72],head:[7,-87],lE:[-10,-62],lH:[-18,-52],rE:[18,-70],rH:[34,-72],lK:[-12,-22],lF:[-26,0],rK:[14,-23],rF:[24,0]},
 fire:{hip:[0,-42],chest:[9,-70],head:[14,-84],lE:[14,-66],lH:[30,-68],rE:[24,-71],rH:[40,-72],lK:[-16,-21],lF:[-30,0],rK:[15,-23],rF:[24,0]},
 lowcharge:{hip:[0,-24],chest:[8,-46],head:[13,-59],lE:[-2,-38],lH:[-10,-30],rE:[20,-44],rH:[32,-46],lK:[-14,-10],lF:[-28,0],rK:[16,-18],rF:[22,0]},
 lowfire:{hip:[0,-23],chest:[11,-44],head:[16,-57],lE:[18,-42],lH:[32,-46],rE:[24,-45],rH:[38,-48],lK:[-15,-9],lF:[-30,0],rK:[16,-17],rF:[22,0]},
 kneel:{hip:[0,-26],chest:[5,-53],head:[9,-67],lE:[2,-42],lH:[10,-30],rE:[12,-40],rH:[18,-28],lK:[14,-14],lF:[18,0],rK:[-10,-4],rF:[-24,0]},
 after:{hip:[0,-27],chest:[9,-51],head:[15,-64],lE:[-4,-42],lH:[-22,-40],rE:[22,-38],rH:[32,-4],lK:[-20,-14],lF:[-34,0],rK:[15,-25],rF:[13,0]}
};
// interpolación por ARCOS: cada hueso rota alrededor de su padre (no se acorta ni corta camino en línea recta)
const PARENT={chest:'hip',head:'chest',lE:'chest',lH:'lE',rE:'chest',rH:'rE',lK:'hip',lF:'lK',rK:'hip',rF:'rK'};
const ORDER=['hip','chest','head','lE','lH','rE','rH','lK','lF','rK','rF'];
E.lerpPoseLinear=(a,c,k)=>{const o={};for(const j in a)o[j]=[lerp(a[j][0],c[j][0],k),lerp(a[j][1],c[j][1],k)];return o};
E.lerpPose=(a,c,k)=>{
  if(k<=0)return a;if(k>=1)return c;
  const o={hip:[lerp(a.hip[0],c.hip[0],k),lerp(a.hip[1],c.hip[1],k)]};
  for(const j of ORDER){if(j==='hip')continue;const pj=PARENT[j];
    const va=[a[j][0]-a[pj][0],a[j][1]-a[pj][1]],vc=[c[j][0]-c[pj][0],c[j][1]-c[pj][1]];
    const aa=Math.atan2(va[1],va[0]);let da=Math.atan2(vc[1],vc[0])-aa;da=((da+Math.PI)%(2*Math.PI)+2*Math.PI)%(2*Math.PI)-Math.PI;
    const ang=aa+da*k,len=lerp(Math.hypot(...va),Math.hypot(...vc),k);
    o[j]=[o[pj][0]+Math.cos(ang)*len,o[pj][1]+Math.sin(ang)*len]}
  return o};
E.rotPt=(f,[x,y])=>{const cs=Math.cos(f.rot||0),sn=Math.sin(f.rot||0),lx=(f.dir||1)*x;return[lx*cs-y*sn,lx*sn+y*cs]};
E.worldPt=(f,q)=>{const[rx,ry]=E.rotPt(f,q);return[f.x+rx,(f.y||0)+ry]};
E.localPt=(f,[wx,wy])=>{const cs=Math.cos(-(f.rot||0)),sn=Math.sin(-(f.rot||0)),dx=wx-f.x,dy=wy-(f.y||0);return[(dx*cs-dy*sn)*(f.dir||1),dx*sn+dy*cs]};

// ---------- cinemática inversa de dos huesos: el pie va al objetivo, la rodilla dobla hacia adelante ----------
function ikLeg(pose,K,F,target){
  const H=pose.hip,L1=Math.hypot(pose[K][0]-H[0],pose[K][1]-H[1]),L2=Math.hypot(pose[F][0]-pose[K][0],pose[F][1]-pose[K][1]);
  let dx=target[0]-H[0],dy=target[1]-H[1],d=Math.hypot(dx,dy)||1e-3;const ux=dx/d,uy=dy/d;d=Math.min(d,L1+L2-.01);
  const a=(L1*L1-L2*L2+d*d)/(2*d),h=Math.sqrt(Math.max(0,L1*L1-a*a)),px=H[0]+ux*a,py=H[1]+uy*a;
  const k1=[px-uy*h,py+ux*h],k2=[px+uy*h,py-ux*h];
  pose[K]=k1[0]>k2[0]?k1:k2;pose[F]=[H[0]+ux*d,H[1]+uy*d];
}
function kneesForward(p){
  for(const[K,F]of[['lK','lF'],['rK','rF']]){const H=p.hip,dx=p[F][0]-H[0],dy=p[F][1]-H[1],L=dx*dx+dy*dy;if(L<1)continue;
    const kx=p[K][0]-H[0],ky=p[K][1]-H[1],cross=dx*ky-dy*kx; // lado de la línea cadera→pie en que cae la rodilla
    const fwd=-dy; // dirección "adelante" perpendicular a la línea (mirando a la derecha)
    if(cross*Math.sign(dy||1)>0&&dy>0){const t=(kx*dx+ky*dy)/L,px=t*dx,py=t*dy;p[K]=[H[0]+2*px-kx,H[1]+2*py-ky]}}
  return p}
E.plantPose=ch=>{const p={};for(const j in ch.pose)p[j]=ch.pose[j].slice();kneesForward(p);if(!ch.plant)return p;
  if(ch.plant.lF)ikLeg(p,'lK','lF',E.localPt(ch,ch.plant.lF));if(ch.plant.rF)ikLeg(p,'rK','rF',E.localPt(ch,ch.plant.rF));return p};
// marcha procedural: cada pie queda clavado en el piso mientras el cuerpo avanza, y después vuela en arco al próximo apoyo
E.gait=function(d,{x0,dir=1,stride=22,lift=8,lead=.3,bob=1.5}){
  // apoyo: el pie queda fijo mientras el cuerpo pasa por encima (de +lead a -lead de zancada)
  // vuelo: despega por detrás, sube rápido y baja suave adelante (pico en el primer tercio)
  const foot=off=>{const u=d/stride+off,n=Math.floor(u),f=u-n,plant=m=>(m-off+lead)*stride;
    if(f<.6)return[x0+dir*plant(n),0];const q=(f-.6)/.4;return[x0+dir*lerp(plant(n),plant(n+1),ease(q)),-Math.sin(Math.PI*Math.pow(q,.7))*lift]};
  const u=d/stride;return{x:x0+dir*d,l:foot(0),r:foot(.5),swing:(Math.sin(u*Math.PI*2)+1)/2,y:-(1-Math.cos((u-.05)*Math.PI*4))*bob*.5+bob*.3};
};

// ---------- física secundaria: cadenas Verlet deterministas ----------
// Para dibujar el instante T se re-simula desde T-0.8s con paso fijo, leyendo state() en cada subpaso.
// Así la física es reproducible, sobrevive al seek y respeta el loop.
const SIM_STEPS=48,SIM_DT=1/60,GRAV=520;
function chainAnchor(ch,spec){const p=ch.pose[spec.anchor];return E.worldPt(ch,[p[0]+spec.off[0],p[1]+spec.off[1]])}
function simulate(T){
  const L=scene.loop,wrap=tt=>((tt%L)+L)%L,res={},prevA={};
  for(let i=0;i<=SIM_STEPS;i++){
    const tt=T-(SIM_STEPS-i)*SIM_DT,st=scene.state(wrap(tt)),wind=scene.wind?scene.wind(wrap(tt)):[0,0];
    for(const ch of st.chars||[]){
      const def=scene.chars[ch.id];if(!def||!def.chains)continue;
      const r=res[ch.id]||(res[ch.id]={chains:{},x:ch.x,y:ch.y||0});r.x=ch.x;r.y=ch.y||0;
      for(const spec of def.chains){
        const a=chainAnchor(ch,spec),key=ch.id+spec.key,pa=prevA[key];let nodes=r.chains[spec.key];
        if(!nodes||!pa||Math.hypot(a[0]-pa[0],a[1]-pa[1])>70){
          nodes=[];for(let j=0;j<=spec.n;j++){const p=[a[0]-(ch.dir||1)*j*spec.len*.35,a[1]+j*spec.len*.92];nodes.push({p,o:[p[0],p[1]]})} // arranca colgando
          r.chains[spec.key]=nodes;
        }
        prevA[key]=a;nodes[0].p=[a[0],a[1]];nodes[0].o=[a[0],a[1]];
        const g=GRAV*(spec.grav??1),wf=spec.wind??1,damp=spec.damp??.94;
        for(let j=1;j<nodes.length;j++){const nd=nodes[j],vx=(nd.p[0]-nd.o[0])*damp,vy=(nd.p[1]-nd.o[1])*damp;
          const flutter=Math.sin(tt*11+j*1.3+spec.n)*wind[0]*.25;
          nd.o=[nd.p[0],nd.p[1]];nd.p=[nd.p[0]+vx+wind[0]*wf*SIM_DT*SIM_DT,nd.p[1]+vy+(g+wind[1]*wf+flutter)*SIM_DT*SIM_DT]}
        for(let it=0;it<4;it++)for(let j=1;j<nodes.length;j++){
          const A=nodes[j-1].p,B=nodes[j].p,dx=B[0]-A[0],dy=B[1]-A[1],d=Math.hypot(dx,dy)||1e-4,diff=(d-spec.len)/d;
          if(j===1){B[0]-=dx*diff;B[1]-=dy*diff}else{A[0]+=dx*diff*.5;A[1]+=dy*diff*.5;B[0]-=dx*diff*.5;B[1]-=dy*diff*.5}
        }
      }
    }
  }
  return res;
}

// ---------- personaje ----------
// capas: contorno (+2) → borde de luz (1 px hacia la luz) → cuerpo → ojo. Nunca líneas internas de 1 px.
function figure(ch,mode='glow',inkCol){
  const def=scene.chars[ch.id],pal=def.pal,p=E.plantPose(ch),k=E.cam.k;
  const pt=q=>{const[wx,wy]=E.worldPt(ch,q),[a,c]=toPx(wx,wy);return[a+E.SHX,c]};
  const J={};for(const j in p)J[j]=pt(p[j]);
  const cache=E.chainCache[ch.id],sdx=cache?ch.x-cache.x:0,sdy=cache?(ch.y||0)-cache.y:0;
  const chains=(def.chains||[]).filter(sp=>!sp.when||sp.when(ch)).map(sp=>({sp,pts:cache&&cache.chains[sp.key]?cache.chains[sp.key].map(n=>{const[a,c]=toPx(n.p[0]+sdx,n.p[1]+sdy);return[a+E.SHX,c]}):null})).filter(c=>c.pts);
  const L=(a,c,w,col)=>line(a[0],a[1],c[0],c[1],w,col);
  const [hx,hy]=p.head;
  // SMEARS: si una mano o un pie se movió mucho desde el cuadro anterior (a 12 fps), se estira por el arco recorrido
  const smears=[];const prev=E.prevChars&&E.prevChars[ch.id];
  if(prev&&!ch.noSmear&&prev.dir===ch.dir&&Math.abs((prev.rot||0)-(ch.rot||0))<.5){
    for(const[j,w,c]of[['lH',4.5,'glove'],['rH',5,'glove'],['lF',4,'pants'],['rF',4,'pants']]){
      if(ch.plant&&(j==='lF'||j==='rF'))continue;const pw=E.worldPt(prev,E.plantPose(prev)[j]),cw=E.worldPt(ch,p[j]);if(Math.hypot(cw[0]-pw[0],cw[1]-pw[1])<18)continue;
      const path=[];for(let i=0;i<=5;i++){const q=i/5,mid=E.lerpPose(prev.pose,p,q),pos={...ch,x:lerp(prev.x,ch.x,q),y:lerp(prev.y||0,ch.y||0,q)};path.push(toPx(...E.worldPt(pos,mid[j])))}
      smears.push({path,w,c})}}
  const draw=(o,cl)=>{
    const col=c=>cl||c;
    for(const sm of smears)for(let i=0;i<sm.path.length-1;i++){const q=(i+1)/sm.path.length;L([sm.path[i][0]+E.SHX,sm.path[i][1]],[sm.path[i+1][0]+E.SHX,sm.path[i+1][1]],(sm.w*2*q)*k+o,col(pal[sm.c]))}
    // cadenas con trazo afinado (no pincel cuadrado): faldones, capas y pelo se leen como tela, no como cajas
    const chainDraw=(sp,pts)=>{const n=pts.length-1;for(let i=0;i<n;i++){const w0=lerp(sp.w[0],sp.w[1],i/n),w1=lerp(sp.w[0],sp.w[1],(i+1)/n);
      limb(pts[i],pts[i+1],w0*k+o,w1*k+o,col(sp.tipFrom!=null&&i>=sp.tipFrom?pal[sp.tip]:pal[sp.col]))}};
    for(const{sp,pts}of chains)if(!sp.front)chainDraw(sp,pts);
    // ANATOMÍA: muslos y brazos que se afinan, pies con punta, torso con hombros y cintura, cuello
    const W=(u)=>u*k+o;
    // BOTA: la canilla termina ancha (no en punta) y entra en una bota con talón, suela plana y punta;
    // el ruedo del pantalón tapa la unión. Nunca un tubo redondeado pegado al tobillo.
    const BOOT=[[-4.5,-10],[-5.5,-3],[-5,0],[8.5,0],[10.5,-1.5],[10,-3.5],[5,-6],[3.5,-10]];
    const shape=(F,pts,ox=0)=>pts.map(([x,y])=>pt([p[F][0]+x+ox,p[F][1]+y]));
    const outlinePoly=(pts,c)=>{poly(pts,c);if(o>0)for(let i=0;i<pts.length;i++){const a=pts[i],b2=pts[(i+1)%pts.length];line(a[0],a[1],b2[0],b2[1],o,c)}};
    const leg=(K,F,c)=>{limb(J.hip,J[K],W(12),W(9.5),c);const ank=pt([p[F][0],p[F][1]-8]);limb(J[K],ank,W(9.5),W(7.5),c);
      outlinePoly(shape(F,BOOT),col(pal.boot||pal.pants));
      outlinePoly(shape(F,[[-5.5,-12.5],[-5.5,-9],[5,-9],[5,-12.5]]),c)}; // ruedo
    leg('lK','lF',col(pal.pantsD||pal.pants));
    limb(J.chest,J.lE,W(8),W(6.5),col(pal.coatD));limb(J.lE,J.lH,W(6.5),W(5),col(pal.coatD));
    leg('rK','rF',col(pal.pants));
    {const sx=J.chest[0]-J.hip[0],sy=J.chest[1]-J.hip[1],d=Math.hypot(sx,sy)||1,nx=-sy/d,ny=sx/d,wv=(h)=>(h*k+o/2);
      const mid=[(J.chest[0]+J.hip[0])/2,(J.chest[1]+J.hip[1])/2],top=[J.chest[0]+sx/d*3*k,J.chest[1]+sy/d*3*k];
      poly([[top[0]+nx*wv(10.5),top[1]+ny*wv(10.5)],[mid[0]+nx*wv(7),mid[1]+ny*wv(7)],[J.hip[0]+nx*wv(8),J.hip[1]+ny*wv(8)],
            [J.hip[0]-nx*wv(8),J.hip[1]-ny*wv(8)],[mid[0]-nx*wv(7),mid[1]-ny*wv(7)],[top[0]-nx*wv(10.5),top[1]-ny*wv(10.5)]],col(pal.coat));
      disc(top[0]+nx*wv(7),top[1]+ny*wv(7),wv(4),col(pal.coat));disc(top[0]-nx*wv(7),top[1]-ny*wv(7),wv(4),col(pal.coat));}
    limb(J.chest,J.head,W(5.5),W(5),col(pal.neck||pal.skin));
    limb(J.chest,J.rE,W(8),W(6.5),col(pal.coat));limb(J.rE,J.rH,W(6.5),W(5),col(pal.coat));
    // puños: chicos y alargados en la dirección del antebrazo (una bola grande se lee mal)
    const fist=(E2,H2,r)=>{const dx=J[H2][0]-J[E2][0],dy=J[H2][1]-J[E2][1],d=Math.hypot(dx,dy)||1;
      limb([J[H2][0]-dx/d*r*.6,J[H2][1]-dy/d*r*.6],[J[H2][0]+dx/d*r*.7,J[H2][1]+dy/d*r*.7],r*1.7*k+o,r*1.5*k+o,col(pal.glove))};
    fist('lE','lH',3.2);fist('rE','rH',3.4);
    if(def.head==='hood'&&!ch.hoodDown){
      const back=pt([hx-15,hy-4]);L(J.head,back,7*k+o,col(pal.hood));
      disc(J.head[0],J.head[1],10.5*k+o/2,col(pal.hood));
      if(!cl){const fc=pt([hx+3.5,hy+1.5]);disc(fc[0],fc[1],5*k,pal.skin);const sh=pt([hx+1,hy-4]);line(sh[0]-3*k,sh[1],sh[0]+5*k,sh[1],Math.max(1,2*k),pal.hood)}
    }else{
      if(def.head==='hood'){const hb=pt([hx-12,hy+12]);disc(hb[0],hb[1],7*k+o/2,col(pal.hood))} // capucha caída sobre la espalda
      disc(J.head[0],J.head[1],8.5*k+o/2,col(pal.skin));
      const top=pt([hx-2,hy-4]);disc(top[0],top[1],7*k+o/2,col(pal.hair));
      const fr=pt([hx+5,hy-6]);disc(fr[0],fr[1],3*k+o/2,col(pal.hair));
    }
    for(const{sp,pts}of chains)if(sp.front)chainDraw(sp,pts);
  };
  if(mode==='ink'){draw(0,inkCol);return}
  draw(2,mode==='glow'?pal.aura:'#000');
  if(scene.light){const side=ch.x<scene.light.x?1:-1,keep=E.SHX;E.SHX=keep+side;draw(0,scene.light.rim);E.SHX=keep}
  draw(0,null);
  const e=pt([hx+5,hy-1]);R(e[0],e[1],Math.max(1,Math.round(k*1.5)),1,mode==='glow'?pal.aura:'#fff');
}
// dibuja en una capa aparte y la perfora con Bayer: aparecer/desaparecer en pixel art
function dissolve(level,fn){
  if(level<=0)return;if(level>=1){fn();return}
  const keep=b;lb.clearRect(0,0,E.PW,E.PH);b=lb;fn();
  for(let y=0;y<E.PH;y++)for(let x=0;x<E.PW;x++)if(BAYER[y&3][x&3]/16>=level)lb.clearRect(x,y,1,1);
  b=keep;b.drawImage(layer,0,0);
}
function ditherEllipse(cx,cy,rx,ry,c,level){cx=Math.round(cx);cy=Math.round(cy);if(rx<1||ry<.5||level<=0)return;b.fillStyle=c;
  for(let dy=-Math.ceil(ry);dy<=Math.ceil(ry);dy++){const y=cy+dy;if(y<0||y>=E.PH)continue;for(let dx=-Math.ceil(rx);dx<=Math.ceil(rx);dx++){const x=cx+dx;if(x<0||x>=E.PW)continue;
    const d=Math.hypot(dx/rx,dy/ry);if(d>1)continue;if(BAYER[y&3][x&3]/16<level*(1-d*d*.6))b.fillRect(x,y,1,1)}}}
// sombra de contacto: se achica y aclara cuanto más alto está el personaje; cada pie apoyado oscurece su punto
function shadow(ch,col='#05030a'){const p=E.plantPose(ch),k=E.cam.k,hgt=Math.max(0,-(ch.y||0));
  const lv=Math.max(0,.85-hgt/160),[sx,sy]=toPx(ch.x,0);ditherEllipse(sx,sy+1,(22-hgt*.05)*k,(4)*k,col,Math.min(1,lv*1.2));
  for(const F of['lF','rF']){const[wx,wy]=E.worldPt(ch,p[F]);if(wy<-6)continue;const[fx,fy]=toPx(wx,0);ditherEllipse(fx,fy+1,7*k,2*k,col,1)}}
// ---------- luz de la energía: los personajes se dibujan en una capa y cada píxel se tiñe según la distancia a cada fuente ----------
// lights: [{x,y (mundo), c:[r,g,b], r (unidades), i (0..1)}]. Se aplica con dither Bayer: la luz "salpica" en pixel art.
E.litCast=function(list,lights){
  lb.clearRect(0,0,E.PW,E.PH);const keep=b;b=lb;for(const it of list)figure(it.ch,it.mode||'glow',it.ink);b=keep;
  if(lights&&lights.length){const img=lb.getImageData(0,0,E.PW,E.PH),d=img.data,W=E.PW;
    const Ls=lights.map(L=>{const[px,py]=toPx(L.x,L.y);return{px,py,r:L.r*E.cam.k,c:L.c,i:L.i}}).filter(L=>L.i>0&&L.r>1);
    for(let y=0;y<E.PH;y++)for(let x=0;x<W;x++){const o=(y*W+x)*4;if(!d[o+3])continue;let best=0,bc=null;
      for(const L of Ls){const f=(1-Math.hypot(x-L.px,y-L.py)/L.r)*L.i;if(f>best){best=f;bc=L.c}}
      if(best>0&&BAYER[y&3][x&3]/16<best){d[o]=d[o]*.4+bc[0]*.6;d[o+1]=d[o+1]*.4+bc[1]*.6;d[o+2]=d[o+2]*.4+bc[2]*.6}}
    lb.putImageData(img,0,0)}
  b.drawImage(layer,0,0);
};
// ---------- piso mojado: refleja todo lo que está sobre el horizonte, con dither, oscurecido y ondulado ----------
// extra(): dibuja cosas que existen SOLO en el reflejo (para trucos de historia).
E.wetFloor=function(gy,{strength=.55,maxD,amp=1,extra,extraLevel=1}={}){
  gy=Math.round(gy);if(gy<=1||gy>=E.PH-1)return;maxD=maxD||E.PH*.4;
  const M=b.getImageData(0,0,E.PW,E.PH),m=M.data,src=new Uint8ClampedArray(m),W=E.PW;let X=null;
  if(extra){lb.clearRect(0,0,E.PW,E.PH);const keep=b;b=lb;extra();b=keep;
    if(extraLevel<1)for(let y=0;y<E.PH;y++)for(let x=0;x<E.PW;x++)if(BAYER[y&3][x&3]/16>=extraLevel)lb.clearRect(x,y,1,1);
    X=lb.getImageData(0,0,E.PW,E.PH).data}
  for(let y=gy+1;y<E.PH;y++){const dd=y-gy,sy=gy-dd;if(sy<0)break;const lv=strength*(1-dd/maxD);if(lv<=0)continue;
    const xw=Math.round(Math.sin(y*.9+Math.floor(E.t*12)*.8)*amp*Math.min(1,dd/8));
    for(let x=0;x<W;x++){if(BAYER[y&3][x&3]/16>=lv)continue;const sx=x+xw;if(sx<0||sx>=W)continue;const si=(sy*W+sx)*4,o=(y*W+x)*4;
      let r=src[si],g=src[si+1],bl=src[si+2];if(X&&X[si+3]){r=X[si];g=X[si+1];bl=X[si+2]}
      m[o]=r*.55+m[o]*.25;m[o+1]=g*.55+m[o+1]*.25;m[o+2]=bl*.6+m[o+2]*.3}}
  b.putImageData(M,0,0);
};
// rayo de energía: núcleo blanco, capas de color, ondula a 24 fps
E.beam=function(a,c,w,col,lite){const f=Math.floor(E.t*24),dx=c[0]-a[0],dy=c[1]-a[1],d=Math.hypot(dx,dy)||1,nx=-dy/d,ny=dx/d;
  for(const[ww,cc]of[[w,col],[w*.6,lite],[w*.25,'#ffffff']]){const n=8;let px=a[0],py=a[1];
    for(let i=1;i<=n;i++){const q=i/n,j=Math.sin(f*1.7+i*2.1)*w*.18*(i<n?1:0),qx=a[0]+dx*q+nx*j,qy=a[1]+dy*q+ny*j;line(px,py,qx,qy,Math.max(1,ww),cc);px=qx;py=qy}}};
Object.assign(E,{figure,dissolve,ditherEllipse,shadow});

// ---------- efectos ----------
E.sky=function(bands,moon){
  const gy=Math.max(4,Math.min(E.PH,toPx(0,0)[1])),bh=gy/bands.length;
  bands.forEach((c,i)=>{R(0,i*bh,E.PW,bh+1,c);if(i<bands.length-1)ditherFill(.5,bands[i+1],0,(i+1)*bh-2,E.PW,(i+1)*bh)});
  if(moon){const{x:mx,y:my,r:mr}=moon;ditherDisc(mx,my,mr*1.7,'#5a1028',.5);
    disc(mx,my,mr,'#d8243a');disc(mx+mr*.22,my-mr*.08,mr*.8,'#a81830');disc(mx+mr*.38,my-mr*.12,mr*.55,'#7e1026')}
};
E.embers=function(x,y0,pal,n,power,seed){
  for(let i=0;i<n;i++){if(hash(i*9+seed)>power)continue;
    const ph=(E.t*(.6+hash(i+seed)*.8)+hash(i*3+seed))%1;
    const[px,py]=toPx(x+(hash(i*5+seed)-.5)*50+Math.sin(Math.floor(E.t*12)*.5+i)*4*ph,y0-ph*150);
    R(px,py,1,ph<.3?2:1,ph<.25?'#ffffff':ph<.6?pal.aura:pal.dark)}
};
E.aura=(x,y,pal,power,r=60)=>{if(power<=0)return;const[px,py]=toPx(x,y);ditherDisc(px,py,r*E.cam.k,pal.dark,power*.9)};
// lluvia con loop perfecto: la velocidad recorre la altura un número entero de veces por loop
E.rain=function(slant=.25,density=380){
  const n=Math.round(E.PW*E.PH/density),L=scene.loop;
  for(let i=0;i<n;i++){const v=E.PH*(6+Math.floor(hash(i)*4))/L,y=(hash(i*3)*E.PH+E.t*v)%E.PH,x=((hash(i*7)*E.PW*1.6-y*slant)%E.PW+E.PW)%E.PW;
    R(x,y,1,hash(i+5)>.5?4:3,hash(i+9)>.7?'#9a94c8':'#4a4470')}
};
E.focusLines=function(col,n,thick,fps=12,cx=E.PW/2,cy=E.PH*.5){
  const f=Math.floor(E.t*fps),Rr=Math.hypot(E.PW,E.PH);
  for(let i=0;i<n;i++){const a=hash(f*31+i)*Math.PI*2,r0=Math.min(E.PW,E.PH)*(.25+hash(f*3+i)*.25);
    line(cx+Math.cos(a)*r0,cy+Math.sin(a)*r0,cx+Math.cos(a)*Rr,cy+Math.sin(a)*Rr,hash(f+i*3)>.6?thick:1,col)}
};
E.speedLines=function(angle=0,n=28,col='#c8c0e8'){const f=Math.floor(E.t*12),ca=Math.cos(angle),sa=Math.sin(angle);
  for(let i=0;i<n;i++){const x=hash(f*17+i)*E.PW,y=hash(f*5+i)*E.PH,l=Math.max(E.PW,E.PH)*(.12+hash(f+i)*.3);line(x,y,x-ca*l,y-sa*l,1,col)}};
E.clash=function(cxW,cyW,t0,t1,groundX){
  const k=E.seg(t0,t1),f=Math.floor(E.t*24),[cx,cy]=toPx(cxW,cyW),K=E.cam.k;
  ditherDisc(cx-10*K,cy+10*K,100*K,'#1f5fa8',.8);ditherDisc(cx+10*K,cy-10*K,100*K,'#8a1024',.8);
  for(let i=0;i<3;i++){const r=((E.t-t0)*150+i*90)%270;if(r/270<.8)ring(cx,cy,r*K,r*K*.7,r/270<.4?'#ffffff':'#a8a0c8')}
  for(let j=0;j<10;j++){const hs=f*13+j,a=hash(hs)*Math.PI*2,len=(60+hash(hs+1)*150)*K,col=j%2?'#4fb4ff':'#ff2e45';let px=cx,py=cy;
    for(let s2=1;s2<=6;s2++){const r=len*s2/6,jit=(hash(hs+s2*7)-.5)*24*K,nx=cx+Math.cos(a)*r-Math.sin(a)*jit,ny=cy+Math.sin(a)*r+Math.cos(a)*jit;
      line(px,py,nx,ny,s2<3?2:1,s2<2?'#ffffff':col);px=nx;py=ny}}
  const core=(9+Math.sin(f*1.05)*3+k*6)*K;disc(cx,cy,core+2,'#c8ecff');disc(cx,cy,core,'#ffffff');
  const dt=E.t-t0;
  for(let i=0;i<40;i++){const x0=groundX+(hash(i)-.5)*100,vx=(hash(i+9)-.5)*110,vy=40+hash(i+3)*120,x=x0+vx*dt,y=-(vy*dt-24*dt*dt);if(y>2)continue;
    const[px,py]=toPx(x,y),sz=1+Math.round(hash(i+7)*2*Math.min(K,2));R(px,py,sz,sz,'#120c1a');if(Math.floor(E.t*12+i)%3===0)R(px,py,1,1,'#ff9a5a')}
  E.cracks(groundX,ease(k*2),6,60);
};
E.cracks=function(x0,k,n,maxLen){const K=E.cam.k;
  for(let i=0;i<n;i++){const dir=i<n/2?-1:1,len=k*(maxLen*.5+hash(i)*maxLen);let[px,py]=toPx(x0,0);
    for(let s2=1;s2<=5;s2++){const[nx,ny]=toPx(x0+dir*len*s2/5,(hash(i*9+s2)-.2)*10*s2/5);line(px,py,nx,ny,K>2?2:1,'#e8e0ff');px=nx;py=ny}}};
E.feetCut=function(x0,t0,t1){const k=E.seg(t0,t1),K=E.cam.k;
  for(let i=0;i<14;i++){const a=(i/14)*Math.PI-Math.PI,len=(20+hash(i)*50)*ease(k*3);let[px,py]=toPx(x0,0);
    for(let s2=1;s2<=4;s2++){const[nx,ny]=toPx(x0+Math.cos(a)*len*s2/4*1.6,Math.abs(Math.sin(a))*len*s2/4*.25);line(px,py,nx,ny,2,s2<2?'#ffffff':'#c8c0e8');px=nx;py=ny}}
  for(let i=0;i<18;i++){const dt=(E.t-t0)*2,x=x0+(hash(i+30)-.5)*70+(hash(i+40)-.5)*50*dt,y=-(hash(i+50)*80*dt-60*dt*dt);
    if(y>1)continue;const[px,py]=toPx(x,y),sz=Math.round((1+hash(i)*3)*K*.5);R(px,py,sz,sz,'#1a1226');R(px,py,sz,1,'#5a4a7a')}};
// chispas de derrape: salen de los pies hacia atrás
E.skidSparks=function(x,dir,power,seed=7){if(power<=0)return;const f=Math.floor(E.t*24);
  for(let i=0;i<16;i++){if(hash(f*3+i+seed)>power)continue;const l=8+hash(f+i)*30,a=-hash(f*7+i)*.6;
    const[px,py]=toPx(x,0);line(px,py,px+(-dir)*Math.cos(a)*l*E.cam.k,py+Math.sin(a)*l*E.cam.k,1,hash(i)>.5?'#ffd27a':'#ffffff')}};
// impact frames: blanco/negro/rojo cada 2 cuadros a 24 fps
E.impact=function(t0,cxW,cyW,chars,kanji='衝'){
  const f=Math.floor((E.t-t0)*24),m=Math.floor(f/2)%3;
  const bg=['#f4f1ec','#05040a','#c4102a'][m],ink=['#05040a','#f4f1ec','#05040a'][m];
  R(0,0,E.PW,E.PH,bg);const[cx,cy]=toPx(cxW,cyW);E.focusLines(ink,70,2,24,cx,cy);
  const gy=toPx(0,0)[1];R(0,gy,E.PW,E.PH-gy,ink);
  for(const ch of chars)figure(ch,'ink',ink);
  for(let i=0;i<16;i+=2){const a=i/16*Math.PI*2+f,r=(22+hash(f*5+i)*16)*E.cam.k;line(cx,cy,cx+Math.cos(a)*r,cy+Math.sin(a)*r,2,bg)}
  disc(cx,cy,4,bg);
  if(m!==1)pixText(kanji,E.PW*.5,E.PH*(Math.floor(f/2)%2?.78:.24),Math.min(E.PW,E.PH)*.42,ink);
};
// primer plano de ojos: con open=0 el cuadro es idéntico al inicial → sirve para cerrar loops
const EYE=["..kkkkkkkkkkk...",".kwwwbbbbbwwwkk.","kwwbbBhhbbbwwwwk","kwwbBBhdddbbwwk.","kwwbbBBddbbbwk..",".kkwbbbbbbbkk...","...kkkkkkkk....."];
E.closeup=function(open,flare,look,reg){
  reg=reg||{x:0,y:0,w:E.PW,h:E.PH};
  const PW=reg.w,PH=reg.h,f=Math.floor(E.t*12);
  b.save();b.beginPath();b.rect(reg.x,reg.y,reg.w,reg.h);b.clip();
  R(reg.x,reg.y,PW,PH,'#020105');
  const cx=reg.x+PW/2,cy=reg.y+PH*.5+(look.dy||0)*PH;
  const fw=Math.round(Math.min(PW*.92,PH*.95)*.5),fh=Math.round(fw*1.4),sc=Math.max(1,Math.floor(fw*.82/18));
  for(let y=-fh;y<=fh*.7;y++){const n=y/fh,w=Math.round(fw*Math.sqrt(Math.max(0,1-Math.max(0,n/.7)**2*.85)));R(cx-w-1,cy+y,2*w+2,1,look.edge);R(cx-w,cy+y,2*w,1,look.frame)}
  for(let y=-Math.round(fh*.32);y<=fh*.62;y++){const n=y/(fh*.62),w=Math.round(fw*.8*Math.sqrt(Math.max(0,1-Math.max(0,n)**2)));R(cx-w,cy+y,2*w,1,'#0b0816');R(cx+w-1,cy+y,1,1,look.rim)}
  R(cx-fw*.8,cy-fh*.32,fw*1.6,Math.max(2,sc),look.frame);
  if(look.bangs)for(let i=0;i<7;i++){const x=cx-fw*.75+i*fw*.25,len=fh*(.18+hash(i+3)*.14);line(x-4,cy-fh*.34,x+2,cy-fh*.34+len,Math.max(2,sc*1.5),look.frame)}
  const EC={k:'#000',w:'#e6dcd8',b:look.iris[0],B:look.iris[1],d:'#08020a',h:'#ffffff'};
  for(const sx of[-1,1]){
    const ex=cx+sx*fw*.45,ey=cy;
    if(open<.35){R(ex-8*sc,ey,16*sc,sc,'#000');R(ex-7*sc,ey,14*sc,1,look.iris[0]);continue}
    const rows=open<.7?[2,3,4]:[0,1,2,3,4,5,6];
    rows.forEach(r=>{const row=EYE[r];for(let c=0;c<row.length;c++){const ch=row[c];if(ch==='.')continue;
      const xx=sx>0?c:row.length-1-c;R(ex-8*sc+xx*sc,ey-3*sc+r*sc,sc,sc,EC[ch])}});
    line(ex-9*sc,ey-6*sc,ex+8*sc,ey-7*sc,sc,'#000');
  }
  if(flare>0){const len=PW*1.4*flare;R(cx-len/3,cy-sc*2-1,len*2/3,3,look.flare);R(cx-len/2,cy-sc*2,len,1,'#ffffff')}
  for(let i=0;i<30;i++)R(reg.x+hash(f+i*7)*PW,reg.y+hash(f*2+i*3)*PH,1,1,'#2a2440');
  b.restore();
};

// ---------- sonido sintetizado ----------
const A={ctx:null,on:false};E.audio=A;
function initAudio(){
  const ac=A.ctx=new(window.AudioContext||window.webkitAudioContext)();
  A.master=ac.createGain();A.master.gain.value=0;const comp=ac.createDynamicsCompressor();A.master.connect(comp);comp.connect(ac.destination);
  A.noiseBuf=ac.createBuffer(1,ac.sampleRate*2,ac.sampleRate);const d=A.noiseBuf.getChannelData(0);for(let i=0;i<d.length;i++)d[i]=Math.random()*2-1;
  A.drone=ac.createGain();A.drone.gain.value=0;const lp=ac.createBiquadFilter();lp.type='lowpass';lp.frequency.value=320;
  for(const f of[55,55.6,82.4]){const o=ac.createOscillator();o.type='sawtooth';o.frequency.value=f;o.connect(lp);o.start()}
  lp.connect(A.drone);A.drone.connect(A.master);
  const amb=(type,freq,q)=>{const n=ac.createBufferSource();n.buffer=A.noiseBuf;n.loop=true;const fl=ac.createBiquadFilter();fl.type=type;fl.frequency.value=freq;fl.Q.value=q;
    const g=ac.createGain();g.gain.value=0;n.connect(fl);fl.connect(g);g.connect(A.master);n.start();return{g,fl}};
  A.rain=amb('highpass',1200,.7);A.wind=amb('bandpass',420,.9);
}
E.noise=function(dur,type,f0,f1,vol,q=1,swell=false){const ac=A.ctx;if(!ac)return;
  const n=ac.createBufferSource();n.buffer=A.noiseBuf;n.loop=true;const fl=ac.createBiquadFilter();fl.type=type;fl.Q.value=q;
  const now=ac.currentTime;fl.frequency.setValueAtTime(f0,now);fl.frequency.exponentialRampToValueAtTime(f1,now+dur);
  const g=ac.createGain();
  if(swell){g.gain.setValueAtTime(.001,now);g.gain.exponentialRampToValueAtTime(vol,now+dur*.95);g.gain.linearRampToValueAtTime(0,now+dur)}
  else{g.gain.setValueAtTime(vol,now);g.gain.exponentialRampToValueAtTime(.001,now+dur)}
  n.connect(fl);fl.connect(g);g.connect(A.master);n.start(now);n.stop(now+dur+.02)};
E.tone=function(dur,type,f0,f1,vol){const ac=A.ctx;if(!ac)return;
  const o=ac.createOscillator();o.type=type;const now=ac.currentTime;o.frequency.setValueAtTime(f0,now);o.frequency.exponentialRampToValueAtTime(f1,now+dur);
  const g=ac.createGain();g.gain.setValueAtTime(.0001,now);g.gain.exponentialRampToValueAtTime(vol,now+.005);g.gain.exponentialRampToValueAtTime(.001,now+dur);
  o.connect(g);g.connect(A.master);o.start(now);o.stop(now+dur+.05)};
E.sfx={ // recetas reutilizables
  boom:()=>{E.tone(.9,'sine',150,32,1);E.noise(.45,'lowpass',5000,180,.9);E.tone(.18,'square',95,40,.35)},
  bigBoom:()=>{E.tone(1.3,'sine',125,28,1);E.noise(1,'lowpass',3200,70,.85)},
  whoosh:(d=.5)=>E.noise(d,'bandpass',2200,280,.6,.8),
  inhale:(d=.33)=>E.noise(d,'bandpass',300,2600,.35,1,true),
  rise:(d=.35)=>E.noise(d,'highpass',700,6500,.35,1,true),
  crack:()=>{E.noise(.4,'lowpass',1600,90,.8);E.tone(.35,'sine',95,38,.7)},
  slash:()=>{E.tone(.7,'triangle',2400,1900,.3);E.tone(.7,'triangle',3150,2600,.16);E.noise(.15,'highpass',5000,9000,.45)},
  thud:()=>{E.tone(.28,'sine',115,45,.75);E.noise(.22,'lowpass',900,100,.45)},
  crackle:()=>E.noise(.05,'highpass',2500+Math.random()*3000,7000,.22),
  scrape:(d=.6)=>{E.noise(d,'bandpass',3500,900,.5,3);E.noise(d*.8,'lowpass',600,120,.4)},
  flap:()=>{for(let i=0;i<3;i++)setTimeout(()=>E.noise(.07,'lowpass',900,300,.35),i*55)},
  vanish:()=>E.noise(.35,'highpass',4000,900,.35),
  sting:(f=1320)=>{E.tone(.9,'triangle',f,f*1.33,.22);E.tone(.9,'sine',f*1.5,f*2,.12);E.noise(.4,'highpass',6000,9000,.2)},
  tap:()=>{E.noise(.09,'bandpass',1800,600,.6,2);E.tone(.12,'square',220,90,.25);E.tone(.2,'sine',120,60,.5)},
  swish:()=>E.noise(.22,'bandpass',900,3500,.4,1.5),
  thunder:()=>{E.noise(1.6,'lowpass',2500,60,.9);E.tone(1.2,'sine',60,30,.6)},
  heartbeat:()=>{E.tone(.18,'sine',70,40,.9);setTimeout(()=>E.tone(.16,'sine',62,38,.7),190)}
};
let lastCrackle=-1;
function audioTick(prev,cur,s){
  if(!A.ctx||!A.on)return;const now=A.ctx.currentTime,run=E.running,amb=scene.ambience?scene.ambience(s):{};
  A.drone.gain.setTargetAtTime(run?(scene.drone?scene.drone(s):0):0,now,s.freeze!=null?.008:.06);
  A.rain.g.gain.setTargetAtTime(run?(amb.rain??0):0,now,.03);
  A.wind.g.gain.setTargetAtTime(run?(amb.wind??0):0,now,.08);
  if(amb.windFreq)A.wind.fl.frequency.setTargetAtTime(amb.windFreq,now,.1);
  if(!run)return;
  for(const[te,fn]of scene.sfx||[]){const hit=cur>=prev?(te>prev&&te<=cur):(te>prev||te<=cur);if(hit)fn()}
  if(scene.crackle&&scene.crackle(s)&&Math.floor(cur*24)!==lastCrackle){lastCrackle=Math.floor(cur*24);if(hash(lastCrackle)>.55)E.sfx.crackle()}
}

// ---------- runtime ----------
let curSub=null,curHook=null;
function overlays(){
  const el=scene.el;
  const s=(scene.subs||[]).find(([a,c])=>E.t>=a&&E.t<c),sk=s?s[2]:'';
  if(sk!==curSub){curSub=sk;el.sub.innerHTML=s?`${s[2]}<small>${s[3]}</small>`:''}
  const h=(scene.hook||[]).find(([a,c])=>E.t>=a&&E.t<c),blink=h&&Math.floor(E.t*6)%5!==4,hk=h&&blink?h[2]:'';
  if(el.hook&&hk!==curHook){curHook=hk;el.hook.innerHTML=hk?`${h[2]}<small>${h[3]}</small>`:''}
}
function frame(){
  if(!E.PW)return null;
  const s=scene.state(E.t);b.clearRect(0,0,E.PW,E.PH);
  const realT=E.t;if(s.freeze!=null)E.t=s.freeze; // hit-stop: el mundo se congela
  setCam(s.cam||{});
  const T=Math.floor(E.t*12)/12; // la física también va en twos
  if(s.freeze==null){const L=scene.loop,ps=scene.state(((E.t-1/12)%L+L)%L);E.prevChars=Object.fromEntries((ps.chars||[]).map(c=>[c.id,c]))}else E.prevChars=null;
  if(E._simT!==T){E.chainCache=simulate(T);E._simT=T}
  scene.render(s);
  if(E.cam.rot)rotateBuffer(E.cam.rot);
  E.t=realT;
  if(scene.post)scene.post(s);
  ctx.imageSmoothingEnabled=false;ctx.clearRect(0,0,cv.width,cv.height);ctx.drawImage(buf,0,0,E.PW*E.PX,E.PH*E.PX);
  overlays();return s;
}
function resize(){
  const r=stageEl.getBoundingClientRect(),dpr=Math.min(devicePixelRatio||1,3);
  const Wd=Math.round(r.width*dpr),Hd=Math.round(r.height*dpr);cv.width=Wd;cv.height=Hd;
  E.PX=Math.max(1,Math.round(Math.min(Wd,Hd)/150));E.PW=Math.ceil(Wd/E.PX);E.PH=Math.ceil(Hd/E.PX);
  buf.width=layer.width=E.PW;buf.height=layer.height=E.PH;
  E.u=scene.vertical?E.PW/220:E.PH/420;E._simT=null;frame();
}
E.start=function(sc){
  scene=sc;stageEl=sc.el.stage;cv=sc.el.canvas;ctx=cv.getContext('2d');
  buf=document.createElement('canvas');b=buf.getContext('2d');layer=document.createElement('canvas');lb=layer.getContext('2d');
  const btn=sc.el.toggle,setRun=v=>{E.running=v;btn.textContent=v?'❚❚ PAUSA':'▶ PLAY';last=0};
  btn.onclick=()=>setRun(!E.running);stageEl.onclick=()=>setRun(!E.running);
  if(sc.el.sound)sc.el.sound.onclick=e=>{e.stopPropagation();if(!A.ctx)initAudio();if(A.ctx.state==='suspended')A.ctx.resume();
    A.on=!A.on;A.master.gain.setTargetAtTime(A.on?.7:0,A.ctx.currentTime,.05);
    sc.el.sound.setAttribute('aria-pressed',A.on);sc.el.sound.textContent=A.on?'♪ SONIDO ACTIVADO':'♪ ACTIVAR SONIDO'};
  let last=0;
  const loop=now=>{const dt=Math.min(.05,(now-(last||now))/1000);last=now;const prev=E.t;if(E.running)E.t=(E.t+dt)%sc.loop;
    const s=E.running?frame():sc.state(E.t);if(s)audioTick(prev,E.t,s);requestAnimationFrame(loop)};
  new ResizeObserver(resize).observe(stageEl);
  document.fonts&&document.fonts.ready.then(frame);
  if(matchMedia('(prefers-reduced-motion: reduce)').matches){E.t=sc.reducedT??0;setRun(false)}
  resize();requestAnimationFrame(loop);
  window.__seek=v=>{E.t=v;return frame()};
};
window.Sakuga=E;
})();
