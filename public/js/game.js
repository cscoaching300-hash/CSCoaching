// --- Audio ---
let audioOn = true; const soundBtn=document.getElementById('soundBtn');
let acx=null; function ensureAudio(){ if(!acx) acx=new (window.AudioContext||window.webkitAudioContext)(); }
function beep(freq=440,dur=0.06,vol=0.08){ if(!audioOn) return; ensureAudio(); const o=acx.createOscillator(); const g=acx.createGain(); o.type='triangle'; o.frequency.value=freq; g.gain.value=vol; o.connect(g); g.connect(acx.destination); const t=acx.currentTime; o.start(t); o.stop(t+dur); }
function thud(dur=0.06,vol=0.09){ if(!audioOn) return; ensureAudio(); const o=acx.createOscillator(); const g=acx.createGain(); o.type='sine'; o.frequency.setValueAtTime(180,acx.currentTime); o.frequency.exponentialRampToValueAtTime(90,acx.currentTime+dur); g.gain.value=vol; o.connect(g); g.connect(acx.destination); const t=acx.currentTime; o.start(t); o.stop(t+dur); }

// --- Core state ---
const canvas=document.getElementById('game'); const ctx=canvas.getContext('2d');
const hudFrame=document.getElementById('hudFrame'); const hudRoll=document.getElementById('hudRoll'); const hudTotal=document.getElementById('hudTotal');
const framesRow=document.getElementById('framesRow'); const newGameBtn=document.getElementById('newGameBtn');
soundBtn?.addEventListener('click',()=>{ audioOn=!audioOn; soundBtn.textContent=`🔊 Sound: ${audioOn?'On':'Off'}`; });

const world={ w:canvas.width, h:canvas.height };
const spacing=34; const pinR=10; let laneCenter=world.w/2; let laneLeft=0, laneRight=world.w;
function computeLaneBounds(){ const rackLeft=laneCenter-(3*spacing)/2; const rackRight=laneCenter+(3*spacing)/2; laneLeft=Math.round(rackLeft-pinR); laneRight=Math.round(rackRight+pinR); }

const ballBase={ r:12, speed:6.2 }; const HOOK_POWER=0.034; // +30%
let ball={ x:laneCenter, y:world.h-60, r:ballBase.r, dx:0, dy:0, rolling:false, gutter:false, lockHook:false, firstContact:false, firstAngleDeg:0 };
let hookAccel=0; // live A/D shaping until first pin contact

let pins=[]; let pinsHitThisRoll=0; let firstHitThisRoll=false;

// --- Setup pins ---
function setupPins(fullReset=true){
  if(!fullReset) return; // keep any standing pins (shouldn't be used for shot2 anymore)
  pins=[]; const headY=200; let id=0;
  for(let row=0; row<4; row++){
    for(let col=0; col<=row; col++){
      const x=laneCenter-(row*spacing)/2+col*spacing; const y=headY-row*spacing;
      const label=(row===0?1:(row===1?[2,3][col]:(row===2?[4,5,6][col]:[7,8,9,10][col])));
      pins.push({x,y,r:pinR,hit:false,id:id++,label,vx:0,vy:0,alpha:1});
    }
  }
}
// remove knocked pins so shot 2 is visually clear
function clearFallenPins(){ pins=pins.filter(p=>!p.hit); }

// --- Drawing ---
function drawLane(){
  ctx.fillStyle='#0f0f10'; ctx.fillRect(0,0,world.w,world.h);
  // gutters tight to 7 & 10
  ctx.fillStyle='#151515'; ctx.fillRect(0,0,laneLeft,world.h); ctx.fillRect(laneRight,0,world.w-laneRight,world.h);
  // lane
  ctx.fillStyle='#121212'; ctx.fillRect(laneLeft,70,laneRight-laneLeft,world.h-120);
  // arrows
  ctx.fillStyle='rgba(255,255,255,.12)'; const ay=world.h-210, aw=10, ah=6, arrows=5, margin=28; const step=(laneRight-laneLeft-margin*2)/(arrows-1);
  for(let i=0;i<arrows;i++){ const ax=laneLeft+margin+i*step; ctx.beginPath(); ctx.moveTo(ax,ay); ctx.lineTo(ax+aw,ay+ah); ctx.lineTo(ax-aw,ay+ah); ctx.closePath(); ctx.fill(); }
  // foul line
  ctx.fillStyle='rgba(224,55,47,.45)'; ctx.fillRect(laneLeft,80,laneRight-laneLeft,2);
}
function drawBall(){ ctx.beginPath(); ctx.arc(ball.x,ball.y,ball.r,0,Math.PI*2); ctx.fillStyle='rgba(224,55,47,0.95)'; ctx.fill(); ctx.fillStyle='#111'; ctx.beginPath(); ctx.arc(ball.x-3,ball.y-3,1.8,0,Math.PI*2); ctx.fill(); ctx.beginPath(); ctx.arc(ball.x+2.5,ball.y-4,1.8,0,Math.PI*2); ctx.fill(); ctx.beginPath(); ctx.arc(ball.x,ball.y+1,1.8,0,Math.PI*2); ctx.fill(); }
function drawPins(){ pins.forEach(p=>{ if(!p.hit){ ctx.beginPath(); ctx.arc(p.x,p.y,p.r,0,Math.PI*2); ctx.fillStyle='#fff'; ctx.fill(); ctx.strokeStyle='#e0372f'; ctx.lineWidth=2; ctx.stroke(); } else if(p.alpha>0){ ctx.save(); ctx.globalAlpha=p.alpha; ctx.beginPath(); ctx.arc(p.x,p.y,p.r,0,Math.PI*2); ctx.fillStyle='#d9d9d9'; ctx.fill(); ctx.restore(); } }); }

