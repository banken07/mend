import {mkdirSync,readFileSync,rmSync,statSync,writeFileSync,writeSync} from 'node:fs';
import {dirname} from 'node:path';
const FM=['auto','unified','search-replace','v4a','json'];
class E2{line:string;constructor(l:string){this.line=l}}
class FA{c:string;p:string;constructor(c:string,p:string){this.c=c;this.p=p}}
const bl=(s:string)=>s.trim()==='';
function pl(t:string):string[]{if(t==='')return[];const l=t.split('\n');if(t.endsWith('\n'))l.pop();return l.map(x=>x.endsWith('\r')?x.slice(0,-1):x)}
function sf(p:string){return p!==''&&!p.startsWith('/')&&!p.includes('\\')&&p.split('/').every(s=>s!==''&&s!=='.'&&s!=='..')}
class T{
o=new Map<string,string|null>();n=new Map<string,string|null>();mv:{o:string;n:string}[]=[];
orig(p:string):string|null{if(!this.o.has(p)){let v:string|null=null;try{if(statSync(p).isFile())v=readFileSync(p,'utf8')}catch{v=null}this.o.set(p,v)}return this.o.get(p)!}
get(p:string){return this.n.has(p)?this.n.get(p)!:this.orig(p)}
}
type Ed=(t:T)=>void;
function det(L:string[]):string|null{const f=L.findIndex(l=>!bl(l));if(f<0)return null;if(L[f]!.trim()==='*** Begin Patch')return 'v4a';const c=L[f]!.trimStart()[0];if(c==='['||c==='{')return 'json';if(L.some(l=>l.trimEnd()==='<<<<<<< SEARCH'))return 'search-replace';if(L.some((l,i)=>l.startsWith('diff --git ')||(l.startsWith('--- ')&&(L[i+1]??'').startsWith('+++ '))))return 'unified';return null}
function je(v:unknown):Ed|null{
if(v===null||typeof v!=='object'||Array.isArray(v))return null;
const o=v as Record<string,unknown>;const p=o.path;
if(typeof p!=='string')return null;
const ex=(t:T):string=>{if(!sf(p))throw new FA('unsafe',p);const x=t.get(p);if(x===null)throw new FA('missing',p);return x};
if(o.command==='create'&&typeof o.file_text==='string'){const tx=o.file_text;return t=>{if(!sf(p))throw new FA('unsafe',p);if(t.get(p)!==null)throw new FA('exists',p);t.n.set(p,tx)}}
if(o.command==='str_replace'&&typeof o.old_str==='string'&&o.old_str!==''&&(o.new_str===undefined||typeof o.new_str==='string')){
const os=o.old_str;const ns=(o.new_str as string|undefined)??'';
return t=>{const b=ex(t);const nl=b.indexOf('\n');const cr=nl>0&&b[nl-1]==='\r';const lf=(s:string)=>cr?s.replaceAll('\r\n','\n'):s;const x=lf(b);const od=lf(os);let c=0;for(let k=x.indexOf(od);k>=0;k=x.indexOf(od,k+1))c++;if(c===0)throw new FA('no-match',p);if(c>1)throw new FA('ambiguous',p);const a=x.indexOf(od);const out=x.slice(0,a)+lf(ns)+x.slice(a+od.length);t.n.set(p,cr?out.replaceAll('\n','\r\n'):out)}}
if(o.command==='insert'&&typeof o.insert_line==='number'&&Number.isInteger(o.insert_line)&&typeof o.new_str==='string'){
const ln=o.insert_line;const ad=pl(o.new_str);
return t=>{const b=ex(t);const nl=b.indexOf('\n');const br=nl>0&&b[nl-1]==='\r'?'\r\n':'\n';const ls=b===''?[]:b.split(br);const fn=b!==''&&b.endsWith(br);if(fn)ls.pop();if(ln<0||ln>ls.length)throw new FA('no-match',p);ls.splice(ln,0,...ad);t.n.set(p,ls.length===0?'':ls.join(br)+(fn?br:''))}}
return null}
function jE(tx:string,L:string[]):Ed[]{
const f=L.findIndex(l=>!bl(l));if(f<0)throw new E2('error: parse 1');const e:Ed[]=[];
if(L[f]!.trimStart().startsWith('[')){let v:unknown;try{v=JSON.parse(tx)}catch{throw new E2(`error: parse ${f+1}`)}if(!Array.isArray(v))throw new E2(`error: parse ${f+1}`);for(const x of v){const d=je(x);if(d===null)throw new E2(`error: parse ${f+1}`);e.push(d)}return e}
L.forEach((l,i)=>{if(bl(l))return;let d:Ed|null=null;try{d=je(JSON.parse(l))}catch{d=null}if(d===null)throw new E2(`error: parse ${i+1}`);e.push(d)});
return e}
type FL={b:string;l:string[];f:boolean};
function pf(t:string):FL{if(t==='')return{b:'\n',l:[],f:false};const nl=t.indexOf('\n');const b=nl>0&&t[nl-1]==='\r'?'\r\n':'\n';const p=t.split(b);const fn=t.endsWith(b);if(fn)p.pop();return{b,l:p,f:fn}}
function wf(x:FL){return x.l.length===0?'':x.l.join(x.b)+(x.f?x.b:'')}
const lw=(s:string)=>{const m=/^[ \t]*/.exec(s);return m?m[0]:''};
const tt=(s:string)=>s.replace(/[ \t]+$/,'');
function le(a:string,b:string,t:number){if(t===0)return a===b;if(t===1)return tt(a)===tt(b);return tt(a.replace(/^[ \t]+/,''))===tt(b.replace(/^[ \t]+/,''))}
function oc(O:string[],L:string[],t:number,fr:number):number[]{const o:number[]=[];if(O.length===0)return o;for(let i=fr;i+O.length<=L.length;i++){let k=true;for(let j=0;j<O.length;j++)if(!le(O[j]!,L[i+j]!,t)){k=false;break}if(k)o.push(i)}return o}
function ft(O:string[],L:string[],s:boolean,fr=0):{t:number;p:number[]}|null{const ts=s?[0]:[0,1,2];for(const t of ts){const p=oc(O,L,t,fr);if(p.length>0)return{t,p}}return null}
function bR(L:string[],at:number,O:string[],N:string[],nO:number[],t:number):string[]{
const o:string[]=[];const P=t===2?lw(O[0]!):'';const F=t===2?lw(L[at]!):'';
for(let j=0;j<N.length;j++){const oi=nO[j]!;if(oi>=0){o.push(L[at+oi]!);continue}let ln=N[j]!;if(t===2&&ln!==''&&ln.trim()!==''&&ln.startsWith(P))ln=F+ln.slice(P.length);o.push(ln)}
return o}
type BE={k:string;t:string};
type Hk={a:number;b:BE[]};
type US={o:string|null|undefined;n:string|null|undefined;c:boolean;d:boolean;rf:string|undefined;rt:string|undefined;go:string|undefined;gn:string|undefined;h:Hk[]};
function sA(p:string){return p.startsWith('a/')||p.startsWith('b/')?p.slice(2):p}
function hP(r:string):string|null{let t=r.slice(4);const tb=t.indexOf('\t');if(tb>=0)t=t.slice(0,tb);t=t.trim();if(t==='/dev/null')return null;return sA(t)}
const HR=/^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/;
const DR=/^diff --git a\/(.*) b\/(.*)$/;
function pU(L:string[]):US[]{
const S:US[]=[];const n=L.length;let i=0;let s:US|null=null;let hd=false;
const st=():US=>{const x:US={o:undefined,n:undefined,c:false,d:false,rf:undefined,rt:undefined,go:undefined,gn:undefined,h:[]};S.push(x);return x};
const del=(x:US)=>x.d||x.n===null;
while(i<n){
const l=L[i]!;
if(l.startsWith('diff --git ')){const m=DR.exec(l);if(!m)throw new E2(`error: parse ${i+1}`);s=st();s.go=sA(m[1]!);s.gn=sA(m[2]!);hd=false;i++;continue}
if(l.startsWith('--- ')&&(L[i+1]??'').startsWith('+++ ')){
if(s!==null&&!hd&&s.h.length===0){s.o=hP(l);s.n=hP(L[i+1]!);hd=true;i+=2;continue}
s=st();s.o=hP(l);s.n=hP(L[i+1]!);hd=true;i+=2;continue}
if(s===null){if(l.startsWith('@@'))throw new E2(`error: parse ${i+1}`);i++;continue}
if(s.h.length===0&&l.startsWith('--- '))throw new E2(`error: parse ${i+2}`);
if(l.startsWith('@@')){
const m=HR.exec(l);if(!m)throw new E2(`error: parse ${i+1}`);i++;
if(del(s)){while(i<n){const b=L[i]!;if(b.startsWith('diff --git '))break;if(b.startsWith('--- ')&&(L[i+1]??'').startsWith('+++ '))break;i++}continue}
const hk:Hk={a:Number(m[1]),b:[]};
while(i<n){const b=L[i]!;if(b.startsWith('diff --git '))break;if(b.startsWith('--- ')&&(L[i+1]??'').startsWith('+++ '))break;if(b===''){hk.b.push({k:'ctx',t:''});i++;continue}const c=b[0];if(c===' '){hk.b.push({k:'ctx',t:b.slice(1)});i++;continue}if(c==='-'){hk.b.push({k:'old',t:b.slice(1)});i++;continue}if(c==='+'){hk.b.push({k:'new',t:b.slice(1)});i++;continue}if(c==='\\'){hk.b.push({k:'bs',t:b});i++;continue}break}
while(hk.b.length>0){const e=hk.b[hk.b.length-1]!;if(e.k==='ctx'&&e.t==='')hk.b.pop();else break}
s.h.push(hk);continue}
if(s.h.length===0){
if(l.startsWith('rename from '))s.rf=l.slice('rename from '.length).trim();
else if(l.startsWith('rename to '))s.rt=l.slice('rename to '.length).trim();
else if(l.startsWith('new file mode'))s.c=true;
else if(l.startsWith('deleted file mode'))s.d=true;
i++;continue}
i++}
return S}
function hN(h:Hk):boolean{for(let k=h.b.length-1;k>=0;k--){const e=h.b[k]!;if(e.k==='ctx'||e.k==='new')return h.b[k+1]?.k==='bs'}return false}
function aH(f:FL,hs:Hk[],st:boolean,path:string):void{
let d=0;
for(const h of hs){
const O:string[]=[];const N:string[]=[];const nO:number[]=[];
for(const b of h.b){if(b.k==='ctx'){nO.push(O.length);O.push(b.t);N.push(b.t)}else if(b.k==='old'){O.push(b.t)}else if(b.k==='new'){nO.push(-1);N.push(b.t)}}
const nn=hN(h);
if(O.length>0){
const fd=ft(O,f.l,st,0);if(!fd)throw new FA('no-match',path);
const tg=h.a-1+d;let best=fd.p[0]!;let bd=Math.abs(best-tg);
for(const p of fd.p){const dd=Math.abs(p-tg);if(dd<bd){best=p;bd=dd}}
const at=best;const re=at+O.length===f.l.length;
const rp=bR(f.l,at,O,N,nO,fd.t);f.l.splice(at,O.length,...rp);
if(re)f.f=!nn;
}else{
const ix=Math.max(0,Math.min(h.a+d,f.l.length));const ae=ix===f.l.length;
f.l.splice(ix,0,...N);if(ae)f.f=!nn}
d+=N.length-O.length}}
function uE(L:string[],st:boolean):Ed[]{
const S=pU(L);if(S.length===0)throw new E2('error: parse 1');
return S.map(s=>(tr:T)=>{
const oP=s.o!==undefined?s.o:(s.rf??s.go);
const nP=s.n!==undefined?s.n:(s.rt??s.gn);
const cr=s.c||oP===null;
const dl=s.d||nP===null;
if(cr){
const p=nP??'';if(!sf(p))throw new FA('unsafe',p);if(tr.get(p)!==null)throw new FA('exists',p);
const ol:string[]=[];for(const h of s.h)for(const b of h.b)if(b.k==='new')ol.push(b.t);
const fl:BE[]=s.h.flatMap(h=>h.b);let nn=false;
for(let k=fl.length-1;k>=0;k--){if(fl[k]!.k==='new'){nn=fl[k+1]?.k==='bs';break}}
tr.n.set(p,ol.length===0?'':ol.join('\n')+(nn?'':'\n'));return}
if(dl){
const p=oP??'';if(!sf(p))throw new FA('unsafe',p);if(tr.get(p)===null)throw new FA('missing',p);tr.n.set(p,null);return}
if(oP!==undefined&&nP!==undefined&&oP!==nP){
if(!sf(oP))throw new FA('unsafe',oP);if(!sf(nP))throw new FA('unsafe',nP);
const cur=tr.get(oP);if(cur===null)throw new FA('missing',oP);if(tr.get(nP)!==null)throw new FA('exists',nP);
const f=pf(cur);aH(f,s.h,st,oP);tr.n.set(nP,wf(f));tr.n.set(oP,null);tr.mv.push({o:oP,n:nP});return}
const p=(oP??nP)??'';if(!sf(p))throw new FA('unsafe',p);
const cur=tr.get(p);if(cur===null)throw new FA('missing',p);
const f=pf(cur);aH(f,s.h,st,p);tr.n.set(p,wf(f))})}
function sE(L:string[],st:boolean):Ed[]{
type Bk={p:string;o:string[];n:string[]};
const B:Bk[]=[];const n=L.length;let i=0;let pe=-1;let pp:string|null=null;
while(i<n){
if(L[i]!.trimEnd()!=='<<<<<<< SEARCH'){i++;continue}
const s=i;let m=-1;
for(let j=s+1;j<n;j++){const t=L[j]!.trimEnd();if(t==='======='){m=j;break}if(t==='>>>>>>> REPLACE'||t==='<<<<<<< SEARCH')break}
if(m<0)throw new E2(`error: parse ${s+1}`);
let r=-1;
for(let j=m+1;j<n;j++){const t=L[j]!.trimEnd();if(t==='>>>>>>> REPLACE'){r=j;break}if(t==='<<<<<<< SEARCH')break}
if(r<0)throw new E2(`error: parse ${s+1}`);
let pa:string|null=null;
for(let j=s-1;j>pe;j--){const t=L[j]!;if(bl(t))continue;if(t.trim().startsWith('```'))continue;pa=t.trim();break}
if(pa===null){if(pp===null)throw new E2(`error: parse ${s+1}`);pa=pp}
B.push({p:pa,o:L.slice(s+1,m),n:L.slice(m+1,r)});pp=pa;pe=r;i=r+1}
if(B.length===0)throw new E2('error: parse 1');
return B.map(b=>(tr:T)=>{
if(!sf(b.p))throw new FA('unsafe',b.p);
if(b.o.length===0){if(tr.get(b.p)!==null)throw new FA('exists',b.p);tr.n.set(b.p,b.n.length===0?'':b.n.join('\n')+'\n');return}
const cur=tr.get(b.p);if(cur===null)throw new FA('missing',b.p);
const f=pf(cur);const fd=ft(b.o,f.l,st,0);if(!fd)throw new FA('no-match',b.p);if(fd.p.length>1)throw new FA('ambiguous',b.p);
const at=fd.p[0]!;const rp=bR(f.l,at,b.o,b.n,b.n.map(()=>-1),fd.t);f.l.splice(at,b.o.length,...rp);tr.n.set(b.p,wf(f))})}
type VC={a:string|null;e:boolean;b:BE[]};
type VS={k:string;p:string;m:string|null;l:string[];c:VC[];n:number};
function vE(L:string[],st:boolean):Ed[]{
const f=L.findIndex(l=>!bl(l));if(f<0)throw new E2('error: parse 1');
if(L[f]!.trim()!=='*** Begin Patch')throw new E2(`error: parse ${f+1}`);
let la=-1;for(let k=L.length-1;k>=0;k--){if(!bl(L[k]!)){la=k;break}}
if(L[la]!.trim()!=='*** End Patch')throw new E2(`error: parse ${L.length+1}`);
const sk=(l:string)=>l.startsWith('*** Add File: ')?'add':l.startsWith('*** Delete File: ')?'del':l.startsWith('*** Update File: ')?'upd':null;
const S:VS[]=[];let i=f+1;
while(i<la){
const l=L[i]!;if(bl(l)){i++;continue}
const k=sk(l);if(k===null)throw new E2(`error: parse ${i+1}`);
const px=k==='add'?'*** Add File: ':k==='del'?'*** Delete File: ':'*** Update File: ';
const s:VS={k,p:l.slice(px.length).trim(),m:null,l:[],c:[],n:i+1};i++;
if(k==='add'){
while(i<la){const x=L[i]!;if(sk(x)!==null)break;if(x===''){s.l.push('');i++;continue}if(x.startsWith('+')){s.l.push(x.slice(1));i++;continue}if(bl(x)){let rb=true;for(let j=i+1;j<la;j++){if(!bl(L[j]!)&&sk(L[j]!)===null){rb=false;break}if(sk(L[j]!)!==null)break}if(rb)break;throw new E2(`error: parse ${i+1}`)}throw new E2(`error: parse ${i+1}`)}
while(s.l.length>0&&s.l[s.l.length-1]==='')s.l.pop();
}else if(k==='del'){
while(i<la){const x=L[i]!;if(bl(x)||sk(x)!==null)break;throw new E2(`error: parse ${i+1}`)}
}else{
if(i<la&&L[i]!.startsWith('*** Move to: ')){s.m=L[i]!.slice('*** Move to: '.length).trim();i++}
let cur:VC|null=null;let ae=false;
while(i<la){
const x=L[i]!;if(sk(x)!==null)break;
if(x.startsWith('@@')){const a=x.slice(2).trim();cur={a:a==='' ? null:a,e:false,b:[]};s.c.push(cur);ae=false;i++;continue}
if(x==='*** End of File'){if(cur===null){cur={a:null,e:true,b:[]};s.c.push(cur)}else cur.e=true;ae=true;i++;continue}
if(ae){if(bl(x)){i++;continue}throw new E2(`error: parse ${i+1}`)}
const c=x[0];
if(c===' '||c==='-'||c==='+'){if(cur===null){cur={a:null,e:false,b:[]};s.c.push(cur)}cur.b.push({k:c===' '?'ctx':c==='-'?'old':'new',t:x.slice(1)});i++;continue}
if(x===''){if(cur===null){cur={a:null,e:false,b:[]};s.c.push(cur)}cur.b.push({k:'ctx',t:''});i++;continue}
throw new E2(`error: parse ${i+1}`)}
if(s.c.length>0){const lc=s.c[s.c.length-1]!;while(lc.b.length>0){const e=lc.b[lc.b.length-1]!;if(e.k==='ctx'&&e.t==='')lc.b.pop();else break}if(lc.b.length===0&&lc.a===null&&!lc.e)s.c.pop()}
if(s.c.length===0&&s.m===null)throw new E2(`error: parse ${s.n}`)}
S.push(s)}
if(S.length===0)throw new E2('error: parse 1');
return S.map(s=>(tr:T)=>{
if(s.k==='add'){if(!sf(s.p))throw new FA('unsafe',s.p);if(tr.get(s.p)!==null)throw new FA('exists',s.p);tr.n.set(s.p,s.l.length===0?'':s.l.join('\n')+'\n');return}
if(s.k==='del'){if(!sf(s.p))throw new FA('unsafe',s.p);if(tr.get(s.p)===null)throw new FA('missing',s.p);tr.n.set(s.p,null);return}
if(!sf(s.p))throw new FA('unsafe',s.p);
if(s.m!==null&&!sf(s.m))throw new FA('unsafe',s.m);
const cur=tr.get(s.p);if(cur===null)throw new FA('missing',s.p);
if(s.m!==null&&tr.get(s.m)!==null)throw new FA('exists',s.m);
const fl=pf(cur);let cu=0;
for(const ch of s.c){
if(ch.a!==null){const fd=ft([ch.a],fl.l,st,cu);if(!fd)throw new FA('no-match',s.p);cu=fd.p[0]!+1}
const O:string[]=[];const N:string[]=[];const nO:number[]=[];
for(const b of ch.b){if(b.k==='ctx'){nO.push(O.length);O.push(b.t);N.push(b.t)}else if(b.k==='old'){O.push(b.t)}else if(b.k==='new'){nO.push(-1);N.push(b.t)}}
if(O.length===0){const ix=ch.e?fl.l.length:cu;fl.l.splice(ix,0,...N);cu=ix+N.length}
else{
const fd=ft(O,fl.l,st,cu);if(!fd)throw new FA('no-match',s.p);
let at:number|null=null;
if(ch.e){for(const p of fd.p){if(p+O.length===fl.l.length){at=p;break}}if(at===null)throw new FA('no-match',s.p)}
else at=fd.p[0]!;
const rp=bR(fl.l,at,O,N,nO,fd.t);fl.l.splice(at,O.length,...rp);cu=at+rp.length}}
const tx=wf(fl);
if(s.m!==null){tr.n.set(s.m,tx);tr.n.set(s.p,null);tr.mv.push({o:s.p,n:s.m})}
else tr.n.set(s.p,tx)})}
function rn(a:string[]):{code:number;out:string[]}{
let fm:string|null=null;let ck=false;let sc=false;const pos:string[]=[];let en=false;
for(const x of a){
if(!en&&x==='--')en=true;
else if(!en&&x.startsWith('-')&&x!=='-'){
if(x.startsWith('--format=')&&fm===null&&FM.includes(x.slice(9)))fm=x.slice(9);
else if(x==='--check'&&!ck)ck=true;
else if(x==='--strict'&&!sc)sc=true;
else return{code:2,out:['error: usage']}}
else pos.push(x)}
if(pos.length>1)return{code:2,out:['error: usage']};
const fi=pos.length===0||pos[0]==='-'?null:pos[0]!;
let tx='';
try{tx=readFileSync(fi??0,'utf8')}catch{if(fi!==null)return{code:2,out:['error: no-patch']}}
const L=pl(tx);
const kd=fm===null||fm==='auto'?det(L):fm;
if(kd===null)return{code:2,out:['error: format']};
let ed:Ed[];
try{
ed=kd==='json'?jE(tx,L):kd==='unified'?uE(L,sc):kd==='search-replace'?sE(L,sc):vE(L,sc);
if(ed.length===0)throw new E2('error: parse 1');
}catch(e){if(e instanceof E2)return{code:2,out:[e.line]};throw e}
const tr=new T();const fl:FA[]=[];
for(const e of ed){
const bf=new Map(tr.n);
try{e(tr)}catch(er){if(!(er instanceof FA))throw er;tr.n.clear();for(const[k,v]of bf)tr.n.set(k,v);fl.push(er)}}
if(fl.length>0)return{code:1,out:[...fl.map(f=>`error: ${f.c} ${f.p}`),`failed: ${fl.length} of ${ed.length} edits`]};
const en2:{p:string;w:string|null;n:string|null}[]=[];
for(const p of[...tr.n.keys()].sort((a,b)=>Buffer.compare(Buffer.from(a),Buffer.from(b)))){const w=tr.orig(p);const n=tr.n.get(p)!;if(w===n)continue;en2.push({p,w,n})}
for(const m of tr.mv){tr.orig(m.o);tr.orig(m.n)}
if(!ck){for(const e of en2){if(e.n===null)rmSync(e.p,{force:true});else{mkdirSync(dirname(e.p),{recursive:true});writeFileSync(e.p,e.n)}}}
const rO=new Set<string>();const rN=new Map<string,string>();
for(const m of tr.mv){if(tr.orig(m.o)!==null&&tr.orig(m.n)===null&&tr.get(m.o)===null&&tr.get(m.n)!==null){rO.add(m.o);rN.set(m.n,m.o)}}
const rows:{k:string;t:string}[]=[];
for(const e of en2){if(rO.has(e.p)||rN.has(e.p))continue;rows.push({k:e.p,t:`${e.w===null?'A':e.n===null?'D':'M'} ${e.p}`})}
for(const[nw,ol]of rN)rows.push({k:nw,t:`R ${ol} -> ${nw}`});
rows.sort((a,b)=>Buffer.compare(Buffer.from(a.k),Buffer.from(b.k)));
const out=rows.map(r=>r.t);
return{code:0,out:[...out,`ok: ${out.length} ${out.length===1?'file':'files'}`]}}
const te=process.env.MAKEFUN_ENV_URL;
if(te!==undefined&&te!==''){
const{runTrial}=await import('./runner.ts');
await runTrial(te);
}else{
const r=rn(process.argv.slice(2));
writeSync(1,r.out.map(l=>`${l}\n`).join(''));
process.exitCode=r.code;
}
