/* eslint-disable */
// @ts-nocheck — ported verbatim from the POC: draws architecture and sequence diagrams from model JSON.
"use client";
const el = (t, c, txt) => { const e=document.createElement(t); if(c) e.className=c; if(txt!=null) e.textContent=txt; return e; };
const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const arr=x=>Array.isArray(x)?x:[];
function wrapText(t,max){ const words=String(t||"").split(/\s+/).filter(Boolean); const lines=[]; let cur="";
  words.forEach(w=>{ if((cur+" "+w).trim().length>max && cur){ lines.push(cur); cur=w; } else cur=(cur+" "+w).trim(); }); if(cur) lines.push(cur); return lines.length?lines:[""]; }

/* architecture diagram: layered, drawn from data */
const KIND={client:{f:"var(--paper)",s:"var(--muted)",d:"4 3"},edge:{f:"var(--surface)",s:"var(--muted)"},service:{f:"var(--surface)",s:"var(--ink)"},
  queue:{f:"var(--amber-soft)",s:"var(--amber)",d:"5 3"},cache:{f:"var(--green-soft)",s:"var(--green)"},store:{f:"var(--blue-soft)",s:"var(--blue)"},external:{f:"var(--paper)",s:"var(--muted)",d:"2 3"}};
function archSVG(a){
  const layers=arr(a&&a.layers).map(l=>({name:l.name,nodes:arr(l.nodes).filter(n=>n&&n.id).slice(0,6)})).filter(l=>l.nodes.length).slice(0,6);
  if(!layers.length) return "";
  const NW=150, CW=262, PX=16, TOP=58, VG=26, pos={};
  let H=0;
  layers.forEach((l,i)=>{ let y=TOP; l.nodes.forEach(n=>{ const lines=wrapText(n.label||n.id,19).slice(0,3); const h=lines.length*15+20; pos[n.id]={x:PX+i*CW,y,w:NW,h,lines,kind:KIND[n.kind]?n.kind:"service",col:i}; y+=h+VG; }); H=Math.max(H,y); });
  layers.forEach(l=>{ const ids=l.nodes.map(n=>n.id); const colH=ids.reduce((s,id)=>s+pos[id].h+VG,0)-VG; const off=(H-VG-TOP-colH)/2; ids.forEach(id=>pos[id].y+=off); });
  const W=PX*2+(layers.length-1)*CW+NW, Ht=H+24;
  let edges="", labels="";
  const rects=Object.values(pos).map(p=>({x:p.x-4,y:p.y-4,w:p.w+8,h:p.h+8})), placed=[];
  const bb={x0:0,y0:0,x1:W,y1:Ht}; const grow=(x,y)=>{ bb.x0=Math.min(bb.x0,x); bb.x1=Math.max(bb.x1,x); bb.y0=Math.min(bb.y0,y); bb.y1=Math.max(bb.y1,y); };
  const lastCol=layers.length-1;
  const hit=(r)=>rects.concat(placed).some(q=>r.x<q.x+q.w&&r.x+r.w>q.x&&r.y<q.y+q.h&&r.y+r.h>q.y);
  const colNodes=i=>Object.values(pos).filter(p=>p.col===i);
  const bez=(x1,y1,c1x,c1y,c2x,c2y,x2,y2,t)=>{ const u=1-t; return [u*u*u*x1+3*u*u*t*c1x+3*u*t*t*c2x+t*t*t*x2, u*u*u*y1+3*u*u*t*c1y+3*u*t*t*c2y+t*t*t*y2]; };
  const putLabel=(txt,cands)=>{ const w=txt.length*6.1+10, hh=17; let best=cands[0], found=false;
    const tries=[...cands]; [13,-13,24,-24].forEach(dy=>cands.slice(0,3).forEach(([cx,cy])=>tries.push([cx,cy+dy])));
    for(const [cx,cy] of tries){ const r={x:cx-w/2,y:cy-9,w,h:hh}; if(!hit(r)){ best=[cx,cy]; found=true; break; } }
    placed.push({x:best[0]-w/2,y:best[1]-9,w,h:hh}); grow(best[0]-w/2,best[1]-9); grow(best[0]+w/2,best[1]+9);
    labels+=`<rect x="${best[0]-w/2}" y="${best[1]-9}" width="${w}" height="${hh}" rx="4" fill="var(--paper)"/><text x="${best[0]}" y="${best[1]+4}" text-anchor="middle" font-size="11" fill="var(--muted)">${esc(txt)}</text>`; };
  arr(a.edges).slice(0,18).forEach(e=>{ const s=pos[e.from], t=pos[e.to]; if(!s||!t||s===t) return;
    const fwd=t.col>=s.col, y1=s.y+s.h/2, y2=t.y+t.h/2;
    const x1=t.col===s.col? s.x+s.w : fwd? s.x+s.w : s.x, x2=t.col===s.col? t.x+t.w : fwd? t.x : t.x+t.w;
    const between=[]; for(let i=Math.min(s.col,t.col)+1;i<Math.max(s.col,t.col);i++) between.push(...colNodes(i));
    const dir=x2>=x1?1:-1; let d, cands=[];
    const blocked=between.some(p=>{ const yy=y1+(y2-y1)*((p.x+p.w/2-x1)/((x2-x1)||1)); return yy>p.y-8&&yy<p.y+p.h+8; });
    if(blocked){
      const top=Math.min(...between.map(p=>p.y))-16, bot=Math.max(...between.map(p=>p.y+p.h))+16;
      const lane=(Math.abs(y1-top)+Math.abs(y2-top) <= Math.abs(y1-bot)+Math.abs(y2-bot)) ? top : bot;
      const xa=x1+dir*55, xb=x2-dir*55;
      d=`M${x1},${y1} C${x1+dir*35},${y1} ${x1+dir*25},${lane} ${xa},${lane} L${xb},${lane} C${x2-dir*25},${lane} ${x2-dir*35},${y2} ${x2},${y2}`;
      const mx=(xa+xb)/2; cands=[[mx,lane],[xa+dir*50,lane],[xb-dir*50,lane]];
    } else if(t.col===s.col){
      const L=s.col===lastCol && s.col>0, sx=L?s.x:s.x+s.w, tx=L?t.x:t.x+t.w, k=L?-46:46;
      d=`M${sx},${y1} C${sx+k},${y1} ${tx+k},${y2} ${tx},${y2}`; grow(sx+k,y1); grow(tx+k,y2);
      cands=[[sx+k*0.8,(y1+y2)/2]];
    } else {
      const c1=x1+dir*45, c2=x2-dir*45; d=`M${x1},${y1} C${c1},${y1} ${c2},${y2} ${x2},${y2}`;
      cands=[.5,.35,.65,.22,.78].map(tt=>bez(x1,y1,c1,y1,c2,y2,x2,y2,tt));
    }
    (d.match(/-?\d+(\.\d+)?,-?\d+(\.\d+)?/g)||[]).forEach(pt=>{ const [px,py]=pt.split(",").map(Number); grow(px,py); });
    edges+=`<path d="${d}" fill="none" stroke="var(--muted)" stroke-width="1.4" marker-end="url(#ah)"/>`;
    if(e.label) putLabel(String(e.label).slice(0,20),cands);
  });
  let heads="", nodes="";
  layers.forEach((l,i)=>{ heads+=`<text x="${PX+i*CW+NW/2}" y="18" text-anchor="middle" font-size="12" font-weight="600" fill="var(--muted)">${esc(String(l.name||"").slice(0,24))}</text>`; });
  Object.values(pos).forEach(p=>{ const k=KIND[p.kind];
    nodes+=`<rect x="${p.x}" y="${p.y}" width="${p.w}" height="${p.h}" rx="${p.kind==="store"?4:9}" fill="${k.f}" stroke="${k.s}" stroke-width="1.5" ${k.d?`stroke-dasharray="${k.d}"`:""}/>`;
    if(p.kind==="store") nodes+=`<path d="M${p.x} ${p.y+7} Q${p.x+p.w/2} ${p.y+15} ${p.x+p.w} ${p.y+7}" fill="none" stroke="${k.s}" stroke-width="1.2"/>`;
    p.lines.forEach((ln,j)=>{ nodes+=`<text x="${p.x+p.w/2}" y="${p.y+ (p.kind==="store"?4:0) + 18 + j*15 + (p.h-20-p.lines.length*15)/2}" text-anchor="middle" font-size="12.5" fill="var(--ink)">${esc(ln)}</text>`; }); });
  const used=[...new Set(Object.values(pos).map(p=>p.kind))];
  const legend=used.map(k=>`<span class="lg"><i style="background:${KIND[k].f};border-color:${KIND[k].s}${KIND[k].d?";border-style:dashed":""}"></i>${k}</span>`).join("");
  const vx=Math.floor(bb.x0-12), vy=Math.floor(bb.y0-8), vw=Math.ceil(bb.x1-bb.x0+24), vh=Math.ceil(bb.y1-bb.y0+16);
  return `<div class="dgm" data-w="${vw}"><button class="btn small dgm-x" type="button">Full size</button><svg viewBox="${vx} ${vy} ${vw} ${vh}" style="min-width:${Math.min(vw,640)}px" role="img" aria-label="Architecture diagram" font-family="IBM Plex Sans, system-ui, sans-serif">
   <defs><marker id="ah" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="var(--muted)"/></marker></defs>
   ${heads}${edges}${nodes}${labels}</svg><div class="legend">${legend}</div></div>`;
}
/* sequence diagram drawn from data */
function seqSVG(f){
  const actors=arr(f&&f.actors).slice(0,6).map(String); const steps=arr(f&&f.steps).slice(0,14);
  if(actors.length<2||!steps.length) return "";
  const CW=160, PX=20, idx=n=>{ const i=actors.findIndex(a=>a.toLowerCase()===String(n||"").toLowerCase()); return i; };
  const cx=i=>PX+CW/2+i*CW, W=PX*2+actors.length*CW;
  let y=74, body="";
  steps.forEach((s,n)=>{ const a=idx(s.from), b=idx(s.to); if(a<0||b<0) return;
    const kind=["sync","async","reply","fail"].includes(s.kind)?s.kind:"sync";
    const col=kind==="fail"?"var(--red)":"var(--ink)", dash=kind==="async"||kind==="reply"?'stroke-dasharray="5 4"':"";
    const span=Math.max(1,Math.abs(b-a)), lines=wrapText(`${n+1}. ${s.label||""}`, a===b?20:Math.floor(span*CW/6.8)).slice(0,3);
    const th=lines.length*14, left=a===b&&a===actors.length-1;
    lines.forEach((ln,j)=>{ body+=`<text x="${a===b?(left?cx(a)-10:cx(a)+38):(cx(a)+cx(b))/2}" y="${y+j*14}" text-anchor="${a===b?(left?"end":"start"):"middle"}" font-size="12" fill="${kind==="fail"?"var(--red)":"var(--ink)"}">${esc(ln)}</text>`; });
    const ly=y+th-4;
    if(a===b){ body+=`<path d="M${cx(a)},${ly} h28 v16 h-26" fill="none" stroke="${col}" stroke-width="1.4" ${dash} marker-end="url(#sh)"/>`; y+=th+30; }
    else { body+=`<line x1="${cx(a)}" y1="${ly}" x2="${cx(b)+(b>a?-3:3)}" y2="${ly}" stroke="${col}" stroke-width="1.4" ${dash} marker-end="url(#sh${kind==="fail"?"f":""})"/>`; y+=th+20; }
  });
  const H=y+6;
  let heads="";
  actors.forEach((a,i)=>{ heads+=`<line x1="${cx(i)}" y1="44" x2="${cx(i)}" y2="${H-4}" stroke="var(--line)" stroke-width="1.5" stroke-dasharray="3 4"/>
    <rect x="${cx(i)-62}" y="10" width="124" height="32" rx="8" fill="var(--surface)" stroke="var(--ink)" stroke-width="1.3"/>
    <text x="${cx(i)}" y="30" text-anchor="middle" font-size="12.5" font-weight="600" fill="var(--ink)">${esc(a.slice(0,18))}</text>`; });
  return `<div class="dgm" data-w="${W}"><button class="btn small dgm-x" type="button">Full size</button><svg viewBox="0 0 ${W} ${H}" style="min-width:${Math.min(W,640)}px" role="img" aria-label="Sequence diagram" font-family="IBM Plex Sans, system-ui, sans-serif">
   <defs><marker id="sh" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0,0 L10,5 L0,10 z" fill="var(--ink)"/></marker>
   <marker id="shf" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0,0 L10,5 L0,10 z" fill="var(--red)"/></marker></defs>
   ${heads}${body}</svg><div class="legend"><span class="lg"><i class="ln"></i>sync</span><span class="lg"><i class="ln dash"></i>async / reply</span><span class="lg"><i class="ln fail"></i>failure path</span></div></div>`;
}