// --- Physics ---
function updatePinsPhysics(){
  // integrate motion & damp
  pins.forEach(p=>{ if(p.hit){ p.x+=p.vx; p.y+=p.vy; p.vx*=0.987; p.vy*=0.987; if(p.y<40||p.y>340||p.x<laneLeft-20||p.x>laneRight+20){ p.alpha-=0.05; } if(p.alpha<0) p.alpha=0; } });
  // pin-pin collisions
  for(let i=0;i<pins.length;i++){
    for(let j=i+1;j<pins.length;j++){
      const a=pins[i], b=pins[j]; if(!a.hit && !b.hit) continue; const dx=b.x-a.x, dy=b.y-a.y; const dist=Math.hypot(dx,dy); const minDist=a.r+b.r; if(dist<minDist && dist>0){ const nx=dx/dist, ny=dy/dist; const overlap=minDist-dist; a.x-=nx*overlap/2; a.y-=ny*overlap/2; b.x+=nx*overlap/2; b.y+=ny*overlap/2; const dvx=b.vx-a.vx, dvy=b.vy-a.vy; const rel=(dvx*nx+dvy*ny); if(rel<0){ const impulse=-rel*0.9; a.vx-=nx*impulse; a.vy-=ny*impulse; b.vx+=nx*impulse; b.vy+=ny*impulse; if(audioOn){ const pitch=220+Math.min(400,Math.abs(rel)*220); beep(pitch,0.05,0.07); thud(0.06); } } if(!a.hit && (Math.abs(b.vx)+Math.abs(b.vy))>0.28){ a.hit=true; pinsHitThisRoll++; } if(!b.hit && (Math.abs(a.vx)+Math.abs(a.vy))>0.28){ b.hit=true; pinsHitThisRoll++; } }
    }
  }
}

function collideBallPins(){
  pins.forEach(p=>{
    if(p.hit) return; const dx=p.x-ball.x, dy=p.y-ball.y; const dist=Math.hypot(dx,dy); const minDist=ball.r+p.r; if(dist<minDist && !ball.gutter){
      if(!ball.firstContact){ ball.firstContact=true; ball.lockHook=true; ball.firstAngleDeg=(Math.atan2(ball.dy,ball.dx)*180/Math.PI); maybePocketCascade(p); }
      p.hit=true; pinsHitThisRoll++; if(!firstHitThisRoll){ beep(520,0.05,0.05); thud(0.08); firstHitThisRoll=true; }
      const nx=dx/(dist||1e-6), ny=dy/(dist||1e-6); const impact=Math.hypot(ball.dx,ball.dy); const jitter=(Math.random()-0.5)*1.0;
      p.vx=nx*(impact*0.726)+ball.dx*0.20+jitter; p.vy=ny*(impact*0.726)+ball.dy*0.20+jitter;
      const vdotn=ball.dx*nx+ball.dy*ny; ball.dx-=nx*vdotn*0.315; ball.dy-=ny*vdotn*0.315; ball.dx*=0.985; ball.dy*=0.985;
      const overlap=minDist-dist; ball.x-=nx*overlap*0.4; ball.y-=ny*overlap*0.4; p.x+=nx*overlap*0.6; p.y+=ny*overlap*0.6;
    }
  });
}

