/**
 * Campus registry. Add a verified domain here (or via CAMPUSES_JSON) to launch
 * another isolated campus; messages and discovery never cross campus IDs.
 */
const defaultCampuses = [{
  id: 'niit-university',
  name: 'NIIT University',
  domain: 'niituniversity.in',
  location: 'Neemrana, Rajasthan'
}];

let campuses = defaultCampuses;
if (process.env.CAMPUSES_JSON) {
  try { campuses = JSON.parse(process.env.CAMPUSES_JSON); } catch { throw new Error('CAMPUSES_JSON must be valid JSON'); }
}
function fromEmail(email) { const domain = String(email).toLowerCase().split('@')[1]; return campuses.find(c => c.domain.toLowerCase() === domain); }
function get(id) { return campuses.find(c => c.id === id); }
module.exports = { campuses, fromEmail, get };