function openDiagram(box){
  const svg=box.querySelector("svg"); if(!svg) return;
  const w=+box.dataset.w||900, bg=el("div","modal-bg"), m=el("div","dgm-modal"); m.setAttribute("role","dialog"); m.setAttribute("aria-modal","true");
  const top=el("div","dgm-modal-top"); const zl=el("span","small muted","Scroll or drag to move around. Use the buttons to zoom.");
  let z=1; const zin=el("button","btn small","Zoom in"), zout=el("button","btn small","Zoom out"), close=el("button","btn small","Close");
  const sc=el("div","dgm-scroll"); const c=svg.cloneNode(true); c.removeAttribute("style"); sc.append(c);
  const apply=()=>{ c.style.width=Math.round(w*z)+"px"; c.style.height="auto"; c.style.maxWidth="none"; };
  zin.onclick=()=>{ z=Math.min(3,z*1.25); apply(); }; zout.onclick=()=>{ z=Math.max(.4,z/1.25); apply(); };
  const done=()=>{ document.removeEventListener("keydown",key); bg.remove(); }; const key=e=>{ if(e.key==="Escape") done(); };
  close.onclick=done; bg.onclick=e=>{ if(e.target===bg) done(); };
  let drag=null; sc.addEventListener("pointerdown",e=>{ drag={x:e.clientX,y:e.clientY,l:sc.scrollLeft,t:sc.scrollTop}; sc.setPointerCapture(e.pointerId); sc.classList.add("grab"); });
  sc.addEventListener("pointermove",e=>{ if(!drag) return; sc.scrollLeft=drag.l-(e.clientX-drag.x); sc.scrollTop=drag.t-(e.clientY-drag.y); });
  const end=()=>{ drag=null; sc.classList.remove("grab"); }; sc.addEventListener("pointerup",end); sc.addEventListener("pointercancel",end);
  top.append(zl,el("span","sp"),zout,zin,close); m.append(top,sc); bg.append(m); document.body.append(bg); document.addEventListener("keydown",key); apply(); close.focus();
}
export { esc, arr, archSVG, seqSVG, openDiagram };
