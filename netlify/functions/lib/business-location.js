'use strict';

// Resolve only locations attached to a recognizable business entity.
// Generic WebPage/Organization publisher metadata can belong to the web agency,
// so it must never silently become the customer's business location.
function isBusinessEntity(value) {
  const types = [].concat(value && value['@type'] || []).map(x => String(x).toLowerCase());
  return types.some(t => /localbusiness|restaurant|foodestablishment|store|professionalservice|medicalbusiness|healthandbeautybusiness|automotivebusiness|educationalorganization|sportsactivitylocation|touristinformationcenter/.test(t));
}

function locationFromEntity(value) {
  if (!value || typeof value !== 'object') return '';
  const a = value.address;
  if (a && typeof a === 'object') {
    const locality = String(a.addressLocality || '').trim();
    const postal = String(a.postalCode || '').trim();
    const region = String(a.addressRegion || '').trim();
    const country = String(a.addressCountry && (a.addressCountry.name || a.addressCountry) || '').trim();
    if (locality) return locality;
    const formatted = [a.streetAddress, postal, region, country].filter(Boolean).join(', ');
    if (formatted) return formatted;
  }
  if (typeof a === 'string' && a.trim()) return a.trim();
  return '';
}

function findBusinessLocation(value, depth = 0) {
  if (!value || depth > 10) return '';
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findBusinessLocation(item, depth + 1);
      if (found) return found;
    }
    return '';
  }
  if (typeof value !== 'object') return '';
  if (isBusinessEntity(value)) {
    const own = locationFromEntity(value);
    if (own) return own;
  }
  for (const key of ['@graph', 'mainEntity', 'mainEntityOfPage', 'itemListElement', 'location', 'hasMap']) {
    const found = findBusinessLocation(value[key], depth + 1);
    if (found) return found;
  }
  return '';
}

module.exports = { findBusinessLocation, isBusinessEntity, locationFromEntity };
