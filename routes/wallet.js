const express = require('express');
const router = express.Router();
const paymentService = require('../services/paymentService');
const { mailgunEmailService } = require('../services/emailService');

const pool = require('../config/database');
const { updateSheetPaymentStatus } = require('../utils/googleSheets');

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
        // emitter.emit('createUserWallet', user.id); // emitter is not defined here
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
      const txRef = `E-RIGHTS-${Date.now()}-${user.id}`;
      const result = await paymentService.generateDynamic(txRef, amount);
      if (result.status === 'success') {
        await pool.query(
          'INSERT INTO dynamic_nuban_accounts (user_id, transaction_ref, status, account_number, banking_partner, amount, created_at, principal_amount) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)',
          [user.id, txRef, 'INITIALIZED', result.data.accountNo, result.data.bankingPartner, (result.data.amountToDeposit || amount).toString(), new Date(), amount.toString()]
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
      const queryResult = await paymentService.queryDynamic(txRef);
      if (queryResult.status === 'success' && queryResult.data?.paymentReceived === true) {
        const amountReceived = parseFloat(queryResult.data.amount || queryResult.data.amountReceived || 0) + 
                               parseFloat(queryResult.data.chargeAmount || queryResult.data.fee || 0);

        await pool.query('UPDATE dynamic_nuban_accounts SET status = $1, response = $2, amount_received = COALESCE(amount_received, 0) + $3, metadata = $5 WHERE transaction_ref = $4',
          ['VERIFIED', JSON.stringify(queryResult), amountReceived, txRef, JSON.stringify(queryResult.data)]);
        
        // Assuming emitter exists globally or is imported
        if (global.emitter) {
            global.emitter.emit("creditUserWallet", {
                req, user_id, amount: amountReceived,
                description: `Deposit via Dynamic Account: ${transaction.account_number}`,
                involvedLedgerId: 1, transaction_ref: txRef,
            });
        }
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
      
      if (global.emitter) {
          global.emitter.emit("creditUserWallet", {
            req, user_id: transaction.user_id, amount: transaction.amount_received || transaction.amount,
            description: `Manual verification - ${transactionRef}`,
            involvedLedgerId: 1, transaction_ref: transactionRef,
          });
      }
      return res.status(200).json({ success: true, message: 'Manually verified' });
    } catch (error) {
      console.error('Manual verification error:', error);
      res.status(500).json({ success: false, message: 'Error verifying' });
    }
  }
}

const controller = new WalletController();

const authenticate = (req, res, next) => {
  if (req.user) return next();
  return res.status(401).json({ error: 'Unauthorized' });
};

// --- PUBLIC ROUTES (FOR FORM SUBMISSION) ---

