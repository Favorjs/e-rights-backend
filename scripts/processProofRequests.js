const pool = require('../config/database');
const { mailgunEmailService } = require('../services/emailService');

async function processProofRequests() {
  console.log('--- Starting Proof of Payment Request Job ---');
  try {
    // Find unverified accounts older than 24 hours that haven't been requested yet
    const query = `
      SELECT * FROM dynamic_nuban_accounts 
      WHERE status IN ('INITIALIZED', 'PENDING')
      AND created_at < NOW() - INTERVAL '24 hours'
      AND proof_requested_at IS NULL
      AND email IS NOT NULL
    `;

    const result = await pool.query(query);
    console.log(`Found ${result.rows.length} pending transactions requiring proof.`);

    for (const row of result.rows) {
      console.log(`Processing proof request for Ref: ${row.transaction_ref}, Email: ${row.email}`);
      
      try {
        await mailgunEmailService.sendProofOfPaymentRequest({
          email: row.email,
          name: row.shareholder_name || 'Valued Shareholder',
          transactionRef: row.transaction_ref,
          amount: row.amount,
          accountNo: row.account_number,
          bankingPartner: row.banking_partner,
          createdAt: row.created_at
        });

        // Update the record so we don't send it again
        await pool.query(
          'UPDATE dynamic_nuban_accounts SET proof_requested_at = NOW() WHERE id = $1',
          [row.id]
        );
        
        console.log(`Successfully sent and updated record for ${row.transaction_ref}`);
      } catch (err) {
        console.error(`Failed to process ${row.transaction_ref}:`, err.message);
      }
    }
  } catch (error) {
    console.error('Job error:', error);
  } finally {
    console.log('--- Proof of Payment Request Job Finished ---');
    // If running as a standalone script, we might want to exit
    // process.exit(0);
  }
}

// If called directly
if (require.main === module) {
  processProofRequests().then(() => process.exit(0));
}

module.exports = processProofRequests;
