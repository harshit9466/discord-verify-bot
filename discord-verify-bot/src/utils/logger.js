// ============================================================
// LOGGER — Production-ready logging using Winston
//
// Winston = ek popular Node.js logging library
// Yeh do jagah log karta hai:
//   1. Console (terminal pe colored output)
//   2. logs/ folder (plain JSON files for debugging)
//
// Log Levels (low to high):
//   debug → info → warn → error
//   .env mein LOG_LEVEL set karo. "info" production ke liye perfect hai.
// ============================================================

const { createLogger, format, transports } = require('winston');
const path = require('path');
const fs = require('fs');

// logs/ folder create karo agar exist nahi karta
const logsDir = path.join(process.cwd(), 'logs');
if (!fs.existsSync(logsDir)) fs.mkdirSync(logsDir);

const logger = createLogger({
  level: process.env.LOG_LEVEL || 'info',

  // Default format for file logs: timestamp + JSON
  format: format.combine(
    format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    format.errors({ stack: true }), // Stack traces capture karta hai
    format.json()
  ),

  transports: [
    // Console transport: human-readable colored output
    new transports.Console({
      format: format.combine(
        format.colorize(),
        format.printf(({ timestamp, level, message, ...meta }) => {
          // Extra data (like error objects) ko side mein show karo
          const extras = Object.keys(meta).length
            ? `\n  ${JSON.stringify(meta, null, 2)}`
            : '';
          return `[${timestamp}] ${level}: ${message}${extras}`;
        })
      ),
    }),

    // File transport: sirf errors
    new transports.File({
      filename: path.join(logsDir, 'error.log'),
      level: 'error',
    }),

    // File transport: sab kuch
    new transports.File({
      filename: path.join(logsDir, 'combined.log'),
    }),
  ],
});

module.exports = logger;
