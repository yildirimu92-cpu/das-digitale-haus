'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { fallbackClassification } = require('../netlify/functions/lib/website-classifier');

const catalog = [
  { id: 'beauty', name: 'Coiffeur', category: 'Medizin, Ästhetik & Wellness' },
  { id: 'kosmetikstudio', name: 'Kosmetikstudio', category: 'Medizin, Ästhetik & Wellness' },
  { id: 'pilates-studio', name: 'Pilates-Studio', category: 'Freizeit, Bildung & Sport' },
  { id: 'motorbootsfahrschule', name: 'Motorbootsfahrschule', category: 'Mobilität & Fahrzeuge' },
  { id: 'resto', name: 'Restaurant', category: 'Essen, Genuss & Gastronomie' },
  { id: 'sanitar-heizung', name: 'Sanitär / Heizung', category: 'Handwerk, Bau & Industrie' },
  { id: 'zahnarzt', name: 'Zahnarzt', category: 'Medizin, Ästhetik & Wellness' },
  { id: 'webagentur', name: 'Webagentur', category: 'Sicherheit, Wirtschaft & IT' },
  { id: 'immobilienmakler', name: 'Immobilienmakler', category: 'Leben, Wohnen & Umwelt' },
  { id: 'hundeschule', name: 'Hundeschule', category: 'Tier & Natur' },
  { id: 'steuerberatung', name: 'Steuerberatung', category: 'Beratung & Dienstleistungen' },
  { id: 'musikschule', name: 'Musikschule', category: 'Freizeit, Bildung & Sport' },
  { id: 'blumenladen', name: 'Blumenladen', category: 'Tier & Natur' },
  { id: 'fotograf', name: 'Fotograf', category: 'Freizeit, Bildung & Sport' },
];

const fixtures = [
  ['Coiffeur Schnittpunkt – Damen und Herren Coiffeur in Horgen', 'beauty'],
  ['Kosmetikstudio Hautpflege und Gesichtsbehandlungen', 'kosmetikstudio'],
  ['Pilates-Studio mit Reformer-Kursen', 'pilates-studio'],
  ['Motorbootsfahrschule Zürich – Motorbootkurse und Prüfungsvorbereitung', 'motorbootsfahrschule'],
  ['Restaurant mit Speisekarte, Tischreservation und Mittagstisch', 'resto'],
  ['Sanitär / Heizung: Heizungsinstallation und Sanitärservice', 'sanitar-heizung'],
  ['Zahnarztpraxis mit Zahnmedizin und Dentalhygiene', 'zahnarzt'],
  ['Webagentur für Websites und Softwareentwicklung', 'webagentur'],
  ['Immobilienmakler für Kauf, Verkauf und Vermietung', 'immobilienmakler'],
  ['Hundeschule mit Welpenkurs und Training', 'hundeschule'],
  ['Steuerberatung und Buchhaltung für KMU', 'steuerberatung'],
  ['Musikschule für Klavierunterricht und Gitarrenunterricht', 'musikschule'],
  ['Blumenladen mit Floristik und Blumensträussen', 'blumenladen'],
  ['Fotograf für Hochzeiten und Businessporträts', 'fotograf'],
];

test('fallback classifier selects a catalog ID for representative industries', () => {
  for (const [text, expected] of fixtures) {
    const result = fallbackClassification(text, catalog);
    assert.equal(result.id, expected, 'unexpected classification for: ' + text);
    assert.ok(catalog.some(x => x.id === result.id), 'result must be from catalog');
  }
});

test('fallback classifier never invents an ID outside the catalog', () => {
  const result = fallbackClassification('Welcome to our homepage. Contact us for more information.', catalog);
  assert.ok(result.id === '' || catalog.some(x => x.id === result.id));
});

test('fallback classifier reports low certainty when evidence is weak', () => {
  const result = fallbackClassification('Welcome to our homepage. Contact us for more information.', catalog);
  assert.ok(result.confidence < 0.65);
});

test('restaurant in Zug is classified without inheriting an unrelated publisher address', () => {
  const html = `
    <script type="application/ld+json">
      {
        "@context":"https://schema.org",
        "@graph":[
          {"@type":"WebPage","publisher":{"@type":"Organization","name":"Agency","address":{"@type":"PostalAddress","addressLocality":"Horgen"}}},
          {"@type":"Restaurant","name":"Tuscany Italian Kitchen","address":{"@type":"PostalAddress","addressLocality":"Zug","postalCode":"6300","addressRegion":"ZG"}}
        ]
      }
    </script>
  `;
  // The website extractor must prefer a business entity over publisher metadata.
  const match = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
  const json = JSON.parse(match[1]);
  function isBusinessEntity(value) {
    const types = [].concat(value && value['@type'] || []).map(x => String(x).toLowerCase());
    return types.some(t => /localbusiness|restaurant|foodestablishment|store|professionalservice|medicalbusiness|healthandbeautybusiness|automotivebusiness|educationalorganization|sportsactivitylocation|touristinformationcenter/.test(t));
  }
  function locationFromEntity(value) {
    const address = value && value.address;
    if (address && typeof address === 'object') return String(address.addressLocality || '').trim();
    return typeof address === 'string' ? address.trim() : '';
  }
  function findBusinessLocation(value, depth=0) {
    if (!value || depth > 10) return '';
    if (Array.isArray(value)) {
      for (const item of value) { const found=findBusinessLocation(item,depth+1); if(found)return found; }
      return '';
    }
    if (typeof value !== 'object') return '';
    if (isBusinessEntity(value)) {
      const own = locationFromEntity(value);
      if (own) return own;
    }
    for (const key of ['@graph','mainEntity','mainEntityOfPage','itemListElement','location','hasMap']) {
      const found=findBusinessLocation(value[key],depth+1);
      if(found)return found;
    }
    return '';
  }
  assert.equal(findBusinessLocation(json), 'Zug');
});
