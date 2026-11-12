/* eslint-disable */
// @ts-nocheck — ported from the POC: renders the model solution and comparison from model JSON as HTML.
"use client";
import { esc, arr, archSVG, seqSVG } from "./diagrams";
import { md } from "@/components/ui";
import { COMP } from "./constants";
let CUR=null;
const SEC_COMP={requirements:["scoping"],estimates:["scoping","storage"],architecture:["distributed"],components:["distributed"],apis:["scoping"],
  storage:["storage"],flow:["distributed"],scaling:["distributed"],observability:["observability"],tradeoffs:[],coverage:["scoping"]};
const CNAME=Object.fromEntries(COMP.map(c=>[c.key,c.name]));
/* section rendering */
const ul=items=>`<ul>${arr(items).map(i=>`<li>${esc(i)}</li>`).join("")}</ul>`;
const tags=k=>arr(SEC_COMP[k]).map(c=>`<span class="ctag">${esc(CNAME[c])}</span>`).join("");
function section(key,title,inner){
  const deep=CUR.solution.deep&&CUR.solution.deep[key];
  return `<section class="sec" data-sec="${key}" id="sec-${key}"><div class="sec-h"><h3>${esc(title)}</h3><div class="ctags">${tags(key)}</div>
    <button class="btn ghost small deep-btn" data-deep="${key}" data-title="${esc(title)}">${deep?"Deep dive ✓":"Deep dive"}</button></div>
    ${inner}<div class="deep md" id="deep-${key}">${deep?md(deep):""}</div></section>`;
}
function renderModel(){
  const m=CUR.solution.model; if(!m) return "";
  const h=m.hld||{}, l=m.lld||{}, r=h.requirements||{};
  let o=`<h1 class="sol-title">${esc(CUR.question)}</h1><p class="lede">${esc(m.summary)}</p>
  <div class="jump"><a href="#cmp-anchor">How your design compares</a></div>
  <h2 class="level">High-level design</h2>`;
  o+=section("requirements","Requirements",`<div class="cols3"><div><h4>Functional</h4>${ul(r.functional)}</div><div><h4>Non-functional</h4>${ul(r.non_functional)}</div><div><h4>Out of scope</h4>${ul(r.out_of_scope)}</div></div>`);
  o+=section("estimates","Estimates",`<div class="tbl"><table><thead><tr><th>Metric</th><th>Value</th><th>How</th></tr></thead><tbody>${arr(h.estimates).map(e=>`<tr><td>${esc(e.metric)}</td><td><b>${esc(e.value)}</b></td><td class="muted">${esc(e.math)}</td></tr>`).join("")}</tbody></table></div>`);
  o+=section("architecture","Architecture",archSVG(h.architecture)+`<div class="tbl"><table><tbody>${arr(h.components).map(c=>`<tr><td><b>${esc(c.name)}</b></td><td>${esc(c.role)}</td></tr>`).join("")}</tbody></table></div>`);
  if(arr(h.apis).length) o+=section("apis","APIs",`<div class="tbl"><table><tbody>${arr(h.apis).map(a=>`<tr><td><code>${esc(a.signature)}</code></td><td>${esc(a.note)}</td></tr>`).join("")}</tbody></table></div>`);
  o+=`<h2 class="level">Low-level design</h2>`;
  const s=l.storage||{};
  o+=section("storage","Storage & data model",`<p><b>${esc(s.choice)}</b>. ${esc(s.why)}</p>${s.rejected?`<p class="muted small">Not chosen: ${esc(s.rejected)}</p>`:""}
    <div class="tbl"><table><thead><tr><th>Entity</th><th>Key</th><th>Fields</th><th></th></tr></thead><tbody>${arr(s.entities).map(e=>`<tr><td><b>${esc(e.name)}</b></td><td><code>${esc(e.key)}</code></td><td>${esc(e.fields)}</td><td class="muted">${esc(e.note)}</td></tr>`).join("")}</tbody></table></div>${ul(s.points)}`);
  const f=l.flow||{};
  o+=section("flow",f.title?`Key flow: ${f.title}`:"Key flow",seqSVG(f)+ul(f.notes));
  o+=section("scaling","Scaling & failure handling",`<div class="tbl"><table><thead><tr><th>Risk</th><th>Mitigation</th></tr></thead><tbody>${arr(l.scaling).map(x=>`<tr><td>${esc(x.risk)}</td><td>${esc(x.mitigation)}</td></tr>`).join("")}</tbody></table></div>`);
  const ob=l.observability||{};
  o+=section("observability","Observability",`<div class="cols3"><div><h4>SLOs</h4>${ul(ob.slos)}</div><div><h4>Alerts</h4>${ul(ob.alerts)}</div><div><h4>Leading signals</h4>${ul(ob.signals)}</div></div>`);
  if(arr(l.tradeoffs).length) o+=section("tradeoffs","Trade-offs",`<div class="tbl"><table><thead><tr><th>Decision</th><th>Gain</th><th>Cost</th></tr></thead><tbody>${arr(l.tradeoffs).map(t=>`<tr><td><b>${esc(t.decision)}</b></td><td>${esc(t.gain)}</td><td>${esc(t.cost)}</td></tr>`).join("")}</tbody></table></div>`);
  const cov=arr(m.requirements_coverage);
  if(cov.length){
    const SECNAME={architecture:"Architecture",apis:"APIs",storage:"Storage & data model",flow:"Key flow",scaling:"Scaling & failure handling",observability:"Observability"};
    const rows=t=>cov.filter(c=>(c.type||"").replace("-","_").startsWith(t)).map(c=>{ const part=String(c.status||"").startsWith("partial");
      const link=SECNAME[c.where]?`<a href="#sec-${esc(c.where)}" class="seclink">${esc(SECNAME[c.where])}</a>`:"";
      return `<tr><td>${esc(c.requirement)}</td><td>${esc(c.how)}${part&&c.caveat?`<div class="small" style="color:var(--amber);margin-top:3px">Gap: ${esc(c.caveat)}</div>`:""}</td><td>${link}</td><td><span class="vd ${part?"warn":"ok"}">${part?"Partly met":"Met"}</span></td></tr>`; }).join("");
    const tbl=(title,body)=>body?`<h4 style="margin-top:12px">${title}</h4><div class="tbl"><table><thead><tr><th style="width:28%">Requirement</th><th>How this design meets it</th><th style="width:16%">Where</th><th style="width:10%"></th></tr></thead><tbody>${body}</tbody></table></div>`:"";
    o+=section("coverage","How the design meets the requirements",tbl("Functional",rows("functional"))+tbl("Non-functional",rows("non_functional")));
  }
  return o;
}
function renderCmp(){
  const c=CUR.solution.cmp; if(!c) return "";
  const vcls=v=>({"MATCHES":"ok","ALSO VALID":"ok2","FLAWED":"warn","WRONG":"bad"}[String(v).toUpperCase()]||"");
  let o=`<h2 class="level" id="cmp-anchor">How your design compares</h2><p>${esc(c.overall)}</p>
  <div class="tbl"><table><thead><tr><th>Area</th><th>You</th><th>Model</th><th>Verdict</th></tr></thead><tbody>${arr(c.rows).map(r=>`<tr><td><b>${esc(r.area)}</b></td><td>${esc(r.yours)}</td><td>${esc(r.model)}</td><td><span class="vd ${vcls(r.verdict)}">${esc(r.verdict)}</span><div class="small muted">${esc(r.why)}</div></td></tr>`).join("")}</tbody></table></div>
  <h3 style="margin-top:22px">What you missed</h3>`;
  const miss=arr(c.missed);
  if(!miss.length) o+=`<p class="muted">Nothing significant missed.</p>`;
  COMP.forEach(cp=>{ const items=miss.filter(x=>x.competency===cp.key); if(!items.length) return;
    o+=`<div class="missgrp"><h4>${esc(cp.name)}</h4>${items.map(x=>{ const sv={critical:"crit",important:"imp",nice:"nice"}[x.severity]||"imp";
      return `<div class="missitem"><div><span class="pill ${sv}">${esc({crit:"Critical",imp:"Important",nice:"Nice to have"}[sv])}</span> <b>${esc(x.item)}</b>${x.prompted?' <span class="small muted">(prompted)</span>':""}</div>
      <div class="small">${esc(x.why)}</div><div class="say">“${esc(x.say)}”</div></div>`; }).join("")}</div>`; });
  if(arr(c.open_challenges).length) o+=`<h3 style="margin-top:22px">Open challenges, answered</h3>${arr(c.open_challenges).map(q=>`<div class="qa"><b>${esc(q.challenge)}</b><p>${esc(q.answer)}</p></div>`).join("")}`;
  return o;
}
function solutionMarkdown(){
  const m=CUR.solution.model||{}, h=m.hld||{}, l=m.lld||{}, c=CUR.solution.cmp||{}, L=x=>arr(x).map(i=>"- "+i).join("\n");
  const t=(head,rows)=>rows.length?`| ${head.join(" | ")} |\n|${head.map(()=>"---").join("|")}|\n`+rows.map(r=>"| "+r.map(v=>String(v??"").replace(/\|/g,"/")).join(" | ")+" |").join("\n"):"";
  const arch=h.architecture||{}, names={}; arr(arch.layers).forEach(ly=>arr(ly.nodes).forEach(n=>names[n.id]=n.label||n.id));
  const r=h.requirements||{}, s=l.storage||{}, f=l.flow||{}, ob=l.observability||{};
  let o=`# Model solution: ${CUR.question}\n\n${m.summary||""}\n\n## High-level design\n\n### Requirements\n**Functional**\n${L(r.functional)}\n\n**Non-functional**\n${L(r.non_functional)}\n\n**Out of scope**\n${L(r.out_of_scope)}\n\n### Estimates\n${t(["Metric","Value","How"],arr(h.estimates).map(e=>[e.metric,e.value,e.math]))}\n\n### Architecture\n${arr(arch.layers).map(ly=>`- **${ly.name}:** ${arr(ly.nodes).map(n=>n.label).join(", ")}`).join("\n")}\n\nConnections:\n${arr(arch.edges).map(e=>`- ${names[e.from]||e.from} → ${names[e.to]||e.to}${e.label?` (${e.label})`:""}`).join("\n")}\n\n${t(["Component","Role"],arr(h.components).map(x=>[x.name,x.role]))}\n\n### APIs\n${t(["API","Note"],arr(h.apis).map(a=>["`"+a.signature+"`",a.note]))}\n\n## Low-level design\n\n### Storage & data model\n**${s.choice||""}.** ${s.why||""}\n\nNot chosen: ${s.rejected||"-"}\n\n${t(["Entity","Key","Fields","Note"],arr(s.entities).map(e=>[e.name,e.key,e.fields,e.note]))}\n\n${L(s.points)}\n\n### Key flow: ${f.title||""}\n${arr(f.steps).map((x,i)=>`${i+1}. ${x.from} → ${x.to}: ${x.label}${x.kind&&x.kind!=="sync"?` _(${x.kind})_`:""}`).join("\n")}\n\n${L(f.notes)}\n\n### Scaling & failure handling\n${t(["Risk","Mitigation"],arr(l.scaling).map(x=>[x.risk,x.mitigation]))}\n\n### Observability\n**SLOs**\n${L(ob.slos)}\n\n**Alerts**\n${L(ob.alerts)}\n\n**Leading signals**\n${L(ob.signals)}\n\n### Trade-offs\n${t(["Decision","Gain","Cost"],arr(l.tradeoffs).map(x=>[x.decision,x.gain,x.cost]))}\n`;
  const cov=arr(m.requirements_coverage);
  if(cov.length) o+=`\n## How the design meets the requirements\n\n${t(["Requirement","Type","How this design meets it","Where","Status"],cov.map(c=>[c.requirement,(c.type||"").replace("_","-"),c.how+(c.caveat&&String(c.status).startsWith("partial")?` (Gap: ${c.caveat})`:""),c.where,c.status]))}\n`;
  Object.entries(CUR.solution.deep||{}).forEach(([k,v])=>{ o+=`\n## Deep dive: ${k}\n\n${v}\n`; });
  if(c.rows) o+=`\n## How your design compares\n\n${c.overall||""}\n\n${t(["Area","You","Model","Verdict","Why"],arr(c.rows).map(x=>[x.area,x.yours,x.model,x.verdict,x.why]))}\n\n### What you missed\n${arr(c.missed).map(x=>`- **${CNAME[x.competency]||x.competency} · ${x.severity}:** ${x.item}. ${x.why} _Say next time:_ “${x.say}”`).join("\n")}\n\n### Open challenges\n${arr(c.open_challenges).map(q=>`- **${q.challenge}** ${q.answer}`).join("\n")}\n`;
  return o;
}
export function solutionHTML(S){ CUR=S; return renderModel()+(CUR.solution.cmp?renderCmp():(CUR.solution.model?`<h2 class="level" id="cmp-anchor">How your design compares</h2><p class="part-wait">Sam is comparing this with your design…</p>`:"")); }
export function solutionMD(S){ CUR=S; return solutionMarkdown(); }
