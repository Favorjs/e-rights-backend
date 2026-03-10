const express = require('express');
const router = express.Router();
const paymentService = require('../services/paymentService');
const { mailgunEmailService } = require('../services/emailService');

const pool = require('../config/database');

class WalletController {

  async getWalletData(req, res) {
    try {
      const user = req.user;
      const limit = Number(req.query?.limit || 10)
      const offset = Number(req.query?.offset || 0)

      const result = await pool.query(`
        SELECT 
          w.id::int AS wallet_id,
          w.balance::numeric(14, 2) AS balance,
          (SELECT COUNT(*)::int FROM wallet_actions wa_count WHERE wa_count.wallet_id = w.id) AS total_transactions,
          COALESCE(
            json_agg(
              json_build_object(
                'transaction_id', t.uuid::text,
                'id', t.id,
                'amount', t.delta::numeric,
                'transaction_ref', t.transaction_ref::text,
                'transaction_type', t.transaction_type::text,
                'timestamp', t.timestamp::timestamptz,
                'summary', t.summary::text
              )
              ORDER BY t.timestamp DESC
            ) FILTER (WHERE t.id IS NOT NULL),
            '[]'::json
          ) AS transactions
        FROM wallets w
        LEFT JOIN (
          SELECT *
          FROM wallet_actions
          WHERE wallet_id = (SELECT id FROM wallets WHERE user_id = $1)
          ORDER BY timestamp DESC
          LIMIT $2 OFFSET $3
        ) t ON t.wallet_id = w.id
        WHERE w.user_id = $1
        GROUP BY w.id, w.balance;
        `, [user.id, limit, offset]);

      if (result.rows.length === 0) {
        emitter.emit('createUserWallet', user.id);
        return res.json({
          status: true,
          message: "Wallet is being initialized. Please refresh in a moment.",
          data: { wallet_id: null, balance: "0.00", total_transactions: 0, transactions: [] }
        });
      }

      return res.json({ status: true, message: "", data: result.rows[0] });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Internal server Error.' });
    }
  }

