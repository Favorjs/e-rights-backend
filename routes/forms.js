const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const { body, validationResult } = require('express-validator');
const { PDFDocument } = require('pdf-lib');
const fs = require('fs').promises;
const path = require('path');

// Generate payment account number
const generatePaymentAccountNumber = () => {
  const timestamp = Date.now().toString();
  const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
  return `238${timestamp.slice(-6)}${random}`;
};

// Submit form
router.post('/', [
  body('shareholder_id').isInt().withMessage('Shareholder ID must be a valid integer'),
  body('acceptance_type').isIn(['full', 'partial', 'renunciation']).withMessage('Invalid acceptance type'),
  body('contact_name').notEmpty().withMessage('Contact name is required'),
  body('email').isEmail().withMessage('Valid email is required'),
  body('signature_file').notEmpty().withMessage('Signature file is required'),
  body('receipt_file').notEmpty().withMessage('Receipt file is required')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ 
        error: 'Validation failed',
        details: errors.array() 
      });
    }

    const {
      shareholder_id,
      acceptance_type,
      shares_accepted,
      shares_renounced,
      additional_shares_applied,
      contact_name,
      next_of_kin,
      daytime_phone,
      mobile_phone,
      email,
      bank_name,
      bank_branch,
      account_number,
      bvn,
      signature_file,
      receipt_file
    } = req.body;

    // Get shareholder details to calculate amounts
    const shareholderQuery = `
      SELECT holdings, rights_issue, holdings_after 
      FROM shareholders 
      WHERE id = $1
    `;
    const shareholderResult = await pool.query(shareholderQuery, [shareholder_id]);
    
    if (shareholderResult.rows.length === 0) {
      return res.status(404).json({ error: 'Shareholder not found' });
    }

    const shareholder = shareholderResult.rows[0];
    let amount_payable = 0;
    let payment_account_number = null;

    // Calculate amount payable based on acceptance type
    if (acceptance_type === 'full') {
      amount_payable = shareholder.rights_issue * 50.0; // N50 per share
      payment_account_number = generatePaymentAccountNumber();
    } else if (acceptance_type === 'partial' && shares_accepted) {
      amount_payable = shares_accepted * 50.0;
      payment_account_number = generatePaymentAccountNumber();
    } else if (acceptance_type === 'partial' && additional_shares_applied) {
      amount_payable = additional_shares_applied * 50.0;
      payment_account_number = generatePaymentAccountNumber();
    }

    // Check if form already exists for this shareholder
    const existingFormQuery = `
      SELECT id FROM forms WHERE shareholder_id = $1
    `;
    const existingForm = await pool.query(existingFormQuery, [shareholder_id]);
    
    if (existingForm.rows.length > 0) {
      return res.status(400).json({ 
        error: 'Form already submitted for this shareholder' 
      });
    }

    // Insert form submission
    const insertQuery = `
      INSERT INTO forms (
        shareholder_id, acceptance_type, shares_accepted, shares_renounced,
        additional_shares_applied, amount_payable, payment_account_number,
        contact_name, next_of_kin, daytime_phone, mobile_phone, email,
        bank_name, bank_branch, account_number, bvn, signature_file, receipt_file
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
      RETURNING *
    `;

    const result = await pool.query(insertQuery, [
      shareholder_id, acceptance_type, shares_accepted, shares_renounced,
      additional_shares_applied, amount_payable, payment_account_number,
      contact_name, next_of_kin, daytime_phone, mobile_phone, email,
      bank_name, bank_branch, account_number, bvn, signature_file, receipt_file
    ]);

    res.status(201).json({
      success: true,
      message: 'Form submitted successfully',
      data: result.rows[0],
      payment_account_number
    });
  } catch (error) {
    console.error('Error submitting form:', error);
    res.status(500).json({ 
      error: 'Failed to submit form',
      message: error.message 
    });
  }
});

// Get form by shareholder ID
router.get('/shareholder/:shareholderId', async (req, res) => {
  try {
    const { shareholderId } = req.params;
    
    const query = `
      SELECT 
        f.*,
        s.reg_account_number,
        s.name as shareholder_name,
        s.holdings,
        s.rights_issue,
        s.holdings_after
      FROM forms f
      JOIN shareholders s ON f.shareholder_id = s.id
      WHERE f.shareholder_id = $1
    `;

    const result = await pool.query(query, [shareholderId]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ 
        error: 'Form not found for this shareholder' 
      });
    }

    res.json({
      success: true,
      data: result.rows[0]
    });
  } catch (error) {
    console.error('Error getting form:', error);
    res.status(500).json({ 
      error: 'Failed to get form',
      message: error.message 
    });
  }
});

