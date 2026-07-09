const fs = require("fs");
const path = require("path");
const http = require("http");
const https = require("https");
const { URL } = require("url");

const DEFAULT_PORT = 17654;

const QUICK_LINKS = [
  { title: "Yandex", url: "https://ya.ru", source: "launcher", description: "Поиск и сервисы Яндекса." },
  { title: "Cloud", url: "https://cloud.mail.ru", source: "launcher", description: "Облачное хранилище." },
  { title: "Telegram", url: "https://web.telegram.org", source: "launcher", description: "Telegram Web." },
  { title: "Avito", url: "https://www.avito.ru", source: "launcher", description: "Объявления, товары и услуги." },
  { title: "ChatGPT", url: "https://chatgpt.com", source: "launcher", description: "AI-помощник." },
  { title: "LM Arena", url: "https://lmarena.ai", source: "launcher", description: "Сравнение AI-моделей." }
];

const SAFE_DIRECTORIES = {
  all: [
    { title: "Wikipedia", url: "https://www.wikipedia.org", source: "directory", description: "Энциклопедия и справочные материалы." },
    { title: "Wikimedia Commons", url: "https://commons.wikimedia.org", source: "directory", description: "Медиафайлы и изображения с открытыми лицензиями." },
    { title: "MDN Web Docs", url: "https://developer.mozilla.org", source: "directory", description: "Документация по веб-разработке." },
    { title: "GitHub", url: "https://github.com", source: "directory", description: "Репозитории и open-source проекты." },
    { title: "Stack Overflow", url: "https://stackoverflow.com", source: "directory", description: "Вопросы и ответы по программированию." },
    { title: "Habr", url: "https://habr.com", source: "directory", description: "Технологии, разработка и инженерные статьи." },
    { title: "RBC", url: "https://www.rbc.ru", source: "directory:news", description: "Новости, бизнес и экономика." },
    { title: "TASS", url: "https://tass.ru", source: "directory:news", description: "Новостное агентство." },
    { title: "Reuters", url: "https://www.reuters.com", source: "directory:news", description: "Международные новости." },
    { title: "YouTube", url: "https://www.youtube.com", source: "directory:video", description: "Видео, обзоры и обучение." },
    { title: "Ozon", url: "https://www.ozon.ru", source: "directory:shopping", description: "Товары и покупки." },
    { title: "Wildberries", url: "https://www.wildberries.ru", source: "directory:shopping", description: "Маркетплейс и товары." },
    { title: "Yandex Market", url: "https://market.yandex.ru", source: "directory:shopping", description: "Сравнение товаров и цен." }
  ],
  images: [
    { title: "Wikimedia Commons", url: "https://commons.wikimedia.org", source: "directory:image", description: "Безопасный источник изображений и медиафайлов." },
    { title: "Unsplash", url: "https://unsplash.com", source: "directory:image", description: "Фотографии и визуальные материалы." },
    { title: "Pexels", url: "https://www.pexels.com", source: "directory:image", description: "Фото и видео." }
  ],
  videos: [
    { title: "YouTube", url: "https://www.youtube.com", source: "directory:video", description: "Видео, обзоры, обучение." },
    { title: "Rutube", url: "https://rutube.ru", source: "directory:video", description: "Видео и российский видеохостинг." },
    { title: "Vimeo", url: "https://vimeo.com", source: "directory:video", description: "Видео и творческие проекты." }
  ],
  shopping: [
    { title: "Ozon", url: "https://www.ozon.ru", source: "directory:shopping", description: "Товары и маркетплейс." },
    { title: "Wildberries", url: "https://www.wildberries.ru", source: "directory:shopping", description: "Товары и одежда." },
    { title: "Yandex Market", url: "https://market.yandex.ru", source: "directory:shopping", description: "Сравнение цен и товаров." },
    { title: "Avito", url: "https://www.avito.ru", source: "directory:shopping", description: "Объявления и товары." }
  ],
  news: [
    { title: "RBC", url: "https://www.rbc.ru", source: "directory:news", description: "Новости бизнеса, экономики и политики." },
    { title: "TASS", url: "https://tass.ru", source: "directory:news", description: "Новостное агентство." },
    { title: "Interfax", url: "https://www.interfax.ru", source: "directory:news", description: "Новости и события." },
    { title: "Reuters", url: "https://www.reuters.com", source: "directory:news", description: "Международные новости." }
  ]
};

