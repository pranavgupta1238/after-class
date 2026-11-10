const sharp = require('sharp');
function validateProduction(env = process.env) {
  if (env.NODE_ENV !== 'production') return;
  for (const key of ['JWT_SECRET','OTP_PEPPER','STAFF_ENCRYPTION_KEY']) {
    if (!env[key] || env[key].length < 32 || /local-development|change-me|review-only/.test(env[key])) throw new Error(`${key} must be a strong, independent secret of at least 32 characters.`);
  }
  if (new Set([env.JWT_SECRET,env.OTP_PEPPER,env.STAFF_ENCRYPTION_KEY]).size !== 3) throw new Error('Production secrets must be independent.');
  if (!env.REDIS_URL?.startsWith('rediss://')) throw new Error('Production requires certificate-verified TLS Redis.');
  if (!env.CLIENT_URL?.startsWith('https://')) throw new Error('Production requires an HTTPS CLIENT_URL.');
  if (env.AFTERCLASS_REVIEW === '1') throw new Error('Review accounts cannot run in production.');
}
function protections(req,res,next) {
  res.set({'X-Content-Type-Options':'nosniff','X-Frame-Options':'DENY','Referrer-Policy':'strict-origin-when-cross-origin','Permissions-Policy':'camera=(self), microphone=(), geolocation=(self)'});
  // Inline handlers are still used by the current UI; do not claim a strict script CSP.
  res.set('Content-Security-Policy',"frame-ancestors 'none'; object-src 'none'; base-uri 'self'; form-action 'self'");
  if(process.env.NODE_ENV==='production') res.set('Strict-Transport-Security','max-age=31536000');
  if(!req.path.startsWith('/api/')||['GET','HEAD','OPTIONS'].includes(req.method))return next();
  const origin=req.get('Origin'), allowed=new Set([process.env.CLIENT_URL,`${req.protocol}://${req.get('host')}`].filter(Boolean));
  if((origin&&!allowed.has(origin))||req.get('Sec-Fetch-Site')==='cross-site'||(!origin&&process.env.NODE_ENV==='production'&&req.headers.cookie&&!req.headers.authorization))return res.status(403).json({error:'Request origin is not allowed.'});
  next();
}
async function normalizeSelfie(data) {
  if(typeof data!=='string'||!/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=\r\n]+$/.test(data))throw new Error('Choose a valid PNG, JPEG or WebP photo.');
  const buffer=Buffer.from(data.slice(data.indexOf(',')+1),'base64');
  if(!buffer.length||buffer.length>2*1024*1024)throw new Error('Photo must be smaller than 2 MB.');
  try{return await sharp(buffer,{limitInputPixels:12000000,failOn:'warning',animated:false}).rotate().resize({width:1280,height:1280,fit:'inside',withoutEnlargement:true}).webp({quality:85}).toBuffer();}
  catch{throw new Error('This image could not be decoded. Retake your photo.');}
}
module.exports={validateProduction,protections,normalizeSelfie};
