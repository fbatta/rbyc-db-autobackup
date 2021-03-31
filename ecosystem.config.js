module.exports = {
    apps: [{
        name: 'mariadb-autobackup',
        script: './dist/index.js',
        autorestart: false,
        
    }]
}