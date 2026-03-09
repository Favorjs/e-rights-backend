const pool = require('./database');

const initDatabase = async () => {
  try {
    // Create shareholders table (unchanged)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS shareholders (
        id SERIAL PRIMARY KEY,
        reg_account_number VARCHAR(50) UNIQUE NOT NULL,
        name VARCHAR(255) NOT NULL,
        address TEXT,
        holdings BIGINT,
        rights_issue BIGINT,
        holdings_after BIGINT,
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
        shares_accepted BIGINT,
        shares_renounced BIGINT,
        additional_shares_applied BIGINT,
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
        additional_shares BIGINT,
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
        shares_accepted BIGINT,
        amount_payable DECIMAL(15,2),
        shares_renounced BIGINT,
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
        holdings BIGINT NOT NULL,
        rights_issue BIGINT NOT NULL,
        holdings_after BIGINT NOT NULL,
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

    // Create ledgers table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS ledgers (
        id SERIAL PRIMARY KEY,
        title VARCHAR(255) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Insert default ledger if it doesn't exist
    await pool.query(`
      INSERT INTO ledgers (id, title)
      VALUES (1, 'Main Ledger')
      ON CONFLICT (id) DO NOTHING
    `);

    // Create wallets table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS wallets (
        id SERIAL PRIMARY KEY,
        user_id INTEGER, -- Can be NULL for public users
        shareholder_id INTEGER REFERENCES shareholders(id) ON DELETE CASCADE,
        balance NUMERIC(15,2) DEFAULT 0.00,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create wallet_actions table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS wallet_actions (
        id SERIAL PRIMARY KEY,
        uuid UUID DEFAULT gen_random_uuid(),
        wallet_id INTEGER REFERENCES wallets(id) ON DELETE CASCADE,
        ledger_id INTEGER REFERENCES ledgers(id),
        delta NUMERIC(15,2) NOT NULL,
        balance_after_delta NUMERIC(15,2),
        approving_officer_id INTEGER,
        transaction_type VARCHAR(20) CHECK (transaction_type IN ('CREATE', 'CREDIT', 'DEBIT')),
        transaction_ref TEXT,
        timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        summary TEXT,
        receipt_path TEXT
      )
    `);

    // Create dynamic_nuban_accounts table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS dynamic_nuban_accounts (
        id SERIAL PRIMARY KEY,
        user_id INTEGER,
        shareholder_id INTEGER REFERENCES shareholders(id) ON DELETE CASCADE,
        transaction_ref TEXT UNIQUE NOT NULL,
        status VARCHAR(20) DEFAULT 'INITIALIZED' CHECK (status IN ('VERIFIED', 'PENDING', 'INITIALIZED', 'FAILED')),
        account_number TEXT,
        banking_partner TEXT,
        amount TEXT,
        email TEXT,
        shareholder_name TEXT,
        response TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Add address column if it doesn't exist (for existing databases)
    await pool.query(`
      ALTER TABLE shareholders
      ADD COLUMN IF NOT EXISTS address TEXT
    `).catch(() => { });

    // Convert share quantity columns from DECIMAL to BIGINT (for existing databases)
    await pool.query(`
      ALTER TABLE forms
        ALTER COLUMN shares_accepted TYPE BIGINT USING shares_accepted::BIGINT,
        ALTER COLUMN shares_renounced TYPE BIGINT USING shares_renounced::BIGINT,
        ALTER COLUMN additional_shares_applied TYPE BIGINT USING additional_shares_applied::BIGINT
    `).catch(() => { });

    await pool.query(`
      ALTER TABLE rights_submissions
        ALTER COLUMN additional_shares TYPE BIGINT USING additional_shares::BIGINT,
        ALTER COLUMN shares_accepted TYPE BIGINT USING shares_accepted::BIGINT,
        ALTER COLUMN shares_renounced TYPE BIGINT USING shares_renounced::BIGINT,
        ALTER COLUMN holdings TYPE BIGINT USING holdings::BIGINT,
        ALTER COLUMN rights_issue TYPE BIGINT USING rights_issue::BIGINT,
        ALTER COLUMN holdings_after TYPE BIGINT USING holdings_after::BIGINT
    `).catch(() => { });

    // Add email column if it doesn't exist (for existing databases)
    await pool.query(`
      ALTER TABLE dynamic_nuban_accounts 
      ADD COLUMN IF NOT EXISTS email TEXT,
      ADD COLUMN IF NOT EXISTS shareholder_name TEXT
    `).catch(() => { });

    // Add payment_status column to rights_submissions if it doesn't exist
    await pool.query(`
      ALTER TABLE rights_submissions
      ADD COLUMN IF NOT EXISTS payment_status VARCHAR(20) DEFAULT 'pending' CHECK (payment_status IN ('pending', 'successful', 'failed')),
      ADD COLUMN IF NOT EXISTS payment_ref TEXT,
      ADD COLUMN IF NOT EXISTS payment_date TIMESTAMP
    `).catch(() => { });

    // Extend dynamic_nuban_accounts status to support OVERPAID and UNDERPAID
    await pool.query(`
      ALTER TABLE dynamic_nuban_accounts
      DROP CONSTRAINT IF EXISTS dynamic_nuban_accounts_status_check
    `).catch(() => { });
    await pool.query(`
      ALTER TABLE dynamic_nuban_accounts
      ADD CONSTRAINT dynamic_nuban_accounts_status_check
      CHECK (status IN ('VERIFIED', 'PENDING', 'INITIALIZED', 'FAILED', 'OVERPAID', 'UNDERPAID'))
    `).catch(() => { });

    // Add amount_received column to track actual payment received from VetroPay
    await pool.query(`
      ALTER TABLE dynamic_nuban_accounts
      ADD COLUMN IF NOT EXISTS amount_received NUMERIC(15,2)
    `).catch(() => { });

    // Extend rights_submissions payment_status to support overpaid and underpaid
    await pool.query(`
      ALTER TABLE rights_submissions
      DROP CONSTRAINT IF EXISTS rights_submissions_payment_status_check
    `).catch(() => { });
    await pool.query(`
      ALTER TABLE rights_submissions
      ADD CONSTRAINT rights_submissions_payment_status_check
      CHECK (payment_status IN ('pending', 'successful', 'failed', 'overpaid', 'underpaid'))
    `).catch(() => { });

    // Create admin users table (unchanged)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS admin_users (
        id SERIAL PRIMARY KEY,
        email VARCHAR(255) UNIQUE NOT NULL,
        password VARCHAR(255) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Insert sample admin user 
    await pool.query(`
      INSERT INTO admin_users (password, email)
      VALUES ($1, $2)
      ON CONFLICT (email) DO NOTHING
    `, ['$2a$10$rQZ8K9mX2nL1vP3qR5sT7u', 'fadebowale@apelasset.com']);

    console.log('Database initialized successfully');
  } catch (error) {
    console.error('Error initializing database:', error);
    throw error;
  }
};

module.exports = initDatabase;