// Get form by form ID
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const query = `
      SELECT 
        f.*,
        s.reg_account_number,
        s.name as shareholder_name,
        s.holdings,
        s.rights_issue,
        s.holdings_after
      FROM forms f
      JOIN shareholders s ON f.shareholder_id = s.id
      WHERE f.id = $1
    `;

    const result = await pool.query(query, [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ 
        error: 'Form not found' 
      });
    }

    res.json({
      success: true,
      data: result.rows[0]
    });
  } catch (error) {
    console.error('Error getting form:', error);
    res.status(500).json({ 
      error: 'Failed to get form',
      message: error.message 
    });
  }
});

// Update form status (admin only)
router.patch('/:id/status', async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    
    if (!['pending', 'completed', 'rejected'].includes(status)) {
      return res.status(400).json({ 
        error: 'Invalid status. Must be pending, completed, or rejected' 
      });
    }

    const query = `
      UPDATE forms 
      SET status = $1, updated_at = CURRENT_TIMESTAMP
      WHERE id = $2
      RETURNING *
    `;

    const result = await pool.query(query, [status, id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ 
        error: 'Form not found' 
      });
    }

    res.json({
      success: true,
      message: 'Form status updated successfully',
      data: result.rows[0]
    });
  } catch (error) {
    console.error('Error updating form status:', error);
    res.status(500).json({ 
      error: 'Failed to update form status',
      message: error.message 
    });
  }
});

// Add this route to your existing router
router.post('/generate-rights-form', async (req, res) => {
  try {
    const { shareholderName, holdings, rightsIssue, amountDue } = req.body;

    // 1. Load the PDF template with form fields
    const templatePath = path.join(__dirname, '../uploads/forms/TIP RIGHTS ISSUE.pdf');
    const pdfBytes = await fs.readFile(templatePath);
    
    // 2. Load PDF document
    const pdfDoc = await PDFDocument.load(pdfBytes);
    
    // 3. Try to get the form and fill the fields if they exist
    try {
      const form = pdfDoc.getForm();
      const fields = form.getFields();
      console.log('Available form fields:', fields.map(f => f.getName()));
      
      // Try to set fields if they exist
      const setFieldIfExists = (fieldName, value) => {
        try {
          const field = form.getField(fieldName);
          if (field) {
            field.setText(value.toString());
            console.log(`Set field '${fieldName}' to '${value}'`);
            return true;
          }
        } catch (e) {
          console.warn(`Could not set field '${fieldName}':`, e.message);
        }
        return false;
      };
      
      // Try different field name variations
      setFieldIfExists('shareholderName', shareholderName) ||
      setFieldIfExists('Shareholder Name', shareholderName) ||
      setFieldIfExists('Name', shareholderName);
      
      setFieldIfExists('holdings', holdings.toLocaleString()) ||
      setFieldIfExists('Shares Held', holdings.toLocaleString());
      
      setFieldIfExists('rightsIssue', rightsIssue.toLocaleString()) ||
      setFieldIfExists('Rights Allotted', rightsIssue.toLocaleString());
      
      // Use 'NGN' instead of '₦' to avoid font encoding issues
      setFieldIfExists('amountDue', 'NGN ' + amountDue.toLocaleString()) ||
      setFieldIfExists('Amount Due', 'NGN ' + amountDue.toLocaleString());
      
      // Flatten the form to make fields read-only
      form.flatten();
    } catch (formError) {
      console.warn('Error processing PDF form fields:', formError);
      // Continue even if form processing fails
    }
    
    // 4. Save the modified PDF
    const modifiedPdf = await pdfDoc.save();
    
    // 5. Send the PDF with proper headers
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="TIP_RIGHTS_${shareholderName.replace(/[^a-z0-9]/gi, '_').substring(0, 50)}.pdf"`);
    res.setHeader('Content-Length', modifiedPdf.length);
    res.send(Buffer.from(modifiedPdf));
    
  } catch (error) {
    console.error('PDF generation error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to generate PDF',
      message: error.message,
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

module.exports = router; 