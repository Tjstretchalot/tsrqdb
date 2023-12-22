import{createRequire as e}from"module";var t={n:e=>{var o=e&&e.__esModule?()=>e.default:()=>e;return t.d(o,{a:o}),o},d:(e,o)=>{for(var s in o)t.o(o,s)&&!t.o(e,s)&&Object.defineProperty(e,s,{enumerable:!0,get:o[s]})},o:(e,t)=>Object.prototype.hasOwnProperty.call(e,t)},o={};t.d(o,{kJ:()=>l,vv:()=>n,d6:()=>U,zb:()=>w,fV:()=>s,ID:()=>O,CC:()=>i,oZ:()=>r,B3:()=>E,Ft:()=>b,fA:()=>R,sI:()=>u,TZ:()=>d,Bb:()=>h,ke:()=>a});class s extends Error{log;constructor(e){super("All hosts exhausted"),this.log=e}}class n extends Error{constructor(){super("Query canceled")}}class r extends Error{rawError;queryIndex;constructor(e,t,o){super(e),this.rawError=t,this.queryIndex=o}}class i{raw;constructor(e){this.raw=e}get results(){return this.raw.values??void 0}get lastInsertId(){return this.raw.last_insert_id??void 0}get rowsAffected(){return this.raw.rows_affected??void 0}get error(){return this.raw.error??void 0}}const a=e=>{if(null!==e.error&&void 0!==e.error)throw new r(`A SQL error occurred: ${JSON.stringify(e.error)}`,e.error,0)};class l{itemsRaw;adaptedItems;constructor(e){this.itemsRaw=e.results,this.adaptedItems=void 0}get items(){return void 0===this.adaptedItems&&(this.adaptedItems=this.itemsRaw.map((e=>new i(e)))),this.adaptedItems}}const h=e=>{for(let t=0;t<e.itemsRaw.length;t++){const o=e.itemsRaw[t];if(null!==o.error&&void 0!==o.error)throw new r(`A SQL error occurred on query at index ${t}: ${JSON.stringify(o.error)}`,o.error,t)}},d=e=>{if(e.length<1)throw new Error("EXPLAIN query always produces at least one row");if(4!==e[0].length)throw new Error("EXPLAIN query always produces four columns");const t=[],o=new Map;let s=0;for(const n of e){const e=n[0],r=n[3],i=n[1],a={id:e,detail:r,parent:null,children:[]};if(o.set(e,a),s=Math.max(s,e),0===i)t.push(a);else{const e=o.get(i);if(void 0===e)throw new Error(`EXPLAIN query contains row with unknown parent ID ${i}`);a.parent=e,e.children.push(a)}}return{roots:t,largestId:s}},c=(()=>{const e={indent:3,newline:"\n",includeRaw:!1,vbar:"|",dash:e=>"-".repeat(e),colorRaw:e=>e,colorDetail:e=>e};return async function(){try{const t=await import("chalk"),o="gray"in t?t:t.default;if(o&&"gray"in o){e.vbar=o.gray("|"),e.dash=e=>o.gray("-".repeat(e)),e.colorRaw=e=>o.gray(e);const t=[["SCAN",o.redBright],["UNION ALL",o.redBright],["MATERIALIZE",o.redBright],["CORRELATED SCALAR SUBQUERY",o.redBright],["USING COVERING INDEX",o.greenBright],["USING INTEGER PRIMARY KEY",o.greenBright],["USING ROWID SEARCH",o.greenBright],["SEARCH",o.whiteBright],["USING INDEX",o.whiteBright],["USE TEMP B-TREE",o.whiteBright],["USING TEMP B-TREE",o.whiteBright],["SCALAR SUBQUERY",o.whiteBright],["LIST SUBQUERY",o.whiteBright],["MERGE",o.whiteBright]],s=Object.fromEntries(t),n=new RegExp(`\\b(${Object.keys(t).join("|")})\\b`,"g");e.colorDetail=e=>e.replace(n,(e=>s[e](e)))}}catch(e){}}(),e})(),u=(e,t)=>{const o=e.largestId.toString().length,s=Object.assign({},c,t,{formatId:e=>e.toString().padStart(o," ")}),n=[];for(const t of e.roots)f(t,0,n,s);return n.join(s.newline)},f=(e,t,o,s)=>{const n=[];s.includeRaw&&n.push(s.colorRaw(`[id: ${s.formatId(e.id)}, par: ${s.formatId(e.parent?.id??0)}] `)),n.push(" ".repeat(s.indent&t-1)),t>0&&(n.push(" ".repeat(s.indent-1)),n.push(s.vbar)),n.push(s.dash(s.indent-1)),n.push(s.colorDetail(e.detail)),o.push(n.join(""));for(const n of e.children)f(n,t+1,o,s)},m=/WITH( RECURSIVE)?\s+(,?\s*\S+(\s?\([^\)]+\))?\s+AS\s+((NOT\s+)?MATERIALIZED\s+)?\(.+?\))+\s+(?<cmd>INSERT|UPDATE|DELETE|SELECT)/is,g=e=>{const t=e.match(/^\s*(\S+)/)?.[1];if(void 0===t)throw new Error("Unable to determine SQL command because the SQL string is empty");const o=t.toUpperCase();if("WITH"===o){const t=e.match(m);if(null===t)throw new Error("Unable to determine SQL command using Common Table Expressions (CTEs) (no match)");const o=t.groups?.cmd;if(void 0===o)throw new Error("Unable to determine SQL command using Common Table Expressions (CTEs) (bad regex)");return o.toUpperCase()}return o},p=e=>e.json();class w{connection;options;constructor(e,t){this.connection=e,this.options=t}async execute(e,t,o){const s=o?.raiseOnError??!0,n=o?.readConsistency??this.options?.readConsistency??this.connection.options.readConsistency,r=o?.freshness??this.options?.freshness??this.connection.options.freshness,l=t??[],h=g(e),d="SELECT"===h||"EXPLAIN"===h,c=Math.random().toString(36).substring(2);let u,f;if(d){const t=this.connection.options.log.readStart;if(t.enabled){let o=e;void 0!==t.maxLength&&o.length>t.maxLength&&(o=o.substring(0,t.maxLength)+"...");let s=JSON.stringify(l);void 0!==t.maxLength&&s.length>t.maxLength&&(s=s.substring(0,t.maxLength)+"...");let i="";"none"===n&&(i=`, freshness="${r}"`);const a=`  [RQLITE ${h} @ ${n}${i} {${c}}] - ${JSON.stringify(o)}; ${s}`,d=this.connection.options.log.meta.format(t.level,a);void 0!==d&&t.method(d)}u=performance.now(),f=this.connection.fetchResponse(n,r,"GET","/db/query?level="+n+("none"===n?"&freshness="+r:""),JSON.stringify([[e,...l]]),{"Content-Type":"application/json; charset=UTF-8"},o?.signal,p)}else{const t=this.connection.options.log.writeStart;if(t.enabled){let o=e;void 0!==t.maxLength&&o.length>t.maxLength&&(o=o.substring(0,t.maxLength)+"...");let s=JSON.stringify(l);void 0!==t.maxLength&&s.length>t.maxLength&&(s=s.substring(0,t.maxLength)+"...");const n=`  [RQLITE ${h} {${c}}] - ${JSON.stringify(o)}; ${s}`,r=this.connection.options.log.meta.format(t.level,n);void 0!==r&&t.method(r)}u=performance.now(),f=this.connection.fetchResponse("strong",r,"POST","/db/execute",JSON.stringify([[e,...l]]),{"Content-Type":"application/json; charset=UTF-8"},o?.signal,p)}const m=await f,w=performance.now()-u,v=d?this.connection.options.log.readResponse:this.connection.options.log.writeResponse;if(v.enabled){let e=JSON.stringify(m);void 0!==v.maxLength&&e.length>v.maxLength&&(e=e.substring(0,v.maxLength)+"...");const t=`    {${c}} in ${(w/1e3).toLocaleString(void 0,{maximumFractionDigits:3})}s - ${e}`,o=this.connection.options.log.meta.format(v.level,t);void 0!==o&&v.method(o)}if(void 0!==m.error){const s="string"==typeof m.error?m.error:JSON.stringify(m.error);if(d&&"stale read"===s&&"none"===n){const s=this.connection.options.log.readStale;if(s.enabled){const e=`    {${c}} ->> stale read, retrying with weak consistency`,t=this.connection.options.log.meta.format(s.level,e);void 0!==t&&s.method(t)}return await this.execute(e,t,{...o,readConsistency:"weak"})}throw new Error(s)}if(void 0===m.results)throw new Error("No results returned");if(1!==m.results.length)throw new Error("Unexpected number of results returned");const E=m.results[0],b=new i(E);return s&&a(b),b}async executeMany2(e,t,o){const s=o?.raiseOnError??!0,n=t??e.map((()=>[])),r=o?.transaction??!0;if(e.length!==n.length)throw new Error("operations and parameters must be the same length");const i="/db/execute"+(r?"?transaction":""),a=Math.random().toString(36).substring(2),d=[...e.map(((e,t)=>[e,...n[t]]))],c=this.connection.options.log.writeStart;if(c.enabled){let e=JSON.stringify(d,null,2);void 0!==c.maxLength&&e.length>c.maxLength&&(e=e.substring(0,c.maxLength)+"...");const t=`  [RQLITE BULK {${a}}] - ${e}`,o=this.connection.options.log.meta.format(c.level,t);void 0!==o&&c.method(o)}const u=performance.now(),f=await this.connection.fetchResponse("strong",this.connection.options.freshness,"POST",i,JSON.stringify(d),{"Content-Type":"application/json; charset=UTF-8"},o?.signal,p),m=performance.now()-u,g=this.connection.options.log.writeResponse;if(g.enabled){let e=JSON.stringify(f);void 0!==g.maxLength&&e.length>g.maxLength&&(e=e.substring(0,g.maxLength)+"...");const t=`    {${a}} in ${(m/1e3).toLocaleString(void 0,{maximumFractionDigits:3})}s - ${e}`,o=this.connection.options.log.meta.format(g.level,t);void 0!==o&&g.method(o)}if(void 0!==f.error){const e="string"==typeof f.error?f.error:JSON.stringify(f.error);throw new Error(e)}if(void 0===f.results)throw new Error("No results returned");const w=new l({results:f.results});return s&&h(w),w}async executeMany3(e,t){return await this.executeMany2(e.map((([e])=>e)),e.map((([,e])=>e)),t)}async explain(e,t,o){"EXPLAIN"!==g(e)&&(e="EXPLAIN QUERY PLAN "+e);const s=o?.readConsistency??this.options?.readConsistency??this.connection.options.readConsistency,n="strong"===s?"weak":s,r=await this.execute(e,t,{...o,readConsistency:n,raiseOnError:!0});if(void 0===r.results)throw new Error("EXPLAIN query did not return any results");const i=d(r.results);if(o?.out){const e=u(i,o.format);o.out(e)}return i}}const v=e(import.meta.url)("util"),E=(()=>{const e={debug:e=>e,info:e=>e,warning:e=>e,error:e=>e,timestamp:e=>e,errorDetails:e=>e,SELECT:e=>e,INSERT:e=>e,UPDATE:e=>e,DELETE:e=>e,EXPLAIN:e=>e,BULK:e=>e};return async function(){try{const t=await import("chalk"),o="gray"in t?t:t.default;o&&"gray"in o&&(e.debug=o.gray,e.info=o.white,e.warning=o.yellowBright,e.error=o.redBright,e.timestamp=o.green,e.errorDetails=o.gray,e.SELECT=o.cyan,e.INSERT=o.blueBright,e.UPDATE=o.yellow,e.DELETE=o.red,e.EXPLAIN=o.magentaBright,e.BULK=o.whiteBright)}catch(e){}}(),e})(),b=(e,t,o)=>{const s=(new Date).toLocaleString(),n=void 0!==o?`\n${E.errorDetails((0,v.inspect)(o))}`:"";return`${E.timestamp(s)} ${E[e](t)}${n}`},S=e=>console.log(e),y=/(?<cmd>SELECT|INSERT|UPDATE|DELETE|EXPLAIN|BULK)/,x=e=>{const t=e.match(y);if(null!==t){const o=t.groups?.cmd;if(void 0!==o){const t=E[o];void 0!==t&&(e=e.replace(y,t(o)))}}S(e)},R={meta:{format:b},readStart:{method:x,level:"debug",maxLength:void 0,enabled:!0},readResponse:{method:S,level:"debug",maxLength:1024,enabled:!0},readStale:{method:S,level:"debug",maxLength:void 0,enabled:!0},writeStart:{method:x,level:"debug",maxLength:void 0,enabled:!0},writeResponse:{method:S,level:"debug",maxLength:void 0,enabled:!0},followRedirect:{method:S,level:"debug",maxLength:void 0,enabled:!1},fetchError:{method:S,level:"debug",maxLength:void 0,enabled:!0},connectTimeout:{method:S,level:"debug",maxLength:void 0,enabled:!0},readTimeout:{method:S,level:"error",maxLength:void 0,enabled:!0},hostsExhausted:{method:S,level:"error",maxLength:void 0,enabled:!0},nonOkResponse:{method:S,level:"warning",maxLength:void 0,enabled:!0},backupStart:{method:S,level:"info",maxLength:void 0,enabled:!0},backupEnd:{method:S,level:"info",maxLength:void 0,enabled:!0}},L=(e,t,o)=>{if(void 0===t)return;const s=t[o];if(void 0!==s)if(!1!==s){if(!0===s){if(e[o].enabled)return;return R[o].enabled?void(e[o]={...R[o]}):void(e[o]={method:S,level:"debug",maxLength:void 0,enabled:!0})}e[o]={method:s.method??R[o].method,level:s.level??R[o].level,maxLength:s.maxLength,enabled:!0}}else e[o]={method:()=>{},level:"debug",maxLength:0,enabled:!1}},I=e(import.meta.url)("crypto"),T=()=>{const e=(0,I.randomBytes)(8);return e[0]=0,e[1]&=31,Number(e.readBigUInt64BE(0))/Number.MAX_SAFE_INTEGER},$=e=>{if(e<=0)throw new Error("max must be greater than 0");if(1===e)return()=>0;if(e<=256){if(0==(e&e-1)){const t=e-1;return()=>(0,I.randomBytes)(1)[0]&t}const t=256-256%e;if(100*(1-t/256)<5)return()=>{for(;;){const o=(0,I.randomBytes)(1)[0];if(!(o>=t))return o%e}}}return()=>{for(;;){const t=Math.floor(T()*e);if(t!==e)return t}}},N=e=>{if(e<0)throw new Error("length must be at least 0");if(0===e)return()=>[];if(1===e)return()=>[0];if(2===e){const e=$(2);return()=>{const t=e();return[t,1-t]}}if(e<16){const t=[];for(let o=0;o<e;o++)t.push($(o+1));return()=>{const o=new Array(e);for(let s=0;s<e;s++){const e=t[s]();o[s]=o[e],o[e]=s}return o}}return()=>{const t=new Array(e);for(let o=0;o<e;o++)for(;;){const e=Math.floor(T()*(o+1));e!==o+1&&(t[o]=t[e],t[e]=o)}return t}},A=()=>{const e=$(256);return(t,o)=>new Promise(((s,r)=>{if(o.aborted)return void r(new n);let i,a=!1;const l=()=>{a=!0,void 0!==i&&(clearTimeout(i),i=void 0),o.removeEventListener("abort",h)},h=()=>{a||(l(),r(new n))};o.addEventListener("abort",h),i=setTimeout((()=>{i=void 0,a||(l(),s())}),1e3*2**t+e())}))};class k{hosts;args;signal;shuffledHosts;nextIndexInShuffledHosts;loopsThroughShuffledHosts;redirects;randomHostIndex;firstPassRandomShuffle;repeatedPassRandomShuffle;backoff;initialIndex;constructor(e,t,o,s,n,r,i){this.hosts=e,this.args=t,this.signal=o,this.shuffledHosts=void 0,this.nextIndexInShuffledHosts=0,this.loopsThroughShuffledHosts=0,this.redirects=0,this.randomHostIndex=s,this.firstPassRandomShuffle=n,this.repeatedPassRandomShuffle=r,this.backoff=i,this.initialIndex=this.randomHostIndex()}async selectNode(){if(this.redirects=0,void 0===this.shuffledHosts){if(0===this.nextIndexInShuffledHosts)return this.nextIndexInShuffledHosts=1,this.hosts[this.initialIndex];const e=this.firstPassRandomShuffle();this.shuffledHosts=new Array(this.hosts.length),this.shuffledHosts[0]=this.hosts[this.initialIndex];for(let t=0;t<this.hosts.length-1;t++){let o=e[t];o>=this.initialIndex&&o++,this.shuffledHosts[t+1]=this.hosts[o]}}if(this.nextIndexInShuffledHosts>=this.shuffledHosts.length){if(this.loopsThroughShuffledHosts>=this.args.maxAttemptsPerHost)throw new s(!0);this.loopsThroughShuffledHosts++;const e=this.repeatedPassRandomShuffle();for(let t=0;t<this.hosts.length;t++){let o=e[t];o>=this.initialIndex&&o++,this.shuffledHosts[t]=this.hosts[o]}this.nextIndexInShuffledHosts=0}const e=this.shuffledHosts[this.nextIndexInShuffledHosts];return this.nextIndexInShuffledHosts++,e}async onSuccess(){}async onRedirect(){return this.redirects>=this.args.maxRedirects?{log:!0,follow:!1}:(this.redirects++,{follow:!0,log:!0})}onFailure(){return this.nextIndexInShuffledHosts>=this.hosts.length?this.backoff(this.loopsThroughShuffledHosts,this.signal):Promise.resolve()}}const O=(e,t)=>{if(0===e.length)throw new Error("hosts must not be empty");if(1===e.length)return((e,t)=>{if(1!==e.length)throw new Error("hosts must have length 1");const o=A();return{createNodeSelectorForQuery:(n,r,i)=>{let a=0,l=0;return{selectNode:async()=>{if(a>=t.maxAttemptsPerHost)throw new s(!0);return l=0,a++,e[0]},onSuccess:()=>Promise.resolve(),onRedirect:async()=>l>=t.maxRedirects?{log:!0,follow:!1}:(l++,{follow:!0,log:!0}),onFailure:()=>o(a,i)}}}})(e,t);const o=$(e.length),n=N(e.length-1),r=N(e.length),i=A();return{createNodeSelectorForQuery:(s,a,l)=>new k(e,t,l,o,n,r,i)}},C=e(import.meta.url)("fs");var B=t.n(C);const P=[301,302,303,307,308];class U{hosts;options;selector;constructor(e,t){this.hosts=e;const o=void 0===t?.log?R:(()=>{const e={meta:{...(o=R).meta},readStart:{...o.readStart},readResponse:{...o.readResponse},readStale:{...o.readStale},writeStart:{...o.writeStart},writeResponse:{...o.writeResponse},followRedirect:{...o.followRedirect},fetchError:{...o.fetchError},connectTimeout:{...o.connectTimeout},readTimeout:{...o.readTimeout},hostsExhausted:{...o.hostsExhausted},nonOkResponse:{...o.nonOkResponse},backupStart:{...o.backupStart},backupEnd:{...o.backupEnd}};var o;return((e,t)=>{void 0!==t&&(void 0!==t.meta&&void 0!==t.meta.format&&(e.meta.format=t.meta.format),L(e,t,"readStart"),L(e,t,"readResponse"),L(e,t,"readStale"),L(e,t,"writeStart"),L(e,t,"writeResponse"),L(e,t,"connectTimeout"),L(e,t,"hostsExhausted"),L(e,t,"nonOkResponse"),L(e,t,"backupStart"),L(e,t,"backupEnd"))})(e,t.log),e})();this.options={timeoutMs:5e3,responseTimeoutMs:6e4,maxRedirects:2,maxAttemptsPerHost:2,readConsistency:"weak",freshness:"5m",...t,log:o,nodeSelector:t?.nodeSelector??O},this.selector=this.options.nodeSelector(this.hosts,this.options)}async fetchResponse(e,t,o,r,i,a,l,h){if(l?.aborted)throw new n;const d=new AbortController,c=d.signal;let u=!1;const f=[];if(void 0!==l){const e=()=>{u||d.abort()};l.addEventListener("abort",e),f.push((()=>{l.removeEventListener("abort",e)}))}try{const l=this.selector.createNodeSelectorForQuery(e,t,c);let d;for(;;){if(c.aborted)throw new n;let e;try{e=d??await l.selectNode()}catch(e){if(e instanceof s&&this.options.log.hostsExhausted.enabled){const t=this.options.log.meta.format(this.options.log.hostsExhausted.level,"All hosts exhausted",e);void 0!==t&&this.options.log.hostsExhausted.method(t,e)}throw e}if(d=void 0,c.aborted)throw new n;const t=new AbortController,u=t.signal;let m,g=!1;const p=()=>{m=void 0,g=!0,t.abort()},w=()=>{void 0!==m&&(clearTimeout(m),m=void 0),t.abort()};let v,E;f.push((()=>{void 0!==m&&(clearTimeout(m),m=void 0),c.removeEventListener("abort",w)})),c.addEventListener("abort",w),m=setTimeout(p,this.options.timeoutMs);let b=!1;try{v=await fetch(`${e}${r}`,{method:o,body:i,headers:a,signal:u,redirect:"manual"}),v.ok&&void 0!==m&&!c.aborted&&(clearTimeout(m),m=setTimeout(p,this.options.responseTimeoutMs),b=!0,E=await h(v,u)),f.pop()()}catch(t){if(c.aborted)throw new n;if(f.pop()(),g){if(b){if(this.options.log.readTimeout.enabled){const o=this.options.log.meta.format(this.options.log.readTimeout.level,`Timeout reading response from ${e}${r}`,t);void 0!==o&&this.options.log.readTimeout.method(o,t)}}else if(this.options.log.connectTimeout.enabled){const o=this.options.log.meta.format(this.options.log.connectTimeout.level,`Timeout fetching from ${e}${r}`,t);void 0!==o&&this.options.log.connectTimeout.method(o,t)}await l.onFailure({type:"timeout"})}else{if(this.options.log.fetchError.enabled){const o=this.options.log.meta.format(this.options.log.fetchError.level,`Error fetching from ${e}${r}`,t);void 0!==o&&this.options.log.fetchError.method(o,t)}await l.onFailure({type:"fetchError"})}continue}if(f.push((()=>{t.abort()})),c.aborted)throw new n;if(P.includes(v.status)){const t=v.headers.get("location");if(null===t){if(this.options.log.nonOkResponse.enabled){const t=this.options.log.meta.format(this.options.log.nonOkResponse.level,`Redirect response missing location header from ${e}${r} despite status code ${v.status}`);void 0!==t&&this.options.log.nonOkResponse.method(t)}await l.onFailure({type:"nonOKResponse",subtype:"body",response:v}),f.pop()();continue}const o=await l.onRedirect({type:"redirect",location:t,response:v});if(c.aborted)throw new n;if(o.follow){if(d=o.overrideFollowTarget??t,this.options.log.followRedirect.enabled){const t=this.options.log.meta.format(this.options.log.followRedirect.level,`Following redirect from ${e}${r} to ${d}`);void 0!==t&&this.options.log.followRedirect.method(t)}}else if(this.options.log.nonOkResponse.enabled){const o=this.options.log.meta.format(this.options.log.nonOkResponse.level,`Exceeded max redirects, last host: ${e}${r}, last location: ${t}`);void 0!==o&&this.options.log.nonOkResponse.method(o)}f.pop()()}else{if(v.ok){if(void 0===E)throw new Error("parseResponse returned undefined, despite not being aborted");return E}if(this.options.log.nonOkResponse.enabled){const t=this.options.log.meta.format(this.options.log.nonOkResponse.level,`Non-OK response from ${e}${r}: ${v.status} ${v.statusText}`);void 0!==t&&this.options.log.nonOkResponse.method(t)}if(await l.onFailure({type:"nonOKResponse",subtype:"status",response:v}),c.aborted)throw new n;f.pop()()}}}finally{u=!0;for(const e of f)e()}}async backup(e,t,o,s,r){const i=s??"none",a=r??this.options.freshness,l="/db/backup"+("sql"===e?"?fmt=sql":""),h=Math.random().toString(36).substring(2),d=this.options.log.backupStart;if(d.enabled){const t=this.options.log.meta.format(d.level,`  [RQLITE BACKUP {${h}} format=${e}] Starting backup...`);void 0!==t&&d.method(t)}const c=performance.now();await this.fetchResponse(i,a,"GET",l,void 0,void 0,o,(async(e,o)=>{if(o.aborted)throw new n;return await t(e,o),{}}));const u=performance.now(),f=this.options.log.backupEnd;if(f.enabled){const t=(u-c)/1e3,o=this.options.log.meta.format(f.level,`  [RQLITE BACKUP {${h}} format=${e}] Backup complete in ${t.toLocaleString(void 0,{maximumFractionDigits:3})}s`);void 0!==o&&f.method(o)}}backupToFile(e,t,o){return this.backup(e,(async(e,o)=>{if(null===e.body)throw new Error("Response body is null");const s=e.body,r=B().createWriteStream(t);try{const e=new Uint8Array(16384),t=s.getReader({mode:"byob"});for(;;){if(o.aborted)throw new n;const{value:s,done:i}=await t.read(e);if(void 0!==s&&await new Promise(((e,t)=>r.write(s,(o=>{null==o?e():t(o)})))),i)break}}finally{r.close()}}),o,"none",void 0)}cursor(e,t){return new w(this,void 0===e&&void 0===t?void 0:{readConsistency:e,freshness:t})}}var H=o.kJ,D=o.vv,Q=o.d6,F=o.zb,M=o.fV,q=o.ID,J=o.CC,X=o.oZ,j=o.B3,G=o.Ft,K=o.fA,_=o.sI,Y=o.TZ,Z=o.Bb,V=o.ke;export{H as RqliteBulkResultAdapter,D as RqliteCanceledError,Q as RqliteConnection,F as RqliteCursor,M as RqliteHostsExhaustedError,q as RqliteRandomNodeSelector,J as RqliteResultItemAdapter,X as RqliteSQLError,j as defaultColors,G as defaultFormatter,K as defaultLogOptions,_ as formatExplainQueryPlan,Y as parseExplainQueryPlan,Z as raiseIfAnySQLError,V as raiseIfSQLError};