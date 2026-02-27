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

    if (transaction.status === 'VERIFIED') {
      console.log('Transaction already verified, returning success');
      return res.json({
        success: true,
        paymentReceived: true,
        data: { status: 'VERIFIED', amount: transaction.amount }
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
      console.log('Payment received! Updating database...');

      // Update transaction status
      await pool.query(
        'UPDATE dynamic_nuban_accounts SET status = $1, response = $2 WHERE transaction_ref = $3',
        ['VERIFIED', JSON.stringify(queryResult), txRef]
      );

      // Log transaction to wallet_actions for admin visibility
      const amountPaid = parseFloat(queryResult.data?.amountReceived || transaction.amount);
      const processorFee = Math.max(0, amountPaid - baseAmount);

      await pool.query(
        `INSERT INTO wallet_actions 
        (ledger_id, delta, transaction_type, transaction_ref, summary, timestamp) 
        VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          1, // Main ledger
          amountPaid,
          'CREDIT',
          txRef,
          `Rights Issue Payment - Account: ${transaction.account_number}`,
          new Date()
        ]
      );

      console.log('Transaction logged to wallet_actions');

      // Update or create wallet balance for the shareholder
      if (transaction.shareholder_id) {
        // Check if wallet exists for this shareholder
        const walletCheck = await pool.query(
          'SELECT id, balance FROM wallets WHERE shareholder_id = $1',
          [transaction.shareholder_id]
        );

        if (walletCheck.rows.length > 0) {
          // Update existing wallet balance
          const currentBalance = parseFloat(walletCheck.rows[0].balance) || 0;
          const newBalance = currentBalance + amountPaid;
          await pool.query(
            'UPDATE wallets SET balance = $1, updated_at = $2 WHERE shareholder_id = $3',
            [newBalance, new Date(), transaction.shareholder_id]
          );
          console.log(`Updated wallet balance to ${newBalance} for shareholder ${transaction.shareholder_id}`);
        } else {
          // Create new wallet for shareholder
          await pool.query(
            'INSERT INTO wallets (shareholder_id, balance, created_at, updated_at) VALUES ($1, $2, $3, $4)',
            [transaction.shareholder_id, amountPaid, new Date(), new Date()]
          );
          console.log(`Created wallet with balance ${amountPaid} for shareholder ${transaction.shareholder_id}`);
        }
      }

      // Update rights_submissions payment_status if submissionId provided
      if (submissionId) {
        await pool.query(
          `UPDATE rights_submissions 
           SET payment_status = $1, payment_ref = $2, payment_date = $3, updated_at = $4 
           WHERE id = $5`,
          ['successful', txRef, new Date(), new Date(), submissionId]
        );
        console.log('Updated rights_submissions payment_status to successful for ID:', submissionId);
      }

      // Send success email if we have shareholder email
      if (shareholderEmail) {
        try {
          await mailgunEmailService.sendPaymentSuccessEmail({
            email: shareholderEmail,
            name: shareholderName,
            transactionRef: txRef,
            amount: baseAmount,
            amountPaid: amountPaid,
            processorFee: processorFee,
            paymentDate: new Date().toLocaleString()
          });
          console.log('Payment success email sent to:', shareholderEmail);
        } catch (emailError) {
          console.error('Failed to send payment email:', emailError);
          // Don't fail the request if email fails
        }
      }

      return res.json({
        success: true,
        paymentReceived: true,
        data: { status: 'VERIFIED', amount: transaction.amount }
      });
    }

    // Check if payment explicitly failed
    if (queryResult.status === 'failed' || queryResult.data?.status === 'FAILED') {
      console.log('Payment failed! Updating database...');

      // Update transaction status to FAILED
      await pool.query(
        'UPDATE dynamic_nuban_accounts SET status = $1, response = $2 WHERE transaction_ref = $3',
        ['FAILED', JSON.stringify(queryResult), txRef]
      );

      // Update rights_submissions payment_status if submissionId provided
      if (submissionId) {
        await pool.query(
          `UPDATE rights_submissions 
           SET payment_status = $1, payment_ref = $2, updated_at = $3 
           WHERE id = $4`,
          ['failed', txRef, new Date(), submissionId]
        );
        console.log('Updated rights_submissions payment_status to failed for ID:', submissionId);
      }

      // Send failure email if we have shareholder email
      if (shareholderEmail) {
        try {
          await mailgunEmailService.sendPaymentFailureEmail({
            email: shareholderEmail,
            name: shareholderName,
            transactionRef: txRef,
            amount: baseAmount,
            errorMessage: queryResult.message || 'Payment verification failed',
            paymentDate: new Date().toLocaleString()
          });
          console.log('Payment failure email sent to:', shareholderEmail);
        } catch (emailError) {
          console.error('Failed to send payment failure email:', emailError);
        }
      }

      return res.json({
        success: true,
        paymentReceived: false,
        paymentFailed: true,
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

    // If already verified, just return success to Vetropay
    if (transaction.status === 'VERIFIED') {
      return res.status(200).json({ success: true, message: 'Already processed' });
    }

    // Verify with Vetropay to be sure (security)
    const queryResult = await paymentService.queryDynamic(txRef);
    console.log('Webhook: Vetropay query result:', JSON.stringify(queryResult, null, 2));

    if (queryResult.status === 'success' && queryResult.data?.paymentReceived === true) {
      console.log('Webhook: Payment verified! Updating systems...');

      const amountPaid = parseFloat(queryResult.data?.amountReceived || transaction.amount);
      const baseAmount = parseFloat(transaction.amount);
      const processorFee = Math.max(0, amountPaid - baseAmount);

      // 1. Update transaction status
      await pool.query(
        'UPDATE dynamic_nuban_accounts SET status = $1, response = $2 WHERE transaction_ref = $3',
        ['VERIFIED', JSON.stringify(queryResult), txRef]
      );

      // 2. Log to wallet_actions
      await pool.query(
        `INSERT INTO wallet_actions 
        (ledger_id, delta, transaction_type, transaction_ref, summary, timestamp) 
        VALUES ($1, $2, $3, $4, $5, $6)`,
        [1, amountPaid, 'CREDIT', txRef, `Webhook: Rights Issue Payment - Account: ${transaction.account_number}`, new Date()]
      );

      // 3. Update shareholder wallet
      if (transaction.shareholder_id) {
        const walletCheck = await pool.query(
          'SELECT id, balance FROM wallets WHERE shareholder_id = $1',
          [transaction.shareholder_id]
        );

        if (walletCheck.rows.length > 0) {
          const newBalance = (parseFloat(walletCheck.rows[0].balance) || 0) + amountPaid;
          await pool.query(
            'UPDATE wallets SET balance = $1, updated_at = $2 WHERE shareholder_id = $3',
            [newBalance, new Date(), transaction.shareholder_id]
          );
        } else {
          await pool.query(
            'INSERT INTO wallets (shareholder_id, balance, created_at, updated_at) VALUES ($1, $2, $3, $4)',
            [transaction.shareholder_id, amountPaid, new Date(), new Date()]
          );
        }
      }

      // 4. Update rights_submissions if applicable
      // Find submission associated with this txRef
      const submissionCheck = await pool.query(
        'SELECT id, name, email FROM rights_submissions WHERE payment_ref = $1',
        [txRef]
      );

      let shareholderName = transaction.name;
      let shareholderEmail = transaction.email;

      if (submissionCheck.rows.length > 0) {
        const submission = submissionCheck.rows[0];
        await pool.query(
          `UPDATE rights_submissions 
           SET payment_status = $1, payment_date = $2, updated_at = $3 
           WHERE id = $4`,
          ['successful', new Date(), new Date(), submission.id]
        );
        shareholderName = submission.name;
        shareholderEmail = submission.email;
        console.log('Webhook: Updated rights_submission status to successful for ID:', submission.id);
      }

      // 5. Send success email
      if (shareholderEmail) {
        try {
          await mailgunEmailService.sendPaymentSuccessEmail({
            email: shareholderEmail,
            name: shareholderName,
            transactionRef: txRef,
            amount: baseAmount,
            amountPaid: amountPaid,
            processorFee: processorFee,
            paymentDate: new Date().toLocaleString()
          });
          console.log('Webhook: Payment success email sent to:', shareholderEmail);
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
