// Encrypt database dumps before writing to disk. Restore only into a newly
// created database in a disposable loopback Docker container, never a supplied URL.
const {spawn}=require('node:child_process');
const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto');
const {pipeline}=require('node:stream/promises');const {createReadStream,createWriteStream}=require('node:fs');
const image=process.env.BACKUP_POSTGRES_IMAGE||'postgres:17-alpine';
if(!/^postgres:(1[6-9]|[2-9][0-9])-alpine$/.test(image))throw new Error('Use an official supported PostgreSQL image.');
const MAGIC=Buffer.from('AFTERCLASS-BACKUP-1\n');
function command(bin,args,env=process.env){const child=spawn(bin,args,{env,stdio:['pipe','pipe','pipe']});let stderr='';child.stderr.on('data',b=>{stderr+=b;});const done=new Promise((resolve,reject)=>{child.on('error',()=>reject(new Error(bin+' unavailable.')));child.on('close',code=>code===0?resolve():reject(new Error(bin+' failed. Verify connectivity, permissions and PostgreSQL client version.')));});done.catch(()=>{});return {child,done};}
function key(){const k=process.env.BACKUP_ENCRYPTION_KEY;if(!/^[a-f0-9]{64}$/i.test(k||''))throw new Error('Set BACKUP_ENCRYPTION_KEY to 32 random bytes in hexadecimal, stored separately from backups.');return Buffer.from(k,'hex');}
async function backup(file){
 const url=new URL(process.env.BACKUP_DATABASE_URL||'');if(!['postgresql:','postgres:'].includes(url.protocol))throw new Error('Set BACKUP_DATABASE_URL to the direct or session-pooler database connection.');
 const database=decodeURIComponent(url.pathname.slice(1));if(!database)throw new Error('Database name required.');
 const env={...process.env,PGHOST:url.hostname,PGPORT:url.port||'5432',PGDATABASE:database,PGUSER:decodeURIComponent(url.username),PGPASSWORD:decodeURIComponent(url.password),PGSSLMODE:['localhost','127.0.0.1'].includes(url.hostname)?'disable':'require'};
 const output=path.resolve(file);await fs.mkdir(path.dirname(output),{recursive:true,mode:0o700});
 const iv=crypto.randomBytes(12),cipher=crypto.createCipheriv('aes-256-gcm',key(),iv);cipher.setAAD(MAGIC);
 // PG_* passed as environment, never embedded in arguments or emitted to logs.
 const args=['run','--rm','-i','--add-host=host.docker.internal:host-gateway',...['PGHOST','PGPORT','PGDATABASE','PGUSER','PGPASSWORD','PGSSLMODE'].flatMap(k=>['-e',k]),image,'pg_dump','--format=custom','--no-owner','--no-acl'];
 if(['localhost','127.0.0.1'].includes(url.hostname))env.PGHOST='host.docker.internal';
 const temp=output+'.partial';const handle=await fs.open(temp,'wx',0o600);await handle.write(Buffer.concat([MAGIC,iv]));await handle.close();
 const {child,done}=command('docker',args,env);child.stdin.end();
 try{await Promise.all([pipeline(child.stdout,cipher,createWriteStream(temp,{flags:'a',mode:0o600})),done]);await fs.appendFile(temp,cipher.getAuthTag());await fs.copyFile(temp,output,require('node:fs').constants.COPYFILE_EXCL);await fs.chmod(output,0o600);await fs.unlink(temp);console.log(JSON.stringify({backupCreated:true,encrypted:true,file:output}));}
 catch(err){child.kill();await fs.rm(temp,{force:true});throw err;}
}
async function restoreDrill(file){
 const input=path.resolve(file),stat=await fs.stat(input),header=Buffer.alloc(MAGIC.length+12),tag=Buffer.alloc(16),handle=await fs.open(input,'r');
 try{await handle.read(header,0,header.length,0);await handle.read(tag,0,16,stat.size-16);}finally{await handle.close();}
 if(!header.subarray(0,MAGIC.length).equals(MAGIC)||stat.size<=header.length+16)throw new Error('Not an Afterclass encrypted backup.');
 const decipher=crypto.createDecipheriv('aes-256-gcm',key(),header.subarray(MAGIC.length));decipher.setAAD(MAGIC);decipher.setAuthTag(tag);
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'afterclass-restore-'));await fs.chmod(dir,0o700);const dump=path.join(dir,'restore.dump'),name='afterclass-restore-'+crypto.randomBytes(6).toString('hex'),password=crypto.randomBytes(24).toString('hex');let started=false;
 const startedAt=Date.now();
 try{
  // Authenticate the entire ciphertext before starting PostgreSQL or using the dump.
  await pipeline(createReadStream(input,{start:header.length,end:stat.size-17}),decipher,createWriteStream(dump,{flags:'wx',mode:0o600}));
  const start=command('docker',['run','--rm','-d','--name',name,'--network','none','-e','POSTGRES_PASSWORD','-e','POSTGRES_DB=restore_drill','-v',`${dir}:/backup:ro`,image],{...process.env,POSTGRES_PASSWORD:password});start.child.stdin.end();await start.done;started=true;
  let ready=false;for(let i=0;i<30;i++){const c=command('docker',['exec',name,'pg_isready','-h','127.0.0.1','-U','postgres','-d','restore_drill']);c.child.stdin.end();try{await c.done;ready=true;break;}catch{await new Promise(r=>setTimeout(r,500));}}
  if(!ready)throw new Error('Disposable restore database did not start.');
  const restore=command('docker',['exec',name,'pg_restore','--exit-on-error','--no-owner','--no-acl','-U','postgres','-d','restore_drill','/backup/restore.dump']);restore.child.stdin.end();await restore.done;
  const check=command('docker',['exec',name,'psql','-U','postgres','-d','restore_drill','-tAc',"SELECT json_build_object('campuses',(SELECT count(*) FROM campuses),'accounts',(SELECT count(*) FROM users),'reports',(SELECT count(*) FROM reports),'migrations',(SELECT count(*) FROM _prisma_migrations WHERE finished_at IS NOT NULL));"]);let counts='';check.child.stdout.on('data',b=>counts+=b);check.child.stdin.end();await check.done;
  const report={restored:true,isolated:true,checkedAt:new Date().toISOString(),seconds:Math.round((Date.now()-startedAt)/1000),counts:JSON.parse(counts),limitations:'Database restore and row counts only. Test application permissions and recovery of private uploads separately.'};
  await fs.writeFile(input+'.drill.json',JSON.stringify(report,null,2),{mode:0o600});console.log(JSON.stringify(report));
 }finally{if(started){const stop=command('docker',['rm','-f',name]);stop.child.stdin.end();await stop.done.catch(()=>{});}await fs.rm(dir,{recursive:true,force:true});}
}
if(require.main===module){const [mode,file]=process.argv.slice(2);(async()=>{if(!file||!['backup','drill'].includes(mode))throw new Error('Usage: node scripts/recovery.cjs backup|drill /private/path/backup.acb');if(mode==='backup')await backup(file);else await restoreDrill(file);})().catch(()=>{console.error('Recovery operation failed. Check private configuration, Docker and database connectivity. No restore was attempted against the source database.');process.exitCode=1;});}
module.exports={backup,restoreDrill};