// cascade for pocket entry
function maybePocketCascade(firstPin){
  const ang=ball.firstAngleDeg; const pocketish=(ang>-12 && ang<-1); if(!pocketish) return; const lbl=firstPin.label; if(lbl!==1 && lbl!==3) return;
  const byLabel=n=>pins.find(pp=>!pp.hit && pp.label===n);
  const knock=(from,to,delay=40)=>{ setTimeout(()=>{ const a=byLabel(to); const b=byLabel(from); if(!a||a.hit) return; a.hit=true; pinsHitThisRoll++; if(b){ const vx=a.x-b.x, vy=a.y-b.y, d=Math.hypot(vx,vy)||1; a.vx=(vx/d)*3.52; a.vy=(vy/d)*3.52; } },delay); };
  if(lbl===1) knock(1,3,10); knock(3,5,80); knock(5,9,140); knock(1,2,40); knock(2,4,100); knock(4,7,180); knock(3,6,70); knock(6,10,150);
}

function stepBall(){
  if(!ball.rolling) return; if(ball.y<world.h-140 && !ball.lockHook){ ball.dx+=hookAccel; }
  ball.x+=ball.dx; ball.y+=ball.dy;
  if(ball.x<laneLeft+ball.r){ ball.x=laneLeft-ball.r*0.2; ball.gutter=true; ball.dx=0; }
  if(ball.x>laneRight-ball.r){ ball.x=laneRight+ball.r*0.2; ball.gutter=true; ball.dx=0; }
  ball.dx*=0.997; ball.dy*=0.9985; if(!ball.gutter) collideBallPins(); updatePinsPhysics();
  if(ball.y<60 || Math.abs(ball.dx)+Math.abs(ball.dy)<0.22){ endRoll(); }
}

// --- Scoring & Game Flow ---
let frames=Array.from({length:10},()=>({rolls:[], total:null})); let curFrame=0; let rollInFrame=1; let gameOver=false;

function resetBall(){ ball.x=laneCenter; ball.y=world.h-60; ball.dx=0; ball.dy=0; hookAccel=0; ball.gutter=false; ball.rolling=false; ball.lockHook=false; ball.firstContact=false; ball.firstAngleDeg=0; firstHitThisRoll=false; }

function endRoll(){ ball.rolling=false; const knocked=pinsHitThisRoll; pinsHitThisRoll=0; const wasFrame=curFrame; const prevLen=frames[curFrame]?.rolls.length||0; applyRoll(knocked); const stayed=!gameOver && curFrame===wasFrame && frames[curFrame].rolls.length===prevLen+1 && (wasFrame<9); if(stayed){ resetBall(); } updateHUD(); }

function applyRoll(pinsDown){
  if(gameOver) return; const f=frames[curFrame]; f.rolls.push(pinsDown);
  if(curFrame===9){
    const r=f.rolls; const first=r[0]||0; const second=r[1]||0; const sum2=first+second;
    if(r.length===1){ if(first===10){ setupPins(true); flashText('Re-rack: strike!'); } else { clearFallenPins(); } resetBall(); scoreAll(); return; }
    if(r.length===2){ if(first===10 || sum2===10){ setupPins(true); flashText(first===10?'Re-rack: bonus ball':'Re-rack: spare bonus'); resetBall(); scoreAll(); return; } scoreAll(); gameOver=true; return; }
    if(r.length===3){ scoreAll(); gameOver=true; return; }
  }
  if(f.rolls.length===1){ if(pinsDown===10){ beep(660,0.08,0.06); advanceFrame(); } else { rollInFrame=2; clearFallenPins(); resetBall(); } }
  else { if((f.rolls[0]||0)+(f.rolls[1]||0)===10){ beep(550,0.08,0.06); } advanceFrame(); }
}

function flashText(txt){ ctx.save(); ctx.fillStyle='rgba(0,0,0,0.6)'; ctx.fillRect(laneLeft,120,laneRight-laneLeft,40); ctx.fillStyle='#fff'; ctx.font='bold 14px system-ui'; ctx.textAlign='center'; ctx.fillText(txt,(laneLeft+laneRight)/2,145); ctx.restore(); }
function advanceFrame(){ scoreAll(); curFrame++; rollInFrame=1; setupPins(true); resetBall(); if(curFrame>=10){ gameOver=true; } }

