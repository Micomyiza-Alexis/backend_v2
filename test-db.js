const sequelize = require("./config/database");

async function test() {
    try {
        console.log("🔄 Connecting to Neon...");

        await sequelize.authenticate();

        console.log("✅ Sequelize connection works!");

        for (let i = 1; i <= 10; i++) {
            await sequelize.query("SELECT NOW()");
            console.log(`✅ Query ${i}/10 works`);
        }

        console.log("🎉 ALL DATABASE TESTS PASSED");
    } catch (error) {
        console.error("❌ DATABASE TEST FAILED");
        console.error("Name:", error.name);
        console.error("Message:", error.message);

        if (error.parent) {
            console.error("Parent:", error.parent.message);
        }
    } finally {
        await sequelize.close();
        console.log("🔌 Connection closed");
    }
}

test();