const pool = require('./database');

const initDatabase = async () => {
  try {
    // Create shareholders table (unchanged)
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

    // Create stockbrokers table (new)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS stockbrokers (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        code VARCHAR(50) UNIQUE NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Insert sample stockbrokers
    // const sampleStockbrokers = [
    //   { name: 'APC Securities Limited', code: 'APC' },
    //   { name: 'Cordros Capital Limited', code: 'CORD' },
    //   { name: 'FBNQuest Merchant Bank Limited', code: 'FBNQ' },
    //   { name: 'FCMB Capital Markets Limited', code: 'FCMB' },
    //   { name: 'FSL Securities Limited', code: 'FSL' },
    //   { name: 'Meristem Capital Limited', code: 'MERISTEM' },
    //   { name: 'Stanbic IBTC Stockbrokers Limited', code: 'STANBIC' },
    //   { name: 'United Capital Securities Limited', code: 'UCSL' }
    // ];

    // for (const broker of sampleStockbrokers) {
    //   await pool.query(`
    //     INSERT INTO stockbrokers (name, code)
    //     VALUES ($1, $2)
    //     ON CONFLICT (code) DO NOTHING
    //   `, [broker.name, broker.code]);
    // }

    // Create forms table (unchanged)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS forms (
        id SERIAL PRIMARY KEY,
        shareholder_id INTEGER REFERENCES shareholders(id) ON DELETE CASCADE,
        acceptance_type VARCHAR(50) NOT NULL CHECK (acceptance_type IN ('full', 'partial', 'renunciation')),
        shares_accepted DECIMAL(15,2),
        shares_renounced DECIMAL(15,2),
        additional_shares_applied DECIMAL(15,2),
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

    // Create rights_submissions table with new structure
    await pool.query(`
      CREATE TABLE IF NOT EXISTS rights_submissions (
        id SERIAL PRIMARY KEY,
        shareholder_id INTEGER REFERENCES shareholders(id) ON DELETE CASCADE,
        
        -- Instructions
        instructions_read BOOLEAN DEFAULT FALSE,
        
        -- Stockbroker & CHN details
        stockbroker_id INTEGER REFERENCES stockbrokers(id),
        chn VARCHAR(100) NOT NULL,
        
        -- Action choice
        action_type VARCHAR(50) CHECK (action_type IN ('full_acceptance', 'renunciation_partial')),
        
        -- Full acceptance fields
        accept_full BOOLEAN DEFAULT FALSE,
        apply_additional BOOLEAN DEFAULT FALSE,
        additional_shares DECIMAL(15,2),
        additional_amount DECIMAL(15,2),
        accept_smaller_allotment BOOLEAN DEFAULT FALSE,
        payment_amount DECIMAL(15,2),

        partial_payment_bank_name VARCHAR(255),
        partial_payment_cheque_number VARCHAR(100),
        partial_payment_branch VARCHAR(255),
        
        additional_payment_bank_name VARCHAR(255),
        additional_payment_cheque_number VARCHAR(100),
        additional_payment_branch VARCHAR(255),

        -- Renunciation/Partial acceptance fields
        shares_accepted DECIMAL(15,2),
        amount_payable DECIMAL(15,2),
        shares_renounced DECIMAL(15,2),
        accept_partial BOOLEAN DEFAULT FALSE,
        renounce_rights BOOLEAN DEFAULT FALSE,
        trade_rights BOOLEAN DEFAULT FALSE,
        
        -- Personal details
        contact_name VARCHAR(255),
        next_of_kin VARCHAR(255),
        daytime_phone VARCHAR(50),
        mobile_phone VARCHAR(50),
        email VARCHAR(255),
        
        -- Bank details for e-dividend
        bank_name_edividend VARCHAR(255),
        bank_branch_edividend VARCHAR(255),
        account_number VARCHAR(50),
        bvn VARCHAR(50),
        
        -- Corporate details
        corporate_signatory_names TEXT,
        corporate_designations TEXT,
        
        -- Signature type
        signature_type VARCHAR(10) CHECK (signature_type IN ('single', 'joint')),
        
        -- Prefilled shareholder info
        reg_account_number VARCHAR(50) NOT NULL,
        name VARCHAR(255) NOT NULL,
        holdings NUMERIC(15,2) NOT NULL,
        rights_issue NUMERIC(15,2) NOT NULL,
        holdings_after NUMERIC(15,2) NOT NULL,
        amount_due NUMERIC(15,2) NOT NULL,
        
        -- File paths
        filled_form_path VARCHAR(500),
        receipt_path VARCHAR(500),
        signature_paths TEXT[], -- Array to store multiple signature paths for joint accounts
        
        status VARCHAR(50) DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'rejected')),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);


    // Create admin users table (unchanged)
    // await pool.query(`
    //   CREATE TABLE admin_users (
    //     id SERIAL PRIMARY KEY,
    //     email VARCHAR(255) UNIQUE NOT NULL,
    //     password VARCHAR(255) NOT NULL,
    //     created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    //   )
    // `);

    // // Insert sample admin user 
    // await pool.query(`
    //   INSERT INTO admin_users (password, email)
    //   VALUES ($1, $2)
    //   ON CONFLICT (email) DO NOTHING
    // `, ['$2a$10$rQZ8K9mX2nL1vP3qR5sT7u', 'fadebowale@apelasset.com']);

    console.log('Database initialized successfully');
  } catch (error) {
    console.error('Error initializing database:', error);
    throw error;
  }
};

module.exports = initDatabase;