function scoreAll(){
  let cumulative=0;
  for(let i=0;i<10;i++){
    const f=frames[i]; const rolls=f.rolls; let frameScore=null;
    if(i<9){
      if(rolls[0]===10){ const next2=getNextRolls(i,2); if(next2.length===2) frameScore=10+next2[0]+next2[1]; }
      else if((rolls[0]??0)+(rolls[1]??0)===10){ const next1=getNextRolls(i,1); if(next1.length===1) frameScore=10+next1[0]; }
      else if(rolls.length===2){ frameScore=(rolls[0]??0)+(rolls[1]??0); }
    } else {
      if(rolls.length>=2) frameScore=rolls.reduce((a,b)=>a+b,0);
    }
    if(frameScore!==null){ cumulative+=frameScore; f.total=cumulative; } else { f.total=null; }
  }
  hudTotal.textContent=cumulative;

  // 🔔 Hook for optional add-ons (high score, etc.)
  window.dispatchEvent(new CustomEvent('csc:score', { detail: { score: cumulative, gameOver } }));

  renderScorecard();
}
function getNextRolls(frameIndex,count){ const out=[]; for(let j=frameIndex+1;j<10 && out.length<count;j++){ for(const v of frames[j].rolls){ out.push(v); if(out.length===count) break; } } return out; }

function renderScorecard(){
  framesRow.innerHTML='';
  for(let i=0;i<10;i++){
    const f=frames[i]; const box=document.createElement('div'); box.className='frame';
    const title=document.createElement('h4'); title.textContent=`F${i+1}`; box.appendChild(title);
    const r=document.createElement('div'); r.className='rolls'; const rolls=f.rolls.slice();
    if(i<9){
      if(rolls[0]===10){ r.innerHTML=`<span style="color:var(--brand-red)">X</span>`; }
      else {
        const a=rolls[0]??''; const b=(rolls.length>=2)?((a+(rolls[1]??0)===10)?'<span style="color:var(--brand-red)">/</span>':(rolls[1]??'')):'';
        r.innerHTML=`<span>${a}</span>${typeof b==='string'?b:`<span>${b}</span>`}`;
      }
    } else {
      const marks=[]; for(let k=0;k<rolls.length;k++){ const a=rolls[k]; if(a===10) marks.push('<span style="color:var(--brand-red)">X</span>'); else if(k>0 && (a+(rolls[k-1]||0)===10)) marks.push('<span style="color:var(--brand-red)">/</span>'); else marks.push(`<span>${a}</span>`); } r.innerHTML=marks.join('');
    }
    box.appendChild(r); const tot=document.createElement('div'); tot.className='total'; tot.textContent=f.total ?? '—'; box.appendChild(tot); framesRow.appendChild(box);
  }
}

function updateHUD(){ hudFrame.textContent=Math.min(curFrame+1,10); hudRoll.textContent=rollInFrame; }
function newGame(){ frames=Array.from({length:10},()=>({rolls:[], total:null})); curFrame=0; rollInFrame=1; gameOver=false; hudTotal.textContent='0'; computeLaneBounds(); setupPins(true); resetBall(); renderScorecard(); updateHUD(); }

// --- Input ---
canvas.addEventListener('click',(e)=>{ if(gameOver||ball.rolling) return; const rect=canvas.getBoundingClientRect(); const cx=e.clientX-rect.left, cy=e.clientY-rect.top; const angle=Math.atan2(cy-ball.y,cx-ball.x); ball.dx=Math.cos(angle)*ballBase.speed; ball.dy=Math.sin(angle)*ballBase.speed; pinsHitThisRoll=0; firstHitThisRoll=false; ball.gutter=false; ball.lockHook=false; ball.firstContact=false; ball.firstAngleDeg=0; ball.rolling=true; if(curFrame<9 && frames[curFrame].rolls.length===0) setupPins(true); });
const keys=new Set(); document.addEventListener('keydown',(e)=>{ if(e.repeat) return; if(e.key==='a'||e.key==='A'){ keys.add('A'); if(!ball.lockHook) hookAccel=-HOOK_POWER; } if(e.key==='d'||e.key==='D'){ keys.add('D'); if(!ball.lockHook) hookAccel=HOOK_POWER; } });
document.addEventListener('keyup',(e)=>{ if(e.key==='a'||e.key==='A') keys.delete('A'); if(e.key==='d'||e.key==='D') keys.delete('D'); if(!ball.lockHook){ if(!keys.has('A') && !keys.has('D')) hookAccel=0; else if(keys.has('A')&&!keys.has('D')) hookAccel=-HOOK_POWER; else if(keys.has('D')&&!keys.has('A')) hookAccel=HOOK_POWER; } });

// --- Loop ---
function tick(){ drawLane(); drawPins(); drawBall(); stepBall(); requestAnimationFrame(tick); }
newGameBtn.addEventListener('click',newGame); computeLaneBounds(); setupPins(true); resetBall(); renderScorecard(); updateHUD(); requestAnimationFrame(tick);