const UNSAFE_PATTERNS = ["porn","xxx","adult","casino","betting","gambling","torrent","crack","warez","наркот","казино","ставки","порно"];

function safeMkdir(dir){fs.mkdirSync(dir,{recursive:true});}
function readJSON(file,fallback){try{return fs.existsSync(file)?JSON.parse(fs.readFileSync(file,"utf8")):fallback;}catch(_){return fallback;}}
function writeJSON(file,data){safeMkdir(path.dirname(file));fs.writeFileSync(file,JSON.stringify(data,null,2));}
function now(){return Date.now();}
function normalizeWhitespace(text){return String(text||"").replace(/\s+/g," ").trim();}
function stripTags(html){return normalizeWhitespace(String(html||"").replace(/<script[\s\S]*?<\/script>/gi," ").replace(/<style[\s\S]*?<\/style>/gi," ").replace(/<noscript[\s\S]*?<\/noscript>/gi," ").replace(/<[^>]+>/g," ").replace(/&nbsp;/g," ").replace(/&amp;/g,"&").replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&lt;/g,"<").replace(/&gt;/g,">"));}
function extractTag(html,regex){const m=String(html||"").match(regex);return normalizeWhitespace(m?m[1]:"");}
function extractMeta(html,name){const re1=new RegExp(`<meta[^>]+name=["']${name}["'][^>]+content=["']([^"']*)["'][^>]*>`,"i");const re2=new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]+name=["']${name}["'][^>]*>`,"i");return extractTag(html,re1)||extractTag(html,re2);}
function extractHeadings(html){const arr=[];const re=/<h[1-3][^>]*>([\s\S]*?)<\/h[1-3]>/gi;let m;while((m=re.exec(String(html||""))))arr.push(stripTags(m[1]));return arr.filter(Boolean).slice(0,20);}
function extractLinks(html,baseUrl){const links=[];const re=/<a[^>]+href=["']([^"']+)["'][^>]*>/gi;let m;while((m=re.exec(String(html||"")))){try{const raw=m[1].trim();if(!raw||/^(javascript:|mailto:|tel:|data:|blob:)/i.test(raw))continue;const u=new URL(raw,baseUrl);if(!/^https?:$/i.test(u.protocol))continue;u.hash="";links.push(u.toString());}catch(_){}}return [...new Set(links)];}
function domainOf(url){try{return new URL(url).hostname.replace(/^www\./,"");}catch(_){return "";}}
function faviconFor(url){const d=domainOf(url);return d?`https://www.google.com/s2/favicons?sz=64&domain=${d}`:"";}
function tokenize(text){const tokens=(String(text||"").toLowerCase().match(/[a-zа-яё0-9]{2,}/gi)||[]);const stop=new Set(["http","https","www","com","net","org","ru","html","для","или","как","что","это","the","and","with","from"]);return tokens.map(t=>t.toLowerCase()).filter(t=>!stop.has(t)).slice(0,5000);}
function buildSnippet(text,queryTokens){const clean=normalizeWhitespace(text);if(!clean)return"";const lower=clean.toLowerCase();let idx=-1;for(const t of queryTokens){idx=lower.indexOf(t.toLowerCase());if(idx>=0)break;}if(idx<0)return clean.slice(0,260);const start=Math.max(0,idx-90);const end=Math.min(clean.length,idx+190);return(start>0?"…":"")+clean.slice(start,end)+(end<clean.length?"…":"");}
function isSafeURL(url){const lower=String(url||"").toLowerCase();if(!/^https?:\/\//i.test(lower))return false;if(UNSAFE_PATTERNS.some(p=>lower.includes(p)))return false;try{const u=new URL(url);return["http:","https:"].includes(u.protocol);}catch(_){return false;}}
function mergeSource(a,b){const set=new Set(String(a||"").split("+").filter(Boolean));for(const part of String(b||"").split("+").filter(Boolean))set.add(part);return Array.from(set).join("+")||"index";}

function parseHTML(url,html,source="crawler"){const title=extractTag(html,/<title[^>]*>([\s\S]*?)<\/title>/i)||domainOf(url);const description=extractMeta(html,"description");const headings=extractHeadings(html);const bodyText=stripTags(html);const text=normalizeWhitespace([title,description,...headings,bodyText].join(" "));return{url,title,description,text:text.slice(0,250000),headings,tokens:tokenize(text),domain:domainOf(url),favicon:faviconFor(url),indexedAt:now(),lastVisitedAt:now(),source};}

function fetchText(url,timeout=9000,redirects=0){return new Promise((resolve,reject)=>{if(redirects>4)return reject(new Error("Too many redirects"));let parsed;try{parsed=new URL(url);}catch(err){return reject(err);}const lib=parsed.protocol==="https:"?https:http;const req=lib.get(url,{headers:{"User-Agent":"Mozilla/5.0 NexusSearchBot/1.0","Accept":"text/html,application/xhtml+xml"},timeout},res=>{const status=res.statusCode||0;if(status>=300&&status<400&&res.headers.location){res.resume();try{resolve(fetchText(new URL(res.headers.location,url).toString(),timeout,redirects+1));}catch(err){reject(err);}return;}const contentType=String(res.headers["content-type"]||"");if(!contentType.includes("text/html")&&!contentType.includes("application/xhtml")){res.resume();reject(new Error(`Unsupported content-type: ${contentType||"unknown"}`));return;}let data="";res.setEncoding("utf8");res.on("data",chunk=>{data+=chunk;if(data.length>2_000_000)req.destroy(new Error("Page too large"));});res.on("end",()=>resolve(data));});req.on("timeout",()=>req.destroy(new Error("Timeout")));req.on("error",reject);});}

function sectionMatches(page,section){if(!section||section==="all"||section==="ai")return true;const hay=`${page.source||""} ${page.url||""} ${page.title||""} ${page.text||""}`.toLowerCase();if(section==="images")return /image|photo|картин|фото|commons|unsplash|pexels|images/.test(hay);if(section==="videos")return /video|видео|youtube|rutube|vimeo/.test(hay);if(section==="shopping")return /shop|market|shopping|товар|купить|цена|ozon|wildberries|avito|маркет/.test(hay);if(section==="news")return /news|новост|rbc|tass|interfax|reuters|ria|лента/.test(hay);return true;}
function scorePage(page,tokens,query){const title=String(page.title||"").toLowerCase();const domain=String(page.domain||domainOf(page.url)||"").toLowerCase();const desc=String(page.description||"").toLowerCase();const text=String(page.text||"").toLowerCase();const pageTokens=Array.isArray(page.tokens)?page.tokens:tokenize(text);let score=0;const full=query.toLowerCase();if(title===full)score+=120;if(title.includes(full))score+=70;if(domain.includes(full))score+=55;if(desc.includes(full))score+=35;if(text.includes(full))score+=20;const freq=new Map();for(const t of pageTokens)freq.set(t,(freq.get(t)||0)+1);for(const token of tokens){if(title.includes(token))score+=22;if(domain.includes(token))score+=18;if(desc.includes(token))score+=10;const f=freq.get(token)||0;if(f)score+=Math.min(18,2+Math.log2(f+1)*4);}const source=String(page.source||"");if(source.includes("bookmark"))score+=18;if(source.includes("launcher"))score+=15;if(source.includes("manual"))score+=10;if(source.includes("directory"))score+=8;if(source.includes("history"))score+=5;if(page.lastVisitedAt){const ageDays=(now()-page.lastVisitedAt)/86400000;score+=Math.max(0,8-ageDays*.2);}return score;}

function makeSectionURL(base,query,section){const q=encodeURIComponent(query||"");const host=domainOf(base);if(section==="images"){if(host.includes("unsplash.com"))return`https://unsplash.com/s/photos/${q}`;if(host.includes("pexels.com"))return`https://www.pexels.com/search/${q}/`;if(host.includes("wikimedia.org"))return`https://commons.wikimedia.org/w/index.php?search=${q}&title=Special:MediaSearch&type=image`;}if(section==="videos"){if(host.includes("youtube.com"))return`https://www.youtube.com/results?search_query=${q}`;if(host.includes("rutube.ru"))return`https://rutube.ru/search/?query=${q}`;if(host.includes("vimeo.com"))return`https://vimeo.com/search?q=${q}`;}if(section==="shopping"){if(host.includes("ozon.ru"))return`https://www.ozon.ru/search/?text=${q}`;if(host.includes("wildberries.ru"))return`https://www.wildberries.ru/catalog/0/search.aspx?search=${q}`;if(host.includes("market.yandex.ru"))return`https://market.yandex.ru/search?text=${q}`;if(host.includes("avito.ru"))return`https://www.avito.ru/all?q=${q}`;}if(section==="news"){if(host.includes("rbc.ru"))return`https://www.rbc.ru/search/?query=${q}`;if(host.includes("tass.ru"))return`https://tass.ru/search?searchStr=${q}`;if(host.includes("interfax.ru"))return`https://www.interfax.ru/search/?phrase=${q}`;if(host.includes("reuters.com"))return`https://www.reuters.com/site-search/?query=${q}`;}return base;}
function directoryResult(item,query,section){const url=(section&&section!=="all"&&query)?makeSectionURL(item.url,query,section):item.url;return{title:item.title,url,domain:domainOf(item.url),description:item.description||"",snippet:item.description||"",favicon:faviconFor(item.url),source:item.source||"directory",score:20,indexedAt:null,lastVisitedAt:null,safe:true};}
function externalLinks(query,section){const q=encodeURIComponent(query||"");if(section==="images")return[{title:"Картинки в Яндексе",url:`https://yandex.ru/images/search?text=${q}`,source:"external:image",description:"Внешний поиск картинок."},{title:"Картинки в DuckDuckGo",url:`https://duckduckgo.com/?q=${q}&iax=images&ia=images`,source:"external:image",description:"Альтернативный поиск изображений."}];if(section==="videos")return[{title:"Видео на YouTube",url:`https://www.youtube.com/results?search_query=${q}`,source:"external:video",description:"Видео по запросу."},{title:"Видео в Яндексе",url:`https://yandex.ru/video/search?text=${q}`,source:"external:video",description:"Видеопоиск."}];if(section==="shopping")return[{title:"Товары на Ozon",url:`https://www.ozon.ru/search/?text=${q}`,source:"external:shopping",description:"Поиск товаров на Ozon."},{title:"Товары на Wildberries",url:`https://www.wildberries.ru/catalog/0/search.aspx?search=${q}`,source:"external:shopping",description:"Поиск товаров на Wildberries."},{title:"Яндекс Маркет",url:`https://market.yandex.ru/search?text=${q}`,source:"external:shopping",description:"Сравнение товаров и цен."}];if(section==="news")return[{title:"Новости в Яндексе",url:`https://yandex.ru/news/search?text=${q}`,source:"external:news",description:"Новости по запросу."},{title:"Новости в Bing",url:`https://www.bing.com/news/search?q=${q}`,source:"external:news",description:"Альтернативный новостной поиск."}];return[{title:"Искать в Яндексе",url:`https://yandex.ru/search/?text=${q}`,source:"external",description:"Внешний поиск по интернету."},{title:"Искать в DuckDuckGo",url:`https://duckduckgo.com/?q=${q}`,source:"external",description:"Приватный внешний поиск."},{title:"Искать в Bing",url:`https://www.bing.com/search?q=${q}`,source:"external",description:"Внешний поиск Bing."}];}

class NexusSearchEngine{
  constructor(options={}){this.dataDir=options.dataDir;this.port=options.port||DEFAULT_PORT;this.server=null;this.indexFile=path.join(this.dataDir,"pages.json");this.manualSitesFile=path.join(this.dataDir,"manual-sites.json");this.errorsFile=path.join(this.dataDir,"errors.json");this.pages=[];this.manualSites=[];this.errors=[];this.indexing=false;this.lastRebuildAt=null;this.uploadsDir=null;this.load();}
  load(){safeMkdir(this.dataDir);this.pages=readJSON(this.indexFile,[]);this.manualSites=readJSON(this.manualSitesFile,[]);this.errors=readJSON(this.errorsFile,[]);this.seedDefaults();}
  save(){writeJSON(this.indexFile,this.pages.slice(0,15000));writeJSON(this.manualSitesFile,this.manualSites);writeJSON(this.errorsFile,this.errors.slice(0,300));}
  seedDefaults(){let changed=false;const items=[...QUICK_LINKS,...Object.values(SAFE_DIRECTORIES).flat()];for(const item of items){if(this.pages.some(p=>p.url===item.url&&String(p.source||"").includes(item.source.split(":")[0])))continue;const text=normalizeWhitespace(`${item.title} ${domainOf(item.url)} ${item.description||""} безопасный сайт каталог Nexus`);this.upsertPage({url:item.url,title:item.title,description:item.description||"",text,tokens:tokenize(text),domain:domainOf(item.url),favicon:faviconFor(item.url),indexedAt:now(),lastVisitedAt:null,source:item.source},false);changed=true;}if(changed)this.save();}
  upsertPage(page,shouldSave=true){if(!page||!page.url||!isSafeURL(page.url))return;const existing=this.pages.find(p=>p.url===page.url);if(existing){Object.assign(existing,page,{indexedAt:page.indexedAt||existing.indexedAt||now(),lastVisitedAt:page.lastVisitedAt||existing.lastVisitedAt||null,source:mergeSource(existing.source,page.source)});}else this.pages.unshift(page);if(shouldSave)this.save();}
  addVisitedPage(item){if(!item||!item.url||!isSafeURL(item.url))return;const text=normalizeWhitespace(`${item.title||""} ${item.displayUrl||""} ${domainOf(item.url)}`);this.upsertPage({url:item.url,title:item.title||item.url,description:item.displayUrl||"",text,tokens:tokenize(text),domain:domainOf(item.url),favicon:item.favicon||faviconFor(item.url),indexedAt:now(),lastVisitedAt:item.visitedAt||now(),source:"history"});}
  indexBookmarks(bookmarks=[]){for(const b of bookmarks){if(!b.url||!isSafeURL(b.url))continue;const text=normalizeWhitespace(`${b.title||""} ${b.url} ${domainOf(b.url)} bookmark закладка`);this.upsertPage({url:b.url,title:b.title||b.url,description:`Закладка Nexus: ${domainOf(b.url)}`,text,tokens:tokenize(text),domain:domainOf(b.url),favicon:b.favicon||faviconFor(b.url),indexedAt:now(),lastVisitedAt:b.createdAt||now(),source:"bookmark"},false);}this.save();}
  rebuildFrom({history=[],bookmarks=[]}={}){this.pages=[];this.seedDefaults();for(const h of history)this.addVisitedPage(h);this.indexBookmarks(bookmarks);this.lastRebuildAt=now();this.save();return this.status();}
  clear(){this.pages=[];this.errors=[];this.seedDefaults();this.save();return this.status();}
  addManualSite(url){let normalized=String(url||"").trim();if(!normalized)throw new Error("URL is empty");if(!/^https?:\/\//i.test(normalized))normalized="https://"+normalized;normalized=new URL(normalized).toString();if(!isSafeURL(normalized))throw new Error("URL blocked by safe filter");if(!this.manualSites.includes(normalized))this.manualSites.push(normalized);this.save();return normalized;}
  async crawl(seedUrl, options={}) {
    const normalized = this.addManualSite(seedUrl);
    const maxDepth = Math.max(0, Math.min(Number(options.maxDepth ?? 1), 3));
    const maxPages = Math.max(1, Math.min(Number(options.maxPages ?? 50), 250));
    const timeout = Math.max(2000, Math.min(Number(options.timeout ?? 9000), 30000));
    const sameDomain = options.sameDomain !== false;
    const seedDomain = domainOf(normalized);
    this.indexing = true;
    const queue = [{ url: normalized, depth: 0 }];
    const seen = new Set();
    let indexed = 0;
    while (queue.length && indexed < maxPages) {
      const { url, depth } = queue.shift();
      if (seen.has(url) || !isSafeURL(url)) continue;
      seen.add(url);
      if (sameDomain && domainOf(url) !== seedDomain) continue;
      try {
        const html = await fetchText(url, timeout);
        const page = parseHTML(url, html, depth === 0 ? "manual" : "crawler");
        this.upsertPage(page, false);
        indexed++;
        if (depth < maxDepth) {
          for (const link of extractLinks(html, url)) {
            if (seen.has(link) || !isSafeURL(link)) continue;
            if (sameDomain && domainOf(link) !== seedDomain) continue;
            queue.push({ url: link, depth: depth + 1 });
            if (queue.length + indexed >= maxPages * 3) break;
          }
        }
      } catch (err) {
        this.errors.unshift({ url, message: err.message || String(err), at: now() });
        this.errors = this.errors.slice(0, 300);
      }
    }
    this.indexing = false;
    this.save();
    return { indexed, status: this.status(), errors: this.errors.slice(0, 10) };
  }
  search(query,limit=30,section="all"){const q=normalizeWhitespace(query);const queryTokens=tokenize(q);const max=Math.max(1,Math.min(Number(limit)||30,100));if(!queryTokens.length){return(SAFE_DIRECTORIES[section]||SAFE_DIRECTORIES.all).slice(0,max).map(item=>directoryResult(item,"",section));}const scored=[];for(const page of this.pages){if(!isSafeURL(page.url)||!sectionMatches(page,section))continue;const score=scorePage(page,queryTokens,q);if(score>0)scored.push({title:page.title||page.url,url:page.url,domain:page.domain||domainOf(page.url),description:page.description||"",snippet:buildSnippet(page.text||page.description||page.title||page.url,queryTokens),favicon:page.favicon||faviconFor(page.url),source:page.source||"index",score:Math.round(score*100)/100,indexedAt:page.indexedAt||null,lastVisitedAt:page.lastVisitedAt||null,safe:true});}
    const dirs=(SAFE_DIRECTORIES[section]||SAFE_DIRECTORIES.all).map(item=>directoryResult(item,q,section)).filter(item=>{const text=`${item.title} ${item.url} ${item.description}`.toLowerCase();return section!=="all"||queryTokens.some(t=>text.includes(t));});
    const ext=externalLinks(q,section).filter(item=>isSafeURL(item.url)).map(item=>({...directoryResult(item,q,section),score:8}));
    const seen=new Set();const combined=[...scored,...dirs,...ext].filter(item=>{if(!item.url||seen.has(item.url))return false;seen.add(item.url);return true;});combined.sort((a,b)=>b.score-a.score);return combined.slice(0,max);}
  status(){const bySource={};for(const p of this.pages){for(const part of String(p.source||"index").split("+"))bySource[part]=(bySource[part]||0)+1;}return{ok:true,port:this.port,pages:this.pages.length,manualSites:this.manualSites,bySource,indexing:this.indexing,lastRebuildAt:this.lastRebuildAt,errors:this.errors.slice(0,10)};}
  pagesList(){return this.pages.map(p=>({url:p.url,title:p.title,domain:p.domain,source:p.source,indexedAt:p.indexedAt,lastVisitedAt:p.lastVisitedAt}));}

  // ========================================================================
  // СТРОГИЙ CORS — раньше был Allow-Origin: * (любой сайт мог читать историю
  // пользователя через 127.0.0.1:17654). Теперь проверяем Origin: разрешаем
  // только file:// (внутренние страницы Nexus) и null.
  // ========================================================================
  isAllowedOrigin(req) {
    const origin = String(req.headers.origin || "").trim();
    if (!origin) return true; // не-браузерные запросы (curl, Postman)
    if (origin === "null") return true; // file:// страницы
    if (origin.startsWith("file://")) return true;
    // Никаких http(s)://origin — даже 127.0.0.1
    return false;
  }
  corsHeaders(req) {
    const origin = String(req.headers.origin || "").trim();
    const allow = (origin === "null" || origin.startsWith("file://")) ? origin : "null";
    return {
      "Access-Control-Allow-Origin": allow,
      "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Vary": "Origin"
    };
  }

  // ========================================================================
  // ENDPOINT /api/upload-image — сохраняет dataURL в локальный каталог
  // uploads/, возвращает локальный URL. Раньше эндпоинт отсутствовал
  // (фронт падал с 404) и был hardcoded чужой IP.
  // ========================================================================
  async saveUpload(payload) {
    if (!this.uploadsDir) throw new Error("uploads dir not configured");
    const name = String(payload.name || "image").replace(/[^\w.-]+/g, "_").slice(0, 64);
    const type = String(payload.type || "image/png");
    const dataUrl = String(payload.dataUrl || "");
    const m = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
    if (!m) throw new Error("invalid dataUrl");
    const ext = (type.split("/")[1] || "png").replace(/[^a-z0-9]/gi, "").slice(0, 6) || "png";
    const id = Date.now().toString(36) + Math.random().toString(16).slice(2, 8);
    const filename = `${id}-${name}.${ext}`;
    const full = path.join(this.uploadsDir, filename);
    fs.writeFileSync(full, Buffer.from(m[2], "base64"));
    return { ok: true, url: `file://${full}`, path: full };
  }

  startServer(callbacks={}) {
    if (this.server) return this.server;
    if (callbacks.uploadsDir) this.uploadsDir = callbacks.uploadsDir;
    this.server = http.createServer(async (req, res) => {
      try {
        await this.handleRequest(req, res, callbacks);
      } catch (err) {
        sendJSON(res, 500, { ok: false, error: err.message || String(err) });
      }
    });
    // Только 127.0.0.1 — никаких внешних интерфейсов
    this.server.listen(this.port, "127.0.0.1");
    return this.server;
  }

  async handleRequest(req,res,callbacks){
    const parsed = new URL(req.url, `http://127.0.0.1:${this.port}`);
    const method = req.method || "GET";

    // CORS preflight + проверка origin
    if (method === "OPTIONS") {
      const h = this.corsHeaders(req);
      res.writeHead(204, h);
      res.end();
      return;
    }
    if (!this.isAllowedOrigin(req)) {
      sendJSON(res, 403, { ok: false, error: "Forbidden origin" });
      return;
    }

    if (method === "GET" && parsed.pathname === "/api/status") return sendJSON(res, 200, this.status(), this.corsHeaders(req));
    if (method === "GET" && parsed.pathname === "/api/index/pages") return sendJSON(res, 200, { ok: true, pages: this.pagesList() }, this.corsHeaders(req));
    if (method === "GET" && parsed.pathname === "/api/search") {
      const q = parsed.searchParams.get("q") || "";
      const limit = Number(parsed.searchParams.get("limit") || 30);
      const section = parsed.searchParams.get("section") || "all";
      return sendJSON(res, 200, { ok: true, query: q, section, results: this.search(q, limit, section), status: this.status() }, this.corsHeaders(req));
    }
    if (method === "POST" && parsed.pathname === "/api/index/add-site") {
      const body = await readBody(req);
      const added = this.addManualSite(body.url);
      const result = body.crawl === false ? { indexed: 0, status: this.status() } : await this.crawl(added, body);
      callbacks.onIndexChanged && callbacks.onIndexChanged();
      return sendJSON(res, 200, { ok: true, added, result }, this.corsHeaders(req));
    }
    if (method === "POST" && parsed.pathname === "/api/index/rebuild") {
      const status = this.rebuildFrom({ history: callbacks.getHistory ? callbacks.getHistory() : [], bookmarks: callbacks.getBookmarks ? callbacks.getBookmarks() : [] });
      callbacks.onIndexChanged && callbacks.onIndexChanged();
      return sendJSON(res, 200, { ok: true, status }, this.corsHeaders(req));
    }
    if (method === "POST" && parsed.pathname === "/api/index/clear") {
      const status = this.clear();
      callbacks.onIndexChanged && callbacks.onIndexChanged();
      return sendJSON(res, 200, { ok: true, status }, this.corsHeaders(req));
    }
    if (method === "POST" && parsed.pathname === "/api/upload-image") {
      const body = await readBody(req);
      const result = await this.saveUpload(body);
      return sendJSON(res, 200, result, this.corsHeaders(req));
    }
    sendJSON(res, 404, { ok: false, error: "Not found" }, this.corsHeaders(req));
  }
}

function sendJSON(res, code, data, extraHeaders = {}) {
  const body = JSON.stringify(data);
  const headers = {
    "Content-Type": "application/json; charset=utf-8",
    ...extraHeaders
  };
  res.writeHead(code, headers);
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", chunk => {
      data += chunk;
      if (data.length > 25_000_000) req.destroy(new Error("Body too large"));
    });
    req.on("end", () => {
      if (!data) return resolve({});
      try { resolve(JSON.parse(data)); } catch (err) { reject(err); }
    });
    req.on("error", reject);
  });
}

module.exports = { NexusSearchEngine, NovaSearchEngine: NexusSearchEngine, DEFAULT_PORT, parseHTML, tokenize, domainOf, faviconFor };
