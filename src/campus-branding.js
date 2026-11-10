import niitLogo from './assets/universities/niit-university.png';

// Add official, locally hosted artwork here as new real campuses are onboarded.
// Exact names avoid assigning an unrelated institution's logo to a similar name.
const universityBrands = new Map([
  ['niit university', {logo: niitLogo, name: 'NIIT University'}],
  ['niit university · demo', {logo: niitLogo, name: 'NIIT University'}],
]);

export function campusBrand(campus) {
  return universityBrands.get(String(campus.name || '').trim().toLowerCase()) || null;
}

export function campusLogo(campus, escapeHtml) {
  const brand = campusBrand(campus);
  const fallback = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="m3 9 9-6 9 6M4 10h16M5 20h14M7 10v10m5-10v10m5-10v10"/></svg>';
  return `<span class="college-logo ${brand ? 'college-logo-official' : ''}">${brand ? `<img src="${escapeHtml(brand.logo)}" alt="${escapeHtml(brand.name)} logo" width="44" height="48" decoding="async" onerror="this.hidden=true;this.nextElementSibling.hidden=false"><span class="college-logo-fallback" hidden>${fallback}</span>` : fallback}</span>`;
}
