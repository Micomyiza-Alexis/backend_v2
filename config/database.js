require("dotenv").config();

const { Sequelize } = require("sequelize");

if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is not set.");
}

const dbUrl = new URL(process.env.DATABASE_URL);

const sequelize = new Sequelize({
    dialect: "postgres",

    host: dbUrl.hostname,
    port: Number(dbUrl.port) || 5432,

    database: decodeURIComponent(dbUrl.pathname.slice(1)),
    username: decodeURIComponent(dbUrl.username),
    password: decodeURIComponent(dbUrl.password),

    dialectOptions: {
        ssl: {
            require: true,
            rejectUnauthorized: false,
        },
    },

    logging: process.env.SEQ_LOGGING === "true" ? console.log : false,

    pool: {
        max: 5,
        min: 0,
        acquire: 60000,
        idle: 10000,
    },

    retry: {
        max: 3,
    },
});

module.exports = sequelize;