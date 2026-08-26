const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const file = path.join(__dirname, 'data.json');
const seed = { users: [], otps: [], messages: [], requests: [], applications: [], matches: [], reports: [], usernameHistory: [], bans: [] };
function load(){ try { return {...seed, ...JSON.parse(fs.readFileSync(file, 'utf8'))}; } catch { return structuredClone(seed); } }
let db = load();
function save(){ fs.writeFileSync(file, JSON.stringify(db, null, 2)); }
function id(){ return crypto.randomUUID(); }
function table(name){ return db[name]; }
function find(name, predicate){ return table(name).find(predicate); }
function add(name, value){ const item = { id:id(), createdAt:new Date().toISOString(), ...value }; table(name).push(item); save(); return item; }
function update(name, itemId, changes){ const item=find(name,x=>x.id===itemId); if(!item) return null; Object.assign(item,changes); save(); return item; }
function remove(name, predicate){ db[name]=table(name).filter(x=>!predicate(x)); save(); }
module.exports={table,find,add,update,remove,id,save};
