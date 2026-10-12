'use strict';

const STOP = new Set(('und oder der die das ein eine einer eines einem den dem des im in am an auf aus bei mit für von vom zum zur über unter nach vor als ist sind wird werden wir sie ihr ihre uns ich the and or of a an to for from with on at by is are be our your you this that these those website web home page kontakt kontaktieren willkommen angebot leistungen service services über uns unsere ihr ihre und').split(/\s+/));

function norm(value) {
  return String(value || '').toLocaleLowerCase('de-CH')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ').trim();
}
function tokens(value) {
  return norm(value).split(/\s+/).filter(t => t.length > 2 && !STOP.has(t));
}
function fallbackClassification(text, industries) {
  const normalized = norm(text);
  const words = new Set(tokens(text));
  const candidates = (Array.isArray(industries) ? industries : [])
    .filter(x => x && typeof x.id === 'string' && typeof x.name === 'string')
    .slice(0, 500);
  if (!candidates.length) return { id: '', confidence: 0, method: 'fallback', evidence: [] };

  const scored = candidates.map(item => {
    const name = norm(item.name);
    const category = norm(item.category);
    const nameTokens = tokens(item.name);
    let score = 0;
    const evidence = [];
    if (name && normalized.includes(name)) { score += 12 + Math.min(name.length, 18) / 3; evidence.push('Branchenbezeichnung im Website-Text'); }
    for (const token of nameTokens) {
      if (words.has(token)) score += token.length >= 7 ? 2.5 : 1.2;
    }
    const categoryTokens = tokens(item.category);
    let categoryHits = 0;
    for (const token of categoryTokens) if (words.has(token)) categoryHits++;
    if (categoryHits) { score += Math.min(categoryHits, 2); evidence.push('Hinweise aus der Hauptkategorie'); }
    // Common, cross-industry concepts support catalog coverage without one-off branch rules.
    const families = [
      [['arzt','zahnarzt','medizin','klinik','praxis','therapie','patient'], ['medizin','arztpraxis','zahnarzt','physiotherapie','psychotherapie','dentalhygiene','augenarzt','kinderarzt','gynakologie','dermatologie','ergotherapie','logopadie']],
      [['bau','handwerk','sanitar','heizung','maler','schreiner','dach','elektro','garten','renovation'], ['handwerk','bau','sanitar','heizung','elektroinstallationen','maler','gipser','schreinerei','gartenbau','dachdecker']],
      [['restaurant','essen','menu','speisekarte','catering','pizza','cafe','bar','take away'], ['essen','gastronomie','restaurant','cafe','catering','pizzeria','take away','backerei']],
      [['auto','garage','fahrzeug','motorboot','boot','fahrschule','transport'], ['mobilitat','fahrzeuge','autogarage','bootsfahrschule','motorbootsfahrschule','fahrschule','transport']],
      [['software','computer','it','programmierung','digital','webagentur','hosting'], ['it','softwareentwicklung','webagentur','computerladen','telekommunikation']],
      [['immobilien','makler','verwaltung','miete','verkauf'], ['immobilienmakler','immobilienverwaltung','immobilien']],
      [['hund','tier','pferd','tierarzt','haustier'], ['tier','natur','tierarztpraxis','hundeschule','tierpflege']],
      [['yoga','pilates','fitness','training','sport','tanz'], ['freizeit','bildung','sport','yoga studio','pilates studio','fitnessstudio','personal training','tanzschule']],
      [['coiffeur','friseur','haar','kosmetik','hautpflege','nagel','beauty'], ['coiffeur','kosmetikstudio','kosmetik','barbershop','nagelstudio']],
      [['steuer','treuhand','buchhaltung','anwalt','notar','versicherung','finanz'], ['beratung','dienstleistungen','treuhandburo','buchhaltung','steuerberatung','anwaltsburo','notariat','finanzberatung']]
    ];
    const familyHit = families.find(([needles]) => needles.some(n => normalized.includes(norm(n))));
    if (familyHit) {
      const aliases = familyHit[1].map(norm);
      if (aliases.some(a => name.includes(a) || category.includes(a))) score += 4;
    }
    return { item, score, evidence };
  }).sort((a,b) => b.score-a.score);
  const best = scored[0], second = scored[1];
  const hasSignal = best && best.score >= 3;
  return {
    id: hasSignal ? best.item.id : '',
    name: hasSignal ? best.item.name : '',
    confidence: hasSignal ? Math.min(0.72, 0.3 + best.score / 35) : 0,
    method: 'fallback',
    evidence: hasSignal ? best.evidence : [],
    alternatives: scored.slice(1,4).filter(x=>x.score>0).map(x=>({id:x.item.id,name:x.item.name,score:x.score})),
    needsReview: !hasSignal || !second || best.score-second.score < 2
  };
}

async function classifyWebsite({ text, industries }) {
  const key = process.env.OPENAI_API_KEY;
  const fallback = fallbackClassification(text, industries);
  if (!key) return fallback;
  const catalog = (Array.isArray(industries) ? industries : [])
    .filter(x => x && typeof x.id === 'string' && typeof x.name === 'string')
    .slice(0, 500)
    .map(x => ({ id: x.id, name: x.name, category: x.category || '' }));
  if (!catalog.length) return fallback;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      signal: controller.signal,
      headers: { 'Authorization': 'Bearer ' + key, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: process.env.OPENAI_CLASSIFIER_MODEL || 'gpt-4o-mini',
        temperature: 0,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: 'Ordne eine Schweizer Unternehmenswebsite genau einem Eintrag aus dem mitgelieferten Branchenkatalog zu. Nutze nur IDs aus dem Katalog. Entscheide anhand der tatsächlichen Haupttätigkeit, nicht anhand von Werbe- oder Partnerlogos. Wenn Belege schwach sind, gib id als leeren String zurück. Erfinde keine Fakten. Antworte nur als JSON mit id, confidence (0 bis 1), evidence (maximal 3 kurze Belege), alternatives (maximal 3 Katalog-IDs).' },
          { role: 'user', content: JSON.stringify({ catalog, websiteText: String(text || '').slice(0, 12000) }) }
        ]
      })
    });
    if (!response.ok) return fallback;
    const data = await response.json();
    const raw = data.choices?.[0]?.message?.content;
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    const selected = catalog.find(x => x.id === parsed.id);
    if (!selected || !Number.isFinite(Number(parsed.confidence))) return fallback;
    return {
      id: selected.id,
      name: selected.name,
      confidence: Math.max(0, Math.min(1, Number(parsed.confidence))),
      method: 'openai',
      evidence: Array.isArray(parsed.evidence) ? parsed.evidence.slice(0,3).map(x=>String(x).slice(0,180)) : [],
      alternatives: Array.isArray(parsed.alternatives) ? parsed.alternatives.slice(0,3).map(id=>catalog.find(x=>x.id===id)).filter(Boolean).map(x=>({id:x.id,name:x.name})) : [],
      needsReview: Number(parsed.confidence) < 0.65
    };
  } catch {
    return fallback;
  } finally {
    clearTimeout(timer);
  }
}

module.exports = { classifyWebsite, fallbackClassification };