  async generateDynamicAccount(req, res) {
    try {
      const { amount } = req.body;
      const user = req.user;
      if (!amount || isNaN(amount) || amount <= 0) {
        return res.status(400).json({ error: 'Valid deposit amount is required' });
      }
      const txRef = `MMF-${Date.now()}-${user.id}`;
      const result = await paymentService.generateDynamic(txRef, amount);
      if (result.status === 'success') {
        await pool.query(
          'INSERT INTO dynamic_nuban_accounts (user_id, transaction_ref, status, account_number, banking_partner, amount, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7)',
          [user.id, txRef, 'INITIALIZED', result.data.accountNo, result.data.bankingPartner, amount.toString(), new Date()]
        );
        return res.status(200).json({ success: true, data: { ...result.data, txRef } });
      }
      return res.status(400).json({ error: result.message });
    } catch (error) {
      console.error('Generate account error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  async queryDynamicAccount(req, res) {
    try {
      const { txRef } = req.body;
      const user_id = req.user.id;


      const existingTransaction = await pool.query(
        "SELECT * FROM dynamic_nuban_accounts WHERE transaction_ref = $1",
        [txRef]
      );



      if (!existingTransaction.rows.length) {
        return res.status(404).json({ success: false, message: "Transaction not found" });
      }
      const transaction = existingTransaction.rows[0];
      if (transaction.status === 'VERIFIED') {
        return res.json({ success: true, message: "Transaction already processed", verified: true, data: transaction });
      }
      // const queryResult = await paymentService.queryDynamic(txRef);
      const queryResult = await paymentService.queryDynamic("adQbma04551");
      if (queryResult.status === 'success' && queryResult.data?.paymentReceived === true) {
        await pool.query('UPDATE dynamic_nuban_accounts SET status = $1, response = $2 WHERE transaction_ref = $3',
          ['VERIFIED', JSON.stringify(queryResult), txRef]);
        emitter.emit("creditUserWallet", {
          req, user_id, amount: transaction.amount,
          description: `Deposit via Dynamic Account: ${transaction.account_number}`,
          involvedLedgerId: 1, transaction_ref: txRef,
        });
        return res.status(200).json({ success: true, message: 'Payment verified!', paymentReceived: true });
      }
      return res.status(200).json({ success: true, message: 'Payment pending', paymentReceived: false });
    } catch (error) {
      console.error('Query Error:', error);
      res.status(500).json({ success: false, message: 'Internal server error' });
    }
  }

  async listTransactions(req, res) {
    try {
      const user_id = req.user.id;
      const { status, limit = 20, offset = 0 } = req.query;
      let query = `SELECT * FROM dynamic_nuban_accounts WHERE user_id = $1`;
      const params = [user_id];
      if (status) { query += ` AND status = $2`; params.push(status); }
      query += ` ORDER BY created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
      params.push(parseInt(limit), parseInt(offset));
      const transactions = await pool.query(query, params);
      return res.status(200).json({ success: true, data: transactions.rows });
    } catch (error) {
      console.error('Error listing transactions:', error);
      res.status(500).json({ success: false, message: 'Error retrieving transactions' });
    }
  }

  async manualVerifyTransaction(req, res) {
    try {
      const { transactionRef } = req.body;
      const accountRows = await pool.query(
        "SELECT * FROM dynamic_nuban_accounts WHERE transaction_ref = $1",
        [transactionRef]
      );
      if (accountRows.rows.length === 0) return res.status(404).json({ success: false, message: 'Transaction not found' });
      const transaction = accountRows.rows[0];
      if (transaction.status === 'VERIFIED') return res.status(200).json({ success: true, message: 'Already verified' });
      await pool.query("UPDATE dynamic_nuban_accounts SET status = 'VERIFIED' WHERE id = $1", [transaction.id]);
      emitter.emit("creditUserWallet", {
        req, user_id: transaction.user_id, amount: transaction.amount,
        description: `Manual verification - ${transactionRef}`,
        involvedLedgerId: 1, transaction_ref: transactionRef,
      });
      return res.status(200).json({ success: true, message: 'Manually verified' });
    } catch (error) {
      console.error('Manual verification error:', error);
      res.status(500).json({ success: false, message: 'Error verifying' });
    }
  }
}

const controller = new WalletController();

// Authentication middleware (mock or real)
const authenticate = (req, res, next) => {
  if (req.user) return next();
  return res.status(401).json({ error: 'Unauthorized' });
};

// --- PUBLIC ROUTES (FOR FORM SUBMISSION) ---

router.post('/public/generate-account', async (req, res) => {
  try {
    const { amount, shareholder_id } = req.body;

    if (!amount || isNaN(amount) || amount <= 0) {
      return res.status(400).json({ error: 'Valid deposit amount is required' });
    }

    const txRef = `E-RIGHTS-${Date.now()}-${shareholder_id || 'GUEST'}`;

    const result = await paymentService.generateDynamic(txRef, amount);

    if (result.status === 'success') {
      // Store account info in database
      await pool.query(
        'INSERT INTO dynamic_nuban_accounts (shareholder_id, transaction_ref, status, account_number, banking_partner, amount, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7)',
        [shareholder_id || null, txRef, 'INITIALIZED', result.data.accountNo, result.data.bankingPartner, amount.toString(), new Date()]
      );

      return res.status(200).json({
        success: true,
        data: {
          ...result.data,
          txRef,
        }
      });
    }

    return res.status(400).json({ error: result.message });
  } catch (error) {
    console.error('Generate public account error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/public/verify', async (req, res) => {
  try {
    const { txRef, email, name, submissionId } = req.body;

    console.log('Public verify called with txRef:', txRef, 'email:', email, 'submissionId:', submissionId);

    if (!txRef) {
      return res.status(400).json({ error: 'Transaction reference is required' });
    }

    const existingTransaction = await pool.query(
      "SELECT * FROM dynamic_nuban_accounts WHERE transaction_ref = $1",
      [txRef]
    );

    if (!existingTransaction.rows.length) {
      console.log('Transaction not found in database:', txRef);
      return res.status(404).json({ success: false, message: "Transaction not found" });
    }

    const transaction = existingTransaction.rows[0];
    console.log('Found transaction:', { txRef, status: transaction.status, amount: transaction.amount });

    // All statuses that mean the transaction has been fully processed — block re-processing
    const TERMINAL_STATUSES = ['VERIFIED', 'OVERPAID', 'UNDERPAID', 'FAILED'];

    if (TERMINAL_STATUSES.includes(transaction.status)) {
      console.log(`Transaction already in terminal state (${transaction.status}), skipping`);
      return res.json({
        success: true,
        paymentReceived: ['VERIFIED', 'OVERPAID'].includes(transaction.status),
        paymentStatus: transaction.status,
        data: { status: transaction.status, amount: transaction.amount }
      });
    }

    console.log('Querying Vetropay for payment status...');
    //const queryResult = await paymentService.queryDynamic(txRef);
    const queryResult = await paymentService.queryDynamic("adQbma04551");
    console.log('Vetropay response:', JSON.stringify(queryResult, null, 2));

    // Use email and name from request (passed from form step 5)
    const shareholderEmail = email;
    const shareholderName = name;
    const baseAmount = parseFloat(transaction.amount);

    if (queryResult.status === 'success' && queryResult.data?.paymentReceived === true) {
      console.log('Payment received! Checking amount variance...');

      const amountReceived = parseFloat(queryResult.data?.amountReceived || transaction.amount);
      const TOLERANCE = 1;

      let dbStatus, submissionPaymentStatus, varianceType;
      const diff = amountReceived - baseAmount;

      if (Math.abs(diff) <= TOLERANCE) {
        varianceType = 'exact'; dbStatus = 'VERIFIED'; submissionPaymentStatus = 'successful';
      } else if (diff > TOLERANCE) {
        varianceType = 'overpaid'; dbStatus = 'OVERPAID'; submissionPaymentStatus = 'overpaid';
        console.log(`Overpayment: received ₦${amountReceived}, expected ₦${baseAmount}, excess ₦${diff.toFixed(2)}`);
      } else {
        varianceType = 'underpaid'; dbStatus = 'UNDERPAID'; submissionPaymentStatus = 'underpaid';
        console.log(`Underpayment: received ₦${amountReceived}, expected ₦${baseAmount}, balance ₦${Math.abs(diff).toFixed(2)}`);
      }

      const excess = varianceType === 'overpaid' ? diff : 0;
      const balance = varianceType === 'underpaid' ? Math.abs(diff) : 0;

      // Acquire a row-level lock and perform all DB writes atomically.
      // The FOR UPDATE re-checks the status under the lock — if a concurrent
      // request already processed this transaction, we skip gracefully.
      const client = await pool.connect();
      try {
        await client.query('BEGIN');

        const locked = await client.query(
          'SELECT status FROM dynamic_nuban_accounts WHERE transaction_ref = $1 FOR UPDATE',
          [txRef]
        );

        if (TERMINAL_STATUSES.includes(locked.rows[0]?.status)) {
          // Another concurrent request beat us to it — nothing to do
          await client.query('ROLLBACK');
          console.log('Concurrent request already processed this transaction, skipping');
        } else {
          // 1. Update transaction status
          await client.query(
            'UPDATE dynamic_nuban_accounts SET status = $1, response = $2, amount_received = $3 WHERE transaction_ref = $4',
            [dbStatus, JSON.stringify(queryResult), amountReceived, txRef]
          );

          // 2. Log to wallet_actions — ON CONFLICT is the last line of defence against duplicates
          await client.query(
            `INSERT INTO wallet_actions
             (ledger_id, delta, transaction_type, transaction_ref, summary, timestamp)
             VALUES ($1, $2, $3, $4, $5, $6)
             ON CONFLICT (transaction_ref) DO NOTHING`,
            [1, amountReceived, 'CREDIT', txRef,
             `Rights Issue Payment [${dbStatus}] - Account: ${transaction.account_number}`, new Date()]
          );

          // 3. Update wallet atomically (balance = balance + amount avoids read-modify-write race)
          if (transaction.shareholder_id) {
            const walletExists = await client.query(
              'SELECT id FROM wallets WHERE shareholder_id = $1', [transaction.shareholder_id]
            );
            if (walletExists.rows.length > 0) {
              await client.query(
                'UPDATE wallets SET balance = balance + $1, updated_at = $2 WHERE shareholder_id = $3',
                [amountReceived, new Date(), transaction.shareholder_id]
              );
            } else {
              await client.query(
                'INSERT INTO wallets (shareholder_id, balance, created_at, updated_at) VALUES ($1, $2, $3, $4)',
                [transaction.shareholder_id, amountReceived, new Date(), new Date()]
              );
            }
          }

          // 4. Update rights_submissions if submissionId provided
          if (submissionId) {
            await client.query(
              `UPDATE rights_submissions
               SET payment_status = $1, payment_ref = $2, payment_date = $3, updated_at = $4
               WHERE id = $5`,
              [submissionPaymentStatus, txRef, new Date(), new Date(), submissionId]
            );
            console.log(`Updated rights_submissions to '${submissionPaymentStatus}' for ID:`, submissionId);
          }

          await client.query('COMMIT');
          console.log('Transaction committed to wallet_actions');
        }
      } catch (dbError) {
        await client.query('ROLLBACK');
        throw dbError;
      } finally {
        client.release();
      }

      // Send email outside the transaction (non-critical, failures won't roll back payment)
      if (shareholderEmail) {
        try {
          if (varianceType === 'exact') {
            await mailgunEmailService.sendPaymentSuccessEmail({
              email: shareholderEmail, name: shareholderName, transactionRef: txRef,
              amount: baseAmount, amountPaid: amountReceived, processorFee: 0,
              paymentDate: new Date().toLocaleString()
            });
          } else if (varianceType === 'overpaid') {
            await mailgunEmailService.sendOverpaymentEmail({
              email: shareholderEmail, name: shareholderName, transactionRef: txRef,
              amountExpected: baseAmount, amountReceived, excess,
              paymentDate: new Date().toLocaleString()
            });
          } else if (varianceType === 'underpaid') {
            await mailgunEmailService.sendUnderpaymentEmail({
              email: shareholderEmail, name: shareholderName, transactionRef: txRef,
              amountExpected: baseAmount, amountReceived, balance,
              paymentDate: new Date().toLocaleString()
            });
          }
          console.log(`Payment ${varianceType} email sent to:`, shareholderEmail);
        } catch (emailError) {
          console.error('Failed to send payment email:', emailError);
        }
      }

      if (varianceType === 'exact' || varianceType === 'overpaid') {
        return res.json({
          success: true, paymentReceived: true, paymentStatus: dbStatus,
          amountExpected: baseAmount, amountPaid: amountReceived,
          excess: varianceType === 'overpaid' ? excess : 0,
          data: { status: dbStatus, amount: transaction.amount }
        });
      }

      return res.json({
        success: true, paymentReceived: false, paymentStatus: 'UNDERPAID',
        amountExpected: baseAmount, amountPaid: amountReceived, balance,
        data: { status: 'UNDERPAID', amount: transaction.amount }
      });
    }

    // Payment explicitly failed
    if (queryResult.status === 'failed' || queryResult.data?.status === 'FAILED') {
      console.log('Payment failed! Updating database...');
      await pool.query(
        'UPDATE dynamic_nuban_accounts SET status = $1, response = $2 WHERE transaction_ref = $3',
        ['FAILED', JSON.stringify(queryResult), txRef]
      );
      if (submissionId) {
        await pool.query(
          `UPDATE rights_submissions SET payment_status = $1, payment_ref = $2, updated_at = $3 WHERE id = $4`,
          ['failed', txRef, new Date(), submissionId]
        );
      }
      if (shareholderEmail) {
        try {
          await mailgunEmailService.sendPaymentFailureEmail({
            email: shareholderEmail, name: shareholderName, transactionRef: txRef,
            amount: baseAmount, errorMessage: queryResult.message || 'Payment verification failed',
            paymentDate: new Date().toLocaleString()
          });
        } catch (emailError) {
          console.error('Failed to send payment failure email:', emailError);
        }
      }
      return res.json({
        success: true, paymentReceived: false, paymentFailed: true,
        data: { status: 'FAILED', amount: transaction.amount }
      });
    }

    console.log('Payment not yet received, returning pending');
    return res.json({
      success: true,
      paymentReceived: false,
      data: { status: transaction.status }
    });
  } catch (error) {
    console.error('Verify public payment error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/public/webhook', async (req, res) => {
  try {
    const { txRef, status, amount } = req.body;
    console.log('Webhook received:', { txRef, status, amount });

    if (!txRef) {
      return res.status(400).json({ success: false, message: 'Transaction reference is required' });
    }

    // Direct lookup in our database
    const existingTransaction = await pool.query(
      "SELECT * FROM dynamic_nuban_accounts WHERE transaction_ref = $1",
      [txRef]
    );

    if (!existingTransaction.rows.length) {
      console.log('Webhook: Transaction not found in database:', txRef);
      return res.status(404).json({ success: false, message: "Transaction not found" });
    }

    const transaction = existingTransaction.rows[0];

    // All terminal statuses — block re-processing for all of them, not just VERIFIED
    const TERMINAL_STATUSES = ['VERIFIED', 'OVERPAID', 'UNDERPAID', 'FAILED'];

    if (TERMINAL_STATUSES.includes(transaction.status)) {
      console.log(`Webhook: Transaction already in terminal state (${transaction.status}), skipping`);
      return res.status(200).json({ success: true, message: 'Already processed' });
    }

    // Verify with Vetropay to be sure (security) — no DB lock held during external call
    const queryResult = await paymentService.queryDynamic(txRef);
    console.log('Webhook: Vetropay query result:', JSON.stringify(queryResult, null, 2));

    if (queryResult.status === 'success' && queryResult.data?.paymentReceived === true) {
      console.log('Webhook: Payment received! Checking amount variance...');

      const amountReceived = parseFloat(queryResult.data?.amountReceived || transaction.amount);
      const baseAmount = parseFloat(transaction.amount);
      const TOLERANCE = 1;
      const diff = amountReceived - baseAmount;

      let dbStatus, submissionPaymentStatus, varianceType;
      if (Math.abs(diff) <= TOLERANCE) {
        varianceType = 'exact'; dbStatus = 'VERIFIED'; submissionPaymentStatus = 'successful';
      } else if (diff > TOLERANCE) {
        varianceType = 'overpaid'; dbStatus = 'OVERPAID'; submissionPaymentStatus = 'overpaid';
      } else {
        varianceType = 'underpaid'; dbStatus = 'UNDERPAID'; submissionPaymentStatus = 'underpaid';
      }
      const excess = varianceType === 'overpaid' ? diff : 0;
      const balance = varianceType === 'underpaid' ? Math.abs(diff) : 0;

      console.log(`Webhook: variance=${varianceType}, received=₦${amountReceived}, expected=₦${baseAmount}`);

      // Acquire row-level lock and perform all DB writes atomically.
      // FOR UPDATE re-checks status under the lock — if a concurrent request
      // (e.g. the user also hitting /public/verify) already processed this, skip.
      let shareholderName = transaction.shareholder_name;
      let shareholderEmail = transaction.email;

      const client = await pool.connect();
      try {
        await client.query('BEGIN');

        const locked = await client.query(
          'SELECT status FROM dynamic_nuban_accounts WHERE transaction_ref = $1 FOR UPDATE',
          [txRef]
        );

        if (TERMINAL_STATUSES.includes(locked.rows[0]?.status)) {
          await client.query('ROLLBACK');
          console.log('Webhook: Concurrent request already processed this transaction, skipping');
        } else {
          // 1. Update transaction status
          await client.query(
            'UPDATE dynamic_nuban_accounts SET status = $1, response = $2, amount_received = $3 WHERE transaction_ref = $4',
            [dbStatus, JSON.stringify(queryResult), amountReceived, txRef]
          );

          // 2. Log to wallet_actions — ON CONFLICT is last line of defence against duplicates
          await client.query(
            `INSERT INTO wallet_actions
             (ledger_id, delta, transaction_type, transaction_ref, summary, timestamp)
             VALUES ($1, $2, $3, $4, $5, $6)
             ON CONFLICT (transaction_ref) DO NOTHING`,
            [1, amountReceived, 'CREDIT', txRef,
             `Webhook: Rights Issue Payment [${dbStatus}] - Account: ${transaction.account_number}`, new Date()]
          );

          // 3. Update wallet atomically (balance = balance + amount avoids read-modify-write race)
          if (transaction.shareholder_id) {
            const walletExists = await client.query(
              'SELECT id FROM wallets WHERE shareholder_id = $1', [transaction.shareholder_id]
            );
            if (walletExists.rows.length > 0) {
              await client.query(
                'UPDATE wallets SET balance = balance + $1, updated_at = $2 WHERE shareholder_id = $3',
                [amountReceived, new Date(), transaction.shareholder_id]
              );
            } else {
              await client.query(
                'INSERT INTO wallets (shareholder_id, balance, created_at, updated_at) VALUES ($1, $2, $3, $4)',
                [transaction.shareholder_id, amountReceived, new Date(), new Date()]
              );
            }
          }

          // 4. Update rights_submissions if applicable
          const submissionCheck = await client.query(
            'SELECT id, name, email FROM rights_submissions WHERE payment_ref = $1', [txRef]
          );

          if (submissionCheck.rows.length > 0) {
            const submission = submissionCheck.rows[0];
            await client.query(
              `UPDATE rights_submissions
               SET payment_status = $1, payment_date = $2, updated_at = $3
               WHERE id = $4`,
              [submissionPaymentStatus, new Date(), new Date(), submission.id]
            );
            shareholderName = submission.name;
            shareholderEmail = submission.email;
            console.log(`Webhook: Updated rights_submission to '${submissionPaymentStatus}' for ID:`, submission.id);
          }

          await client.query('COMMIT');
          console.log('Webhook: Transaction committed');
        }
      } catch (dbError) {
        await client.query('ROLLBACK');
        throw dbError;
      } finally {
        client.release();
      }

      // Send email outside the transaction (non-critical)
      if (shareholderEmail) {
        try {
          if (varianceType === 'exact') {
            await mailgunEmailService.sendPaymentSuccessEmail({
              email: shareholderEmail, name: shareholderName, transactionRef: txRef,
              amount: baseAmount, amountPaid: amountReceived, processorFee: 0,
              paymentDate: new Date().toLocaleString()
            });
          } else if (varianceType === 'overpaid') {
            await mailgunEmailService.sendOverpaymentEmail({
              email: shareholderEmail, name: shareholderName, transactionRef: txRef,
              amountExpected: baseAmount, amountReceived, excess,
              paymentDate: new Date().toLocaleString()
            });
          } else if (varianceType === 'underpaid') {
            await mailgunEmailService.sendUnderpaymentEmail({
              email: shareholderEmail, name: shareholderName, transactionRef: txRef,
              amountExpected: baseAmount, amountReceived, balance,
              paymentDate: new Date().toLocaleString()
            });
          }
          console.log(`Webhook: Payment ${varianceType} email sent to:`, shareholderEmail);
        } catch (emailError) {
          console.error('Webhook: Failed to send payment email:', emailError);
        }
      }

      return res.status(200).json({ success: true, message: 'Webhook processed successfully' });
    } else {
      console.log('Webhook: Payment not yet confirmed by Vetropay query');
      return res.status(200).json({ success: true, message: 'Webhook received, but payment not yet confirmed by provider' });
    }

  } catch (error) {
    console.error('Webhook processing error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// --- AUTHENTICATED ROUTES ---

router.get('/data', authenticate, (req, res) => controller.getWalletData(req, res));
router.post('/generate-account', authenticate, (req, res) => controller.generateDynamicAccount(req, res));
router.post('/verify', authenticate, (req, res) => controller.queryDynamicAccount(req, res));
router.get('/transactions', authenticate, (req, res) => controller.listTransactions(req, res));

// Admin routes
router.post('/admin/verify-manual', authenticate, (req, res) => controller.manualVerifyTransaction(req, res));

module.exports = router;
