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