router.post('/public/generate-account', async (req, res) => {
  try {
    const { amount, shareholder_id, email, name } = req.body;
    console.log('Generating account for:', { amount, shareholder_id, email, name });

    if (!amount || isNaN(amount) || amount <= 0) {
      return res.status(400).json({ error: 'Valid deposit amount is required' });
    }

    if (shareholder_id) {
      const existing = await pool.query(
        `SELECT transaction_ref, account_number, banking_partner, amount, principal_amount
         FROM dynamic_nuban_accounts
         WHERE shareholder_id = $1 AND status = 'INITIALIZED' AND CAST(principal_amount AS NUMERIC) = $2
         ORDER BY created_at DESC LIMIT 1`,
        [shareholder_id, amount]
      );
      if (existing.rows.length > 0) {
        const row = existing.rows[0];
        return res.status(200).json({
          success: true,
          data: {
            accountNo: row.account_number,
            bankingPartner: row.banking_partner,
            txRef: row.transaction_ref,
            amountToDeposit: row.amount,
            principalAmount: row.principal_amount
          }
        });
      }
    }

    const txRef = `E-RIGHTS-${Date.now()}-${shareholder_id || 'GUEST'}`;
    const result = await paymentService.generateDynamic(txRef, amount);

    if (result.status === 'success') {
      const totalExpected = result.data.amountToDeposit || amount;
      await pool.query(
        'INSERT INTO dynamic_nuban_accounts (shareholder_id, transaction_ref, status, account_number, banking_partner, amount, created_at, principal_amount, email, shareholder_name) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)',
        [shareholder_id || null, txRef, 'INITIALIZED', result.data.accountNo, result.data.bankingPartner, totalExpected.toString(), new Date(), amount.toString(), email || null, name || null]
      );

      return res.status(200).json({
        success: true,
        data: {
          ...result.data,
          txRef,
          amountToDeposit: totalExpected.toString(),
          principalAmount: amount.toString()
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

    if (!txRef) {
      return res.status(400).json({ error: 'Transaction reference is required' });
    }

    const existingTransaction = await pool.query(
      "SELECT * FROM dynamic_nuban_accounts WHERE transaction_ref = $1",
      [txRef]
    );

    if (!existingTransaction.rows.length) {
      return res.status(404).json({ success: false, message: "Transaction not found" });
    }

    const transaction = existingTransaction.rows[0];
    const TERMINAL_STATUSES = ['VERIFIED', 'OVERPAID', 'UNDERPAID', 'FAILED'];

    if (TERMINAL_STATUSES.includes(transaction.status) && transaction.status !== 'UNDERPAID') {
      const baseAmount = parseFloat(transaction.amount);
      const amountPaid = parseFloat(transaction.amount_received || 0);
      const balance = transaction.status === 'UNDERPAID' ? Math.max(0, baseAmount - amountPaid) : 0;
      const excess = transaction.status === 'OVERPAID' ? Math.max(0, amountPaid - baseAmount) : 0;

      return res.json({
        success: true,
        paymentReceived: ['VERIFIED', 'OVERPAID'].includes(transaction.status),
        paymentStatus: transaction.status,
        amountExpected: baseAmount,
        amountPaid: amountPaid,
        balance: balance,
        excess: excess,
        principalAmount: parseFloat(transaction.principal_amount || baseAmount),
        processorFee: baseAmount - parseFloat(transaction.principal_amount || baseAmount),
        data: { status: transaction.status, amount: transaction.amount }
      });
    }

    const queryResult = await paymentService.queryDynamic(txRef);
    const data = queryResult.data || {};
    const shareholderEmail = email || transaction.email;
    const shareholderName = name || transaction.shareholder_name;

    if (queryResult.status === 'success' && data?.paymentReceived === true) {
      const newTotal = parseFloat(data.amount || data.amountReceived || 0); // Total NET received from Vetropay
      
      const baseAmount = parseFloat(transaction.amount); // Gross Goal
      const principalGoal = parseFloat(transaction.principal_amount || baseAmount); // Principal Goal
      
      // Calculate Gross using the original fee ratio if not explicitly provided
      const fees = parseFloat(data.chargeAmount || data.charge_amount || data.fee || data.fee_amount || 0);
      let newGross = parseFloat(data.totalPaid || (newTotal + fees));
      if (fees === 0 && principalGoal > 0) {
          // If no fees reported, interpolate based on the original request's fee ratio (ExpectedTotal / PrincipalGoal)
          newGross = newTotal * (baseAmount / principalGoal);
      }
      newGross = Math.round(newGross * 100) / 100; // Round for display
      
      const previousTotal = parseFloat(transaction.amount_received || 0);
      const amountReceived = newTotal - previousTotal; // NEW net amount to credit
      
      const TOLERANCE = 1;
      let dbStatus, submissionPaymentStatus, varianceType;
      const diff = newTotal - principalGoal;

      if (Math.abs(diff) <= TOLERANCE) {
        varianceType = 'exact'; dbStatus = 'VERIFIED'; submissionPaymentStatus = 'successful';
      } else if (diff > TOLERANCE) {
        varianceType = 'overpaid'; dbStatus = 'OVERPAID'; submissionPaymentStatus = 'overpaid';
      } else {
        varianceType = 'underpaid'; dbStatus = 'UNDERPAID'; submissionPaymentStatus = 'underpaid';
      }

      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        
        const locked = await client.query(
          'SELECT status, metadata FROM dynamic_nuban_accounts WHERE transaction_ref = $1 FOR UPDATE',
          [txRef]
        );

        if (TERMINAL_STATUSES.includes(locked.rows[0]?.status) && locked.rows[0]?.status !== 'UNDERPAID') {
           await client.query('ROLLBACK');
           return res.json({ success: true, paymentStatus: locked.rows[0].status }); // Already processed
        } else {
          // Build payment history — append this event to any existing history
          const existingMeta = locked.rows[0]?.metadata || {};
          const previousHistory = Array.isArray(existingMeta.payment_history) ? existingMeta.payment_history : [];
          const newMeta = {
            payment_history: [
              ...previousHistory,
              {
                status: dbStatus,
                gross_received: newGross,
                net_received: newTotal,
                amount_credited: amountReceived,
                timestamp: new Date().toISOString(),
              },
            ],
            vetropay: data,
          };

          await client.query(
            'UPDATE dynamic_nuban_accounts SET status = $1, response = $2, amount_received = $3, gross_amount_received = $5, metadata = $6 WHERE transaction_ref = $4',
            [dbStatus, JSON.stringify(queryResult), newTotal, txRef, newGross, JSON.stringify(newMeta)]
          );

          const uniqueTxRef = `${txRef}-${Date.now()}`;
          await client.query(
            `INSERT INTO wallet_actions (ledger_id, delta, transaction_type, transaction_ref, summary, timestamp)
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [1, amountReceived, 'CREDIT', uniqueTxRef, `Rights Issue Payment [${dbStatus}] - Account: ${transaction.account_number}`, new Date()]
          );

          if (transaction.shareholder_id) {
            await client.query(
              'INSERT INTO wallets (shareholder_id, balance, updated_at) VALUES ($1, $2, $3) ON CONFLICT (shareholder_id) DO UPDATE SET balance = wallets.balance + EXCLUDED.balance, updated_at = EXCLUDED.updated_at',
              [transaction.shareholder_id, amountReceived, new Date()]
            );
          }

          if (submissionId && (dbStatus === 'VERIFIED' || dbStatus === 'OVERPAID')) {
            await client.query(
              'UPDATE rights_submissions SET payment_status = $1, payment_ref = $2, payment_date = $3, updated_at = $4 WHERE id = $5',
              [submissionPaymentStatus, txRef, new Date(), new Date(), submissionId]
            );
          }
          await client.query('COMMIT');

          // Update Google Sheet column AA to CONFIRMED
          if (submissionId && (dbStatus === 'VERIFIED' || dbStatus === 'OVERPAID')) {
            updateSheetPaymentStatus(submissionId);
          }
        }
      } catch (dbError) {
        await client.query('ROLLBACK');
        throw dbError;
      } finally {
        client.release();
      }

      if (shareholderEmail) {
        const baseAmount = parseFloat(transaction.amount);
        const principalGoal = parseFloat(transaction.principal_amount || baseAmount);
        const fees = baseAmount - principalGoal;
        
        if (varianceType === 'exact') {
            await mailgunEmailService.sendPaymentSuccessEmail({
                email: shareholderEmail, name: shareholderName, transactionRef: txRef,
                amount: principalGoal, amountPaid: newTotal, processorFee: fees,
                paymentDate: new Date().toLocaleString()
            });
        } else if (varianceType === 'underpaid') {
            await mailgunEmailService.sendUnderpaymentEmail({
                email: shareholderEmail, name: shareholderName, transactionRef: txRef,
                principalAmount: principalGoal,
                processorFee: fees,
                expectedTotal: baseAmount,
                amountReceived: newGross,
                balancePayable: Math.max(0, principalGoal - newTotal),
                paymentDate: new Date().toLocaleString()
            });
        } else if (varianceType === 'overpaid') {
             await mailgunEmailService.sendOverpaymentEmail({
              email: shareholderEmail, name: shareholderName, transactionRef: txRef,
              amountExpected: principalGoal, amountReceived: newTotal, excess: diff,
              paymentDate: new Date().toLocaleString()
            });
        }
      }

      const princ = parseFloat(transaction.principal_amount || baseAmount);
      return res.json({
        success: true,
        paymentReceived: ['VERIFIED', 'OVERPAID'].includes(dbStatus),
        paymentStatus: dbStatus,
        amountExpected: baseAmount, // Gross Goal
        amountPaid: newTotal, // Total Net Received
        grossReceived: newGross, // Total Gross Received
        balance: dbStatus === 'UNDERPAID' ? Math.max(0, baseAmount - newTotal) : 0, // Legacy field
        balancePayable: Math.max(0, princ - newTotal), // Principal Balance
        principalAmount: princ,
        processorFee: baseAmount - princ,
        data: { status: dbStatus }
      });
    }

    return res.json({ success: true, paymentReceived: false, data: { status: transaction.status } });
  } catch (error) {
    console.error('Verify public payment error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/public/webhook', async (req, res) => {
  try {
    const { txRef } = req.body;
    if (!txRef) {
      return res.status(400).json({ success: false, message: 'Transaction reference is required' });
    }

    const existingTransaction = await pool.query(
      "SELECT * FROM dynamic_nuban_accounts WHERE transaction_ref = $1",
      [txRef]
    );

    if (!existingTransaction.rows.length) {
      return res.status(404).json({ success: false, message: "Transaction not found" });
    }

    const transaction = existingTransaction.rows[0];
    const TERMINAL_STATUSES = ['VERIFIED', 'OVERPAID', 'FAILED'];

    if (TERMINAL_STATUSES.includes(transaction.status)) {
       return res.status(200).json({ success: true, message: 'Already processed' });
    }

    const queryResult = await paymentService.queryDynamic(txRef);
    const data = queryResult.data || {};

    if (queryResult.status === 'success' && data?.paymentReceived === true) {
      const newTotal = parseFloat(data.amount || data.amountReceived || 0); // Total NET received from Vetropay
      
      const baseAmount = parseFloat(transaction.amount);
      const principalGoal = parseFloat(transaction.principal_amount || baseAmount);

      const fees = parseFloat(data.chargeAmount || data.charge_amount || data.fee || data.fee_amount || 0);
      let newGross = parseFloat(data.totalPaid || (newTotal + fees));
      if (fees === 0 && principalGoal > 0) {
          newGross = newTotal * (baseAmount / principalGoal);
      }
      newGross = Math.round(newGross * 100) / 100; // Round for display

      const previousTotal = parseFloat(transaction.amount_received || 0);
      const amountReceived = newTotal - previousTotal; // NEW net amount to credit
      
      if (amountReceived <= 0) {
        return res.status(200).json({ success: true, message: 'Already processed or no new payment' });
      }
      
      const TOLERANCE = 1;
      let dbStatus, submissionPaymentStatus, varianceType;
      const diff = newTotal - principalGoal;

      if (Math.abs(diff) <= TOLERANCE) {
        varianceType = 'exact'; dbStatus = 'VERIFIED'; submissionPaymentStatus = 'successful';
      } else if (diff > TOLERANCE) {
        varianceType = 'overpaid'; dbStatus = 'OVERPAID'; submissionPaymentStatus = 'overpaid';
      } else {
        varianceType = 'underpaid'; dbStatus = 'UNDERPAID'; submissionPaymentStatus = 'underpaid';
      }

      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const locked = await client.query('SELECT status, metadata FROM dynamic_nuban_accounts WHERE transaction_ref = $1 FOR UPDATE', [txRef]);

        if (TERMINAL_STATUSES.includes(locked.rows[0]?.status)) {
           await client.query('ROLLBACK');
        } else {
          const existingMeta = locked.rows[0]?.metadata || {};
          const previousHistory = Array.isArray(existingMeta.payment_history) ? existingMeta.payment_history : [];
          const newMeta = {
            payment_history: [
              ...previousHistory,
              {
                status: dbStatus,
                gross_received: newGross,
                net_received: newTotal,
                amount_credited: amountReceived,
                timestamp: new Date().toISOString(),
              },
            ],
            vetropay: data,
          };

          await client.query(
            'UPDATE dynamic_nuban_accounts SET status = $1, response = $2, amount_received = $3, gross_amount_received = $5, metadata = $6 WHERE transaction_ref = $4',
            [dbStatus, JSON.stringify(queryResult), newTotal, txRef, newGross, JSON.stringify(newMeta)]
          );

          const uniqueTxRef = `${txRef}-${Date.now()}`;
          await client.query(
            `INSERT INTO wallet_actions (ledger_id, delta, transaction_type, transaction_ref, summary, timestamp)
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [1, amountReceived, 'CREDIT', uniqueTxRef, `Rights Issue Payment [${dbStatus}] - Account: ${transaction.account_number}`, new Date()]
          );

          if (transaction.shareholder_id) {
            await client.query(
              'INSERT INTO wallets (shareholder_id, balance, updated_at) VALUES ($1, $2, $3) ON CONFLICT (shareholder_id) DO UPDATE SET balance = wallets.balance + EXCLUDED.balance, updated_at = EXCLUDED.updated_at',
              [transaction.shareholder_id, amountReceived, new Date()]
            );
          }

          const sub = await client.query('SELECT id, email, name FROM rights_submissions WHERE payment_ref = $1', [txRef]);
          if (sub.rows.length > 0 && (dbStatus === 'VERIFIED' || dbStatus === 'OVERPAID')) {
             await client.query('UPDATE rights_submissions SET payment_status = $1, payment_date = $2, updated_at = $3 WHERE id = $4',
               [submissionPaymentStatus, new Date(), new Date(), sub.rows[0].id]);
          }
          await client.query('COMMIT');

          // Update Google Sheet column AA to CONFIRMED
          if (sub.rows.length > 0 && (dbStatus === 'VERIFIED' || dbStatus === 'OVERPAID')) {
            updateSheetPaymentStatus(sub.rows[0].id);
          }

          const email = sub.rows[0]?.email || transaction.email;
          const name = sub.rows[0]?.name || transaction.shareholder_name;
          if (email) {
             const baseAmount = parseFloat(transaction.amount);
             const principalGoal = parseFloat(transaction.principal_amount || baseAmount);
             const fees = baseAmount - principalGoal;
             if (varianceType === 'exact') {
                 mailgunEmailService.sendPaymentSuccessEmail({ email, name, transactionRef: txRef, amount: principalGoal, amountPaid: newTotal, processorFee: fees, paymentDate: new Date().toLocaleString() });
             } else if (varianceType === 'underpaid') {
                 mailgunEmailService.sendUnderpaymentEmail({ email, name, transactionRef: txRef, principalAmount: principalGoal, processorFee: fees, expectedTotal: baseAmount, amountReceived: newGross, balancePayable: Math.max(0, principalGoal - newTotal), paymentDate: new Date().toLocaleString() });
             }
          }
        }
      } catch (err) {
        await client.query('ROLLBACK');
        console.error('Webhook DB Error:', err);
      } finally {
        client.release();
      }
    }
    return res.status(200).json({ success: true, message: 'Webhook processed' });
  } catch (error) {
    console.error('Webhook error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/data', authenticate, (req, res) => controller.getWalletData(req, res));
router.post('/generate-account', authenticate, (req, res) => controller.generateDynamicAccount(req, res));
router.post('/verify', authenticate, (req, res) => controller.queryDynamicAccount(req, res));
router.get('/transactions', authenticate, (req, res) => controller.listTransactions(req, res));
router.post('/admin/verify-manual', authenticate, (req, res) => controller.manualVerifyTransaction(req, res));

module.exports = router;
