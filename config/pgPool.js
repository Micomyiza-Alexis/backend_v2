const path = require('path');
require("dotenv").config({ path: path.join(__dirname, '..', '.env') });
const { Pool } = require("pg");

/**
 * PostgreSQL connection pool for direct database queries
 * Uses Neon-hosted PostgreSQL database via DATABASE_URL
 */

// Validate DATABASE_URL is set
const rawConn = process.env.DATABASE_URL || '';
// Trim and strip surrounding quotes if present (dotenv can include quotes in values)
const connectionString = rawConn.trim().replace(/^'+|'+$/g, '').replace(/^"+|"+$/g, '');

if (!connectionString) {
  console.error("ERROR: DATABASE_URL environment variable is not set or empty!");
  console.error("Please set DATABASE_URL in your .env file or environment variables.");
}

const pool = new Pool({
  connectionString,
  ssl: connectionString && connectionString.includes('neon.tech') ? {
    rejectUnauthorized: false, // Required for Neon PostgreSQL
  } : undefined,
  max: 20, // Maximum number of clients in the pool
  idleTimeoutMillis: 30000, // Close idle clients after 30 seconds
  connectionTimeoutMillis: 60000, // Match Sequelize's startup acquisition window
});

// Handle pool errors
pool.on("error", (err, client) => {
  console.error("Unexpected error on idle client", err);
  // Don't exit process on pool errors, just log them
  // process.exit(-1);
});

module.exports = pool;

