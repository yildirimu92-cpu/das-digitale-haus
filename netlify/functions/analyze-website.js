const dns = require('node:dns/promises');
const net = require('node:net');

function isPrivate(ip) {
  if (net.isIPv4(ip)) {
    const p = ip.split('.').map(Number);
    return p[0] === 10 || p[0] === 127 || p[0] === 0 ||
      (p[0] === 169 && p[1] === 254) ||
      (p[0] === 172 && p[1] >= 16 && p[1] <= 31) ||
      (p[0] === 192 && p[1] === 168) ||
      (p[0] === 100 && p[1] >= 64 && p[1] <= 127) ||
      p[0] >= 224;
  }
  if (net.isIPv6(ip)) {
    const x = ip.toLowerCase();
    return x === '::1' || x === '::' || x.startsWith('fc') ||
      x.startsWith('fd') || x.startsWith('fe80:') || x.startsWith('::ffff:');
  }
  return true;
}
async function publicUrl(raw) {
  let u;
  try { u = new URL(raw); } catch { throw new Error('Bitte eine gültige Website-Adresse eingeben.'); }
  if (!['http:', 'https:'].includes(u.protocol) || u.username || u.password)
    throw new Error('Nur öffentliche HTTP- oder HTTPS-Websites sind erlaubt.');
  if (u.hostname === 'localhost' || u.hostname.endsWith('.localhost') || u.hostname.endsWith('.local'))
    throw new Error('Lokale Adressen sind nicht erlaubt.');
  const records = await dns.lookup(u.hostname, { all: true, verbatim: true }).catch(() => []);
  if (!records.length || records.some(x => isPrivate(x.address)))
    throw new Error('Die Website ist nicht als öffentlich erreichbare Adresse verifizierbar.');
  return u;
}
function cleanHtml(s) {
  return String(s || '')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<(script|style|noscript|svg|iframe)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, ' ')
    .replace(/<(br|\/p|\/div|\/h[1-6]|\/li|\/section|\/article|\/footer|\/header)\b[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/&amp;/gi, '&').replace(/&quot;|&#34;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'").replace(/&lt;/gi, '<').replace(/&gt;/gi, '>')
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Math.min(65535, Number(n))))
    .replace(/\s+/g, ' ').trim();
}
function first(html, re) { const m = html.match(re); return m ? cleanHtml(m[1]) : ''; }
function all(html, re, max=30) { const out=[]; let m; while ((m=re.exec(html)) && out.length<max) { const t=cleanHtml(m[1]); if(t && !out.includes(t)) out.push(t); } return out; }
exports.handler = async (event) => {
  const headers = { 'Content-Type':'application/json; charset=utf-8', 'Cache-Control':'no-store' };
  if (event.httpMethod !== 'POST') return { statusCode:405, headers, body:JSON.stringify({error:'Bitte POST verwenden.'}) };
  try {
    const body = JSON.parse(event.body || '{}');
    let u = await publicUrl(String(body.url || ''));
    let response, html;
    for (let redirects=0; redirects<=3; redirects++) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 9000);
      try {
        response = await fetch(u.href, { signal:controller.signal, redirect:'manual', headers:{'User-Agent':'DasDigitaleHaus-WebsiteCheck/1.0 (+public business website audit)','Accept':'text/html,application/xhtml+xml'} });
      } finally { clearTimeout(timer); }
      if ([301,302,303,307,308].includes(response.status)) {
        const loc = response.headers.get('location');
        if (!loc || redirects===3) throw new Error('Zu viele oder ungültige Weiterleitungen.');
        u = await publicUrl(new URL(loc, u).href); continue;
      }
      if (!response.ok) throw new Error('Website antwortet mit HTTP '+response.status+'.');
      const type = response.headers.get('content-type') || '';
      if (!type.includes('text/html') && !type.includes('application/xhtml+xml')) throw new Error('Die Adresse liefert keine HTML-Webseite.');
      const reader = response.body.getReader(); let bytes=0, chunks=[];
      while (true) {
        const {done,value}=await reader.read(); if(done) break;
        bytes += value.byteLength; if(bytes > 1200000) { await reader.cancel(); break; }
        chunks.push(value);
      }
      html = Buffer.concat(chunks.map(x=>Buffer.from(x))).toString('utf8');
      break;
    }
    const title = first(html, /<title\b[^>]*>([\s\S]*?)<\/title>/i);
    const description = first(html, /<meta\b[^>]*(?:name|property)=["'](?:description|og:description)["'][^>]*content=["']([^"']*)["'][^>]*>/i) ||
      first(html, /<meta\b[^>]*content=["']([^"']*)["'][^>]*(?:name|property)=["'](?:description|og:description)["'][^>]*>/i);
    const headings = all(html, /<h[1-3]\b[^>]*>([\s\S]*?)<\/h[1-3]\s*>/gi, 20);
    const text = cleanHtml(html).slice(0, 25000);
    const links = [...html.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a\s*>/gi)].slice(0,500);
    const hrefs = links.map(m=>({href:m[1],text:cleanHtml(m[2]).toLowerCase()}));
    const forms = (html.match(/<form\b/gi)||[]).length;
    const hasPhone = /(?:tel:|\+41\s?\(?\d|0\d{2}[\s./-]?\d{3})/i.test(html+' '+text);
    const hasEmail = /mailto:|[\w.+-]+@[\w.-]+\.[a-z]{2,}/i.test(html+' '+text);
    const hasBooking = /termin buchen|online buchen|reservation|reservieren|appointment|booking/i.test(text);
    const hasSocial = hrefs.some(x=>/instagram\.com|facebook\.com|linkedin\.com|tiktok\.com|youtube\.com/i.test(x.href));
    const hasContact = hrefs.some(x=>/kontakt|contact|anfrage/i.test(x.href+' '+x.text)) || forms>0;
    const hints = [];
    hints.push(title ? 'Seitentitel vorhanden: „'+title.slice(0,180)+'“.' : 'Kein Seitentitel im HTML gefunden.');
    hints.push(description ? 'Meta-Beschreibung vorhanden.' : 'Keine Meta-Beschreibung im HTML gefunden.');
    hints.push(headings.length ? headings.length+' Überschriften (H1–H3) erkannt.' : 'Keine H1–H3-Überschriften erkannt.');
    hints.push(hasPhone ? 'Telefonnummer oder Telefon-Link erkannt.' : 'Keine Telefonnummer sicher erkannt.');
    hints.push(hasEmail ? 'E-Mail-Adresse oder E-Mail-Link erkannt.' : 'Keine E-Mail-Adresse sicher erkannt.');
    hints.push(hasContact ? 'Kontaktweg oder Formular erkannt.' : 'Kein klarer Kontaktweg/Formular erkannt.');
    hints.push(hasBooking ? 'Hinweise auf Buchung oder Reservation gefunden.' : 'Keine klaren Buchungshinweise gefunden.');
    hints.push(hasSocial ? 'Mindestens ein Social-Media-Link erkannt.' : 'Keine bekannten Social-Media-Links erkannt.');
    // Extract useful business categories and search terms from visible page content.
    // This is deterministic rule-based extraction, not an AI-generated interpretation.
    // Branch-neutral cleanup: prefer concise, business-relevant phrases from metadata
    // and headings; avoid technical artefacts and generic navigation across all industries.
    const contentHtml = html
      .replace(/<(nav|footer|script|style|noscript|svg|iframe|form)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, ' ')
      .replace(/<(?:div|section|aside)\b[^>]*(?:id|class)=["'][^"']*(?:cookie|consent|breadcrumb|navigation|nav-menu|footer|menu|social-icons|share-buttons|tracking|widget|storefront-builder)[^"']*["'][^>]*>[\s\S]*?<\/(?:div|section|aside)\s*>/gi, ' ');
    const contentText = cleanHtml(contentHtml).slice(0, 18000);
    const sourceText = [title, description, ...headings, contentText].filter(Boolean).join(' ').replace(/\s+/g,' ').trim();
    const lower = sourceText.toLocaleLowerCase('de-CH');
    const stopWords = new Set(('und oder der die das ein eine einer eines einem den dem des im in am an auf aus bei mit für von vom zum zur über unter nach vor als ist sind wird werden wir sie ihr ihre uns ich the and or of a an to for from with on at by is are be our your you we this that these those studio near schweiz schweizer schweizerisch angebot kontakt impressum datenschutz cookies home startseite read more learn more find your way questions before you start location contact hours title true false type com artifact wix wixsite wixstores storefront builder powered by all rights reserved privacy policy terms conditions book now').split(/\s+/));
    const technicalRe = /\b(wixpress|wixstores|storefront|builder|artifactid|appdefinitionid|appdata|panoramaoptions|panorama|fingerprint|groupid|javascript|wordpress|shopify|cookie|consent|analytics|tracking|true|false|doctype|html|css|svg|json|title|type|com)\b/i;
    const genericRe = /^(home|home page|menu|navigation|kontakt|contact|contact us|impressum|datenschutz|privacy policy|terms|location|contact & hours|hours|faq|questions before you start|services|our services|welcome|book now|learn more|read more|find your way to begin|title|true|false|type|com|artifact)$/i;
    const normalizeTerm = v => cleanHtml(v).replace(/[|•·]/g,' ').replace(/\s+/g,' ').trim().replace(/[.!?]+$/,'');
    const isUsefulPhrase = phrase => {
      const p=normalizeTerm(phrase);
      if(p.length<3||p.length>65||genericRe.test(p)||technicalRe.test(p)) return false;
      const tokens=p.split(/\s+/);
      if(tokens.length>5) return false;
      const useful=tokens.filter(w=>!stopWords.has(w.toLocaleLowerCase('de-CH'))&&!/^\d+$/.test(w));
      return useful.length>=1;
    };
    const keywordCandidates = [];
    const addKeyword = value => {
      const term=normalizeTerm(value);
      if(!isUsefulPhrase(term)) return;
      const key=term.toLocaleLowerCase('de-CH');
      if(!keywordCandidates.some(x=>x.toLocaleLowerCase('de-CH')===key)) keywordCandidates.push(term);
    };
    // Titles and descriptions are split into meaningful chunks rather than copied wholesale.
    for(const phrase of [title,description,...headings]){
      const cleaned=normalizeTerm(phrase);
      if(!cleaned) continue;
      if(isUsefulPhrase(cleaned)) addKeyword(cleaned);
      cleaned.split(/[|–—:;.!?•·]+/).map(x=>x.trim()).filter(Boolean).forEach(addKeyword);
    }
    const wordCounts = new Map();
    const words = lower.match(/[\p{L}]{4,}/gu) || [];
    for (const rawWord of words) {
      const word=rawWord.toLocaleLowerCase('de-CH').replace(/^-+|-+$/g,'');
      if(word.length<4||stopWords.has(word)||technicalRe.test(word)) continue;
      wordCounts.set(word,(wordCounts.get(word)||0)+1);
    }
    for(const [word] of [...wordCounts.entries()].sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0],'de-CH')).slice(0,10)) addKeyword(word);
    // Service candidates are concise headings with evidence of an offering, not generic slogans.
    const serviceCue=/\b(service|services|angebot|angebote|behandlung|behandlungen|beratung|kurs|kurse|training|lektion|lektionen|session|sessions|package|paket|intro|reformer|tower|pilates|massage|therapie|reparatur|installation|wartung|reinigung|planung|coaching|termin|buchung|catering|menu|menü|zimmer|übernachtung|friseur|kosmetik|facial|treatment|class|classes|group|private|shop|produkte|product|produkt|lieferung|transport|umzug|steuer|treuhand|anwalt|zahnarzt|physio|yoga|fitness|personal training)\b/i;
    const services=[];
    for(const heading of headings){
      const term=normalizeTerm(heading);
      if(!isUsefulPhrase(term)||genericRe.test(term)||!serviceCue.test(term)) continue;
      if(!services.some(x=>x.toLocaleLowerCase('de-CH')===term.toLocaleLowerCase('de-CH'))) services.push(term);
      if(services.length>=12) break;
    }
    const keywords = keywordCandidates.slice(0,16);
    // Accept only logo candidates that are explicitly marked as a logo and hosted
    // on the customer's own website domain. Never use og:image, favicons, avatars,
    // social previews, or third-party platform/vendor assets as a customer logo.
    function absolutePublicImage(raw) {
      try {
        const x = new URL(String(raw || '').replace(/&amp;/g, '&'), u);
        if (!['http:', 'https:'].includes(x.protocol) || x.username || x.password) return '';
        const pageHost = u.hostname.toLowerCase().replace(/^www\./, '');
        const imageHost = x.hostname.toLowerCase().replace(/^www\./, '');
        // Strict by design: same host or a subdomain of the customer's domain only.
        if (imageHost !== pageHost && !imageHost.endsWith('.' + pageHost)) return '';
        if (/^(?:facebook|instagram|linkedin|tiktok|youtube|google|googleusercontent|wix|squarespace|shopify|wordpress|webflow|canva|trustpilot|local\.ch|search\.ch)(?:\.|$)/i.test(imageHost)) return '';
        if (/(?:avatar|favicon|apple-touch-icon|og-image|social-preview|share-image|placeholder|powered-by)/i.test(x.pathname)) return '';
        return x.href;
      } catch { return ''; }
    }
    function logoMarked(tag) {
      // Do not infer "logo" from src alone: asset URLs often contain vendor logos.
      return /(?:alt|class|id|aria-label|data-testid)=["'][^"']*logo[^"']*["']/i.test(tag);
    }
    let logoUrl = '';
    // Highest trust: a logo property attached to an Organization/LocalBusiness entity.
    for (const m of html.matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
      try {
        const parsed = JSON.parse(m[1].trim());
        const stack = Array.isArray(parsed) ? [...parsed] : [parsed];
        while (stack.length && !logoUrl) {
          const node = stack.shift();
          if (!node || typeof node !== 'object') continue;
          const types = Array.isArray(node['@type']) ? node['@type'] : [node['@type']];
          const isBusinessEntity = types.some(type => /organization|localbusiness|professionalservice|store|medicalbusiness|automotivebusiness|foodestablishment/i.test(String(type || '')));
          if (isBusinessEntity && node.logo) {
            const candidate = typeof node.logo === 'string' ? node.logo :
              (node.logo.url || node.logo.contentUrl || (node.logo['@id'] || ''));
            logoUrl = absolutePublicImage(candidate);
          }
          if (Array.isArray(node['@graph'])) stack.push(...node['@graph']);
          if (Array.isArray(node['@list'])) stack.push(...node['@list']);
        }
      } catch {}
      if (logoUrl) break;
    }
    // Fallback only when image markup itself explicitly labels the asset as a logo.
    if (!logoUrl) {
      for (const m of html.matchAll(/<img\b[^>]*>/gi)) {
        const tag = m[0];
        if (!logoMarked(tag)) continue;
        const src = (tag.match(/\b(?:src|data-src|data-lazy-src)=["']([^"']+)["']/i) || [])[1];
        logoUrl = absolutePublicImage(src);
        if (logoUrl) break;
      }
    }
    // Lazy-loaded images are allowed only with explicit logo labeling and a first-party URL.
    if (!logoUrl) {
      for (const m of html.matchAll(/<(?:img|source)\b[^>]*>/gi)) {
        const tag = m[0];
        if (!logoMarked(tag)) continue;
        const src = (tag.match(/\b(?:src|data-src|data-lazy-src|data-original)=["']([^"']+)["']/i) || [])[1];
        logoUrl = absolutePublicImage(src);
        if (logoUrl) break;
      }
    }
    const observations = { title, description, headings:headings.slice(0,12), hasPhone, hasEmail, hasContact, forms, hasBooking, hasSocial, logoUrl, textExcerpt:text.slice(0,5000) };
    return { statusCode:200, headers, body:JSON.stringify({ok:true,url:u.href,firma:'',branche:'andere',dienstleistungen:services.slice(0,20),stichworte:keywords.slice(0,20),orte:[],logoUrl,beobachtungen:hints,observations,source:'automatischer HTML-Check',checkedAt:new Date().toISOString()}) };
  } catch (e) {
    return { statusCode:400, headers, body:JSON.stringify({error:e.name==='AbortError'?'Die Website antwortet zu langsam. Bitte später erneut versuchen.':(e.message||'Website-Check fehlgeschlagen.')}) };
  }
};
