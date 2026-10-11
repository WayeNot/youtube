require('dotenv').config();
const path = require('path');

module.exports = {
  port: parseInt(process.env.PORT, 10) || 3000,
  nodeEnv: process.env.NODE_ENV || 'development',
  jwtSecret: process.env.JWT_SECRET || 'ytm_default_secret_key_change_in_prod',
  databaseUrl: process.env.DATABASE_URL || '',
  dbPath: path.resolve(__dirname, process.env.DB_PATH || './data/ytm.db'),
  ytdlpPath: path.join(__dirname, 'bin', 'yt-dlp'),
  cacheTtl: {
    stream: 3 * 60 * 60 * 1000, // 3 hours
    search: 30 * 60 * 1000,     // 30 min
    lyrics: 24 * 60 * 60 * 1000, // 24 hours
    home: 15 * 60 * 1000        // 15 min
  }
};