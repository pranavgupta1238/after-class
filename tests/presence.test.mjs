import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require=createRequire(import.meta.url);
const {getCampusOnlineUserIds,canJoinIdentityRoom}=require('../server/presence.js');
function fixture(){return {sockets:{adapter:{rooms:new Map()},sockets:new Map()}};}
function add(io,id,userId,campus='niit',connected=true){io.sockets.sockets.set(id,{connected,user:{id:userId,campus:{slug:campus}}});const room=io.sockets.adapter.rooms.get('campus:'+campus)||new Set();room.add(id);io.sockets.adapter.rooms.set('campus:'+campus,room);}
test('an empty campus reports zero at every time of day',()=>{assert.equal(getCampusOnlineUserIds(fixture(),'niit').size,0);});
test('multiple tabs and devices from one account count as one user',()=>{const io=fixture();add(io,'tab1','me');add(io,'tab2','me');add(io,'phone','me');assert.equal(getCampusOnlineUserIds(io,'niit').size,1);add(io,'other','friend');assert.equal(getCampusOnlineUserIds(io,'niit').size,2);});
test('disconnect removes a user only after the final connection closes',()=>{const io=fixture();add(io,'tab1','me');add(io,'tab2','me');io.sockets.sockets.delete('tab1');assert.equal(getCampusOnlineUserIds(io,'niit').size,1);io.sockets.sockets.get('tab2').connected=false;assert.equal(getCampusOnlineUserIds(io,'niit').size,0);});
test('unknown sockets and users from another campus never inflate presence',()=>{const io=fixture();add(io,'one','me');add(io,'two','other','elsewhere');io.sockets.adapter.rooms.get('campus:niit').add('two').add('ghost');assert.deepEqual([...getCampusOnlineUserIds(io,'niit')],['me']);assert.equal(getCampusOnlineUserIds(io,undefined).size,0);});
test('identity room joins are restricted to the authenticated account and campus',()=>{const user={id:'me',campus:{slug:'niit'}};assert.equal(canJoinIdentityRoom(user,'campus:niit'),true);assert.equal(canJoinIdentityRoom(user,'user:me'),true);for(const room of ['campus:elsewhere','user:someone-else','campus:undefined',null])assert.equal(canJoinIdentityRoom(user,room),false);assert.equal(canJoinIdentityRoom(null,'user:me'),false);});
