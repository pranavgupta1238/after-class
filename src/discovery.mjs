export const ACTIVITIES = [
  { id: 'all', label: 'Everything', icon: '✦' },
  { id: 'coffee', label: 'Coffee & food', icon: '☕', pattern: /coffee|chai|tea\b|food|lunch|dinner|breakfast|bite|mess\b|cafe|cafè|café/i, prompt: 'A chai break & a good conversation' },
  { id: 'study', label: 'Study together', icon: '↗', pattern: /study|library|exam|code|coding|project|hack|assignment/i, prompt: 'A focused library study session' },
  { id: 'move', label: 'Get moving', icon: '↝', pattern: /walk|gym|sport|badminton|football|basketball|run|tennis|cricket|workout|cycle|cycling/i, prompt: 'An easy evening campus walk' },
  { id: 'play', label: 'Play & unwind', icon: '✳', pattern: /gam(e|es|ing)|music|movie|art|jam|board|chess|film|dance/i, prompt: 'Board games & a break from screens' }
];

export function activityFor(plan) {
  return ACTIVITIES.slice(1).find(a => a.pattern.test(plan.activity || '')) || { id: 'other', label: 'Something different', icon: '✦' };
}

export function upcomingPlans(plans, now = new Date()) {
  return plans.filter(p => (!p.status || p.status === 'open') && Number.isFinite(Date.parse(p.scheduledAt)) && Date.parse(p.scheduledAt) > now.getTime());
}

export function selectPlans(plans, { query = '', category = 'all', when = 'any', savedOnly = false, savedIds = new Set(), sort = 'soonest' } = {}, now = new Date()) {
  const endToday = new Date(now); endToday.setHours(24, 0, 0, 0);
  const endTomorrow = new Date(endToday); endTomorrow.setDate(endTomorrow.getDate() + 1);
  const weekEnd = new Date(now); weekEnd.setDate(weekEnd.getDate() + 7);
  const tokens = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const selected = upcomingPlans(plans, now).filter(p => {
    const at = Date.parse(p.scheduledAt);
    const text = `${p.activity || ''} ${p.location || ''}`.toLowerCase();
    return tokens.every(t => text.includes(t)) &&
      (category === 'all' || activityFor(p).id === category) &&
      (!savedOnly || savedIds.has(p.id)) &&
      (when !== 'today' || at < endToday.getTime()) &&
      (when !== 'tomorrow' || (at >= endToday.getTime() && at < endTomorrow.getTime())) &&
      (when !== 'week' || at <= weekEnd.getTime());
  });
  if (sort === 'soonest') selected.sort((a, b) => Date.parse(a.scheduledAt) - Date.parse(b.scheduledAt));
  return selected;
}

export function planTime(value, now = new Date()) {
  const at = new Date(value);
  if (!Number.isFinite(at.getTime())) return 'Time to be confirmed';
  const tomorrow = new Date(now); tomorrow.setDate(tomorrow.getDate() + 1);
  const day = at.toDateString() === now.toDateString() ? 'Today' : at.toDateString() === tomorrow.toDateString() ? 'Tomorrow' : at.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
  return `${day} · ${at.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`;
}
