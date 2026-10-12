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
    const sourceText = [title, description, ...headings, text].filter(Boolean).join(' ').replace(/\\s+/g,' ').trim();
    const lower = sourceText.toLocaleLowerCase('de-CH');
    const rules = [
      {terms:['diodenlaser','laserhaarentfernung','laser-haarentfernung','haarentfernung','dauerhafte haarentfernung','ipl'], svc:['Haarentfernung','Diodenlaser'], kw:['Haarentfernung','Diodenlaser','Laserhaarentfernung']},
      {terms:['zahnbleaching','bleaching','zahnaufhellung','whitening'], svc:['Zahnbleaching'], kw:['Zahnbleaching','Zahnaufhellung']},
      {terms:['kosmetik','kosmetikinstitut','gesichtsbehandlung','beauty'], svc:['Kosmetik'], kw:['Kosmetik','Kosmetikstudio','Beauty']},
      {terms:['gesichtsbehandlung','facial'], svc:['Gesichtsbehandlung'], kw:['Gesichtsbehandlung']},
      {terms:['maniküre','manicure','nagelstudio','nageldesign','gelnägel'], svc:['Maniküre','Nageldesign'], kw:['Nagelstudio','Nageldesign']},
      {terms:['pediküre','pedicure','fusspflege','fusspflege','medizinische fusspflege'], svc:['Pediküre','Fusspflege'], kw:['Pediküre','Fusspflege']},
      {terms:['wimpernverlängerung','lashlifting','wimpernlifting'], svc:['Wimpernbehandlungen'], kw:['Wimpernverlängerung','Lashlifting']},
      {terms:['massage','klassische massage','sportmassage'], svc:['Massage'], kw:['Massage','Sportmassage']},
      {terms:['coiffeur','friseur','haarschnitt','balayage','haarfarbe','haarfärben'], svc:['Haarschnitt','Färben'], kw:['Coiffeur','Friseur','Balayage']},
      {terms:['zahnarzt','zahnmedizin','zahnklinik'], svc:['Zahnmedizin'], kw:['Zahnarzt','Zahnmedizin']},
      {terms:['physiotherapie','physio','rehabilitation'], svc:['Physiotherapie'], kw:['Physiotherapie','Physio']},
      {terms:['restaurant','mittagessen','speisekarte','menü'], svc:['Restaurant'], kw:['Restaurant','Mittagsmenü']},
      {terms:['take-away','takeaway','lieferservice'], svc:['Take-away','Lieferservice'], kw:['Take-away','Lieferservice']},
      {terms:['malerarbeiten','malergeschäft','malerbetrieb'], svc:['Malerarbeiten'], kw:['Maler','Malerarbeiten']},
      {terms:['sanitär','sanitaer','heizung','wärmepumpe'], svc:['Sanitär- und Heizungsarbeiten'], kw:['Sanitär','Heizung','Wärmepumpe']},
      {terms:['gartenpflege','gartenbau','gartenunterhalt'], svc:['Gartenpflege'], kw:['Gartenpflege','Gartenbau']},
      {terms:['garage','autowerkstatt','fahrzeugservice'], svc:['Fahrzeugservice'], kw:['Garage','Autowerkstatt']}
    ];
    const services = [], keywords = [];
    for (const rule of rules) {
      if (rule.terms.some(term => lower.includes(term))) {
        for (const item of rule.svc) if (!services.includes(item)) services.push(item);
        for (const item of rule.kw) if (!keywords.includes(item)) keywords.push(item);
      }
    }
    // Retain other recognizable industry terms as search terms.
    const extraTerms = ['coiffeur','friseur','kosmetik','massage','restaurant','café','cafe','sanitär','heizung','maler','gipser','schreinerei','dachdecker','gartenbau','treuhand','zahnarzt','physiotherapie','garage','autowerkstatt','hotel','anwalt','architekt','reinigung','umzug'];
    for (const term of extraTerms) if (lower.includes(term) && !keywords.includes(term)) keywords.push(term);
    const inferredIndustry = rules.find(rule => rule.terms.some(term => lower.includes(term)));
    // Detect a public business logo from structured data or image markup.
    function absolutePublicImage(raw) {
      try {
        const x = new URL(String(raw || '').replace(/&amp;/g, '&'), u);
        if (!['http:', 'https:'].includes(x.protocol) || x.username || x.password) return '';
        return x.href;
      } catch { return ''; }
    }
    let logoUrl = '';
    // Prefer Organization/LocalBusiness JSON-LD logo values.
    for (const m of html.matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
      try {
        const parsed = JSON.parse(m[1].trim());
        const nodes = Array.isArray(parsed) ? parsed : [parsed];
        const stack = [...nodes];
        while (stack.length && !logoUrl) {
          const node = stack.shift();
          if (!node || typeof node !== 'object') continue;
          if (node.logo) {
            const candidate = typeof node.logo === 'string' ? node.logo : (node.logo.url || node.logo.contentUrl || '');
            logoUrl = absolutePublicImage(candidate);
          }
          if (Array.isArray(node['@graph'])) stack.push(...node['@graph']);
        }
      } catch {}
      if (logoUrl) break;
    }
    // Fallback to image tags whose alt, class, id or src suggests a logo.
    if (!logoUrl) {
      for (const m of html.matchAll(/<img\b[^>]*>/gi)) {
        const tag = m[0];
        if (!/(?:alt|class|id|src)=["'][^"']*logo[^"']*["']/i.test(tag)) continue;
        const src = (tag.match(/\bsrc=["']([^"']+)["']/i) || [])[1];
        logoUrl = absolutePublicImage(src);
        if (logoUrl) break;
      }
    }
    // Last resort: social preview image, clearly only a fallback.
    if (!logoUrl) {
      const og = first(html, /<meta\b[^>]*property=["']og:image["'][^>]*content=["']([^"']*)["'][^>]*>/i) ||
        first(html, /<meta\b[^>]*content=["']([^"']*)["'][^>]*property=["']og:image["'][^>]*>/i);
      logoUrl = absolutePublicImage(og);
    }
    const observations = { title, description, headings:headings.slice(0,12), hasPhone, hasEmail, hasContact, forms, hasBooking, hasSocial, logoUrl, textExcerpt:text.slice(0,5000) };
    return { statusCode:200, headers, body:JSON.stringify({ok:true,url:u.href,firma:'',branche:'andere',dienstleistungen:services.slice(0,20),stichworte:keywords.slice(0,20),orte:[],logoUrl,beobachtungen:hints,observations,source:'automatischer HTML-Check',checkedAt:new Date().toISOString()}) };
  } catch (e) {
    return { statusCode:400, headers, body:JSON.stringify({error:e.name==='AbortError'?'Die Website antwortet zu langsam. Bitte später erneut versuchen.':(e.message||'Website-Check fehlgeschlagen.')}) };
  }
};
