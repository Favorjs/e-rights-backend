const pool = require('./database');

const initDatabase = async () => {
  try {
    // Create shareholders table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS shareholders (
        id SERIAL PRIMARY KEY,
        reg_account_number VARCHAR(50) UNIQUE NOT NULL,
        name VARCHAR(255) NOT NULL,
        holdings NUMERIC(15,2),
        rights_issue NUMERIC(15,2),
        holdings_after NUMERIC(15,2),
        amount_due NUMERIC(15,2),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      ) 
`);

    // Create forms table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS forms (
        id SERIAL PRIMARY KEY,
        shareholder_id INTEGER REFERENCES shareholders(id) ON DELETE CASCADE,
        acceptance_type VARCHAR(50) NOT NULL CHECK (acceptance_type IN ('full', 'partial', 'renunciation')),
        shares_accepted INTEGER,
        shares_renounced INTEGER,
        additional_shares_applied INTEGER,
        amount_payable DECIMAL(15,2),
        payment_account_number VARCHAR(50),
        contact_name VARCHAR(255),
        next_of_kin VARCHAR(255),
        daytime_phone VARCHAR(50),
        mobile_phone VARCHAR(50),
        email VARCHAR(255),
        bank_name VARCHAR(255),
        bank_branch VARCHAR(255),
        account_number VARCHAR(50),
        bvn VARCHAR(50),
        signature_file VARCHAR(255),
        receipt_file VARCHAR(255),
        status VARCHAR(50) DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'rejected')),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create admin users table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS admin_users (
        id SERIAL PRIMARY KEY,
        username VARCHAR(100) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        email VARCHAR(255) UNIQUE NOT NULL,
        role VARCHAR(50) DEFAULT 'admin',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Insert sample shareholders data
    // const sampleShareholders = [
    //   { reg_account_number: 'REG001', name: 'John Smith', holdings: 1000, rights_issue: 76 },
    //   { reg_account_number: 'REG002', name: 'Jane Doe', holdings: 1500, rights_issue: 115 },
    //   { reg_account_number: 'REG003', name: 'Michael Johnson', holdings: 2000, rights_issue: 153 },
    //   { reg_account_number: 'REG004', name: 'Sarah Wilson', holdings: 800, rights_issue: 61 },
    //   { reg_account_number: 'REG005', name: 'David Brown', holdings: 1200, rights_issue: 92 }
    // ];

    // for (const shareholder of sampleShareholders) {
    //   await pool.query(`
    //     INSERT INTO shareholders (reg_account_number, name, holdings, rights_issue)
    //     VALUES ($1, $2, $3, $4)
    //     ON CONFLICT (reg_account_number) DO NOTHING
    //   `, [shareholder.reg_account_number, shareholder.name, shareholder.holdings, shareholder.rights_issue]);
    // }

    // Insert sample admin user (password: admin123)
    await pool.query(`
      INSERT INTO admin_users (username, password_hash, email, role)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (username) DO NOTHING
    `, ['admin', '$2a$10$rQZ8K9mX2nL1vP3qR5sT7u', 'admin@initiates.com', 'admin']);

    // Insert sample form submission
    // await pool.query(`
    //   INSERT INTO forms (
    //     shareholder_id, acceptance_type, shares_accepted, amount_payable,
    //     contact_name, email, signature_file, receipt_file, status
    //   )
    //   SELECT 
    //     s.id, 'full', s.rights_issue, s.rights_issue * 50.0,
    //     s.name, 'john.smith@email.com', 'signatures/sample_signature.jpg', 'receipts/sample_receipt.jpg', 'completed'
    //   FROM shareholders s
    //   WHERE s.reg_account_number = 'REG001'
    //   ON CONFLICT DO NOTHING
    // `);

    console.log('Database initialized successfully');
  } catch (error) {
    console.error('Error initializing database:', error);
    throw error;
  }
};

module.exports = initDatabase; 