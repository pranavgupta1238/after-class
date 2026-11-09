import test from 'node:test';
import assert from 'node:assert/strict';
import { selectPlans, upcomingPlans, activityFor, planTime } from '../src/discovery.mjs';
const now = new Date(2026, 10, 9, 12);
const at = (day, hour) => new Date(2026, 10, day, hour).toISOString();
const plans = [
 { id: 'a', activity: 'Coffee & conversation', location: 'Library cafe', scheduledAt: at(10, 10), status: 'open' },
 { id: 'b', activity: 'Study for exams', location: 'Library', scheduledAt: at(9, 14), status: 'open' },
 { id: 'c', activity: 'Campus walk', location: 'Main lawn', scheduledAt: at(9, 18), status: 'open' },
 { id: 'd', activity: 'Chess', location: 'Common room', scheduledAt: at(11, 18), status: 'open' },
 { id: 'past', activity: 'Lunch', scheduledAt: at(9, 11), status: 'open' },
 { id: 'closed', activity: 'Coffee', scheduledAt: at(10, 12), status: 'cancelled' },
 { id: 'invalid', scheduledAt: 'invalid' }
];
test('hides past, closed, and invalid plans without mutating the input', () => {
 assert.deepEqual(selectPlans(plans, {}, now).map(p=>p.id), ['b','c','a','d']);
 assert.equal(plans[0].id,'a'); assert.equal(upcomingPlans(plans,now).length,4);
});
test('combines keyword search, activity, and bookmarks', () => {
 assert.deepEqual(selectPlans(plans,{query:'COFFEE library', category:'coffee',savedOnly:true,savedIds:new Set(['a'])},now).map(p=>p.id),['a']);
 assert.equal(selectPlans(plans,{query:'coffee',category:'study'},now).length,0);
});
test('today and tomorrow use local calendar boundaries', () => {
 assert.deepEqual(selectPlans(plans,{when:'today'},now).map(p=>p.id),['b','c']);
 assert.deepEqual(selectPlans(plans,{when:'tomorrow'},now).map(p=>p.id),['a']);
});
test('newest preserves API ordering and unknown activities remain discoverable', () => {
 assert.deepEqual(selectPlans(plans,{sort:'newest'},now).map(p=>p.id),['a','b','c','d']);
 assert.equal(activityFor({activity:'Origami afternoon'}).id,'other');
});
test('time labels distinguish today, tomorrow, and invalid dates',()=>{
 assert.match(planTime(at(9,18),now),/^Today/);assert.match(planTime(at(10,10),now),/^Tomorrow/);
 assert.equal(planTime('invalid',now),'Time to be confirmed');
});
