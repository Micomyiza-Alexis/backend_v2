'use strict';

const bcrypt = require('bcryptjs');
const { randomUUID } = require('crypto');

module.exports = {
  async up(queryInterface, Sequelize) {
    const hashedPassword = await bcrypt.hash('Admin@123', 10);

    await queryInterface.bulkInsert('users', [
      {
        id: randomUUID(),

        email: 'admin@safaritix.com',
        password: hashedPassword,
        full_name: 'System Administrator',

        phone_number: null,

        role: 'admin',

        company_id: null,

        is_active: true,
        email_verified: true,

        last_login: null,

        preferences: JSON.stringify({
          language: 'en',
          notifications: {
            email: true,
            sms: false,
            promotional: false
          }
        }),

        must_change_password: false,
        company_verified: true,
        account_status: 'approved',

        permissions: {},

        supabase_user_id: null,

        created_at: new Date(),
        updated_at: new Date()
      }
    ]);
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.bulkDelete('users', {
      email: 'admin@safaritix.com'
    });
  }
};