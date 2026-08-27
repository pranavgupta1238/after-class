module.exports = {
  apps: [{
    name: 'afterclass-api',
    script: 'server/index.js',
    instances: 1,
    autorestart: true,
    env: {
      NODE_ENV: 'production',
      PORT: 3000,
      HOST: '127.0.0.1'
    }
  }]
};
