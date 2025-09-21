const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const { body, validationResult } = require('express-validator');
const { PDFDocument } = require('pdf-lib');
const fs = require('fs').promises;
const path = require('path');
// Serve static files from uploads directory
// app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
const { sendRightsSubmissionNotification,  sendShareholderConfirmation } = require('../services/emailService');

// Helper: generate filled rights PDF as Buffer from provided fields
async function generateRightsPdfBuffer(formData) {
  const templatePath = path.join(__dirname, '../uploads/forms/TIP RIGHTS ISSUE.pdf');
  const pdfBytes = await fs.readFile(templatePath);
  const pdfDoc = await PDFDocument.load(pdfBytes);

  try {
    const form = pdfDoc.getForm();
    const setFieldIfExists = (fieldName, value) => {
      try {
        const field = form.getField(fieldName);
        if (field && typeof field.setText === 'function') {
          field.setText(String(value ?? ''));
          return true;
        }
      } catch (_) {}
      return false;
    };

 
   
    // Basic shareholder info
    setFieldIfExists('reg_account_number', formData.reg_account_number) ||
      setFieldIfExists('Registration account number', formData.reg_account_number);
    
    setFieldIfExists('shareholder_name', formData.name) ||
      setFieldIfExists('Name', formData.name);

    // Rights and shares info
    setFieldIfExists('holdings', (formData.holdings ?? '').toLocaleString?.() ?? formData.holdings) ||
      setFieldIfExists('Shares Held', (formData.holdings ?? '').toLocaleString?.() ?? formData.holdings);

    setFieldIfExists('rights_issue', (formData.rights_issue ?? '').toLocaleString?.() ?? formData.rights_issue) ||
      setFieldIfExists('Rights Allotted', (formData.rights_issue ?? '').toLocaleString?.() ?? formData.rights_issue);

    setFieldIfExists('amount_due', `NGN ${(formData.amount_due ?? '').toLocaleString?.() ?? formData.amount_due}`) ||
      setFieldIfExists('Amount Due', `NGN ${(formData.amount_due ?? '').toLocaleString?.() ?? formData.amount_due}`);

    // Stockbroker & CHN details
    setFieldIfExists('stockbroker', formData.stockbroker) ||
      setFieldIfExists('Stockbroker', formData.stockbroker);

    setFieldIfExists('chn', formData.chn) ||
      setFieldIfExists('CHN number', formData.chn);

    // Action type specific fields
    if (formData.action_type === 'full_acceptance') {
      setFieldIfExists('accept_full', formData.accept_full ? 'Yes' : 'No') ||
        setFieldIfExists('Accept full allotment', formData.accept_full ? 'Yes' : 'No');

      setFieldIfExists('apply_additional', formData.apply_additional ? 'Yes' : 'No') ||
        setFieldIfExists('Apply for additional shares', formData.apply_additional ? 'Yes' : 'No');

      if (formData.apply_additional) {
        setFieldIfExists('additional_shares', formData.additional_shares) ||
          setFieldIfExists('Additional shares applied', formData.additional_shares);

        setFieldIfExists('additional_amount', formData.additional_amount) ||
          setFieldIfExists('Additional amount payable', formData.additional_amount);

        setFieldIfExists('accept_smaller_allotment', formData.accept_smaller_allotment ? 'Yes' : 'No') ||
          setFieldIfExists('Accept smaller allotment', formData.accept_smaller_allotment ? 'Yes' : 'No');
      }

      setFieldIfExists('payment_amount', formData.payment_amount) ||
        setFieldIfExists('Payment amount', formData.payment_amount);

      setFieldIfExists('bank_name', formData.bank_name) ||
        setFieldIfExists('Bank name', formData.bank_name);

      setFieldIfExists('cheque_number', formData.cheque_number) ||
        setFieldIfExists('Cheque number', formData.cheque_number);

      setFieldIfExists('branch', formData.branch) ||
        setFieldIfExists('Branch', formData.branch);
    } else {
      setFieldIfExists('shares_accepted', formData.shares_accepted) ||
        setFieldIfExists('Shares accepted', formData.shares_accepted);

      setFieldIfExists('amount_payable', formData.amount_payable) ||
        setFieldIfExists('Amount payable', formData.amount_payable);

      setFieldIfExists('shares_renounced', formData.shares_renounced) ||
        setFieldIfExists('Shares renounced', formData.shares_renounced);

      setFieldIfExists('accept_partial', formData.accept_partial ? 'Yes' : 'No') ||
        setFieldIfExists('Accept partial', formData.accept_partial ? 'Yes' : 'No');

      setFieldIfExists('renounce_rights', formData.renounce_rights ? 'Yes' : 'No') ||
        setFieldIfExists('Renounce rights', formData.renounce_rights ? 'Yes' : 'No');

      setFieldIfExists('trade_rights', formData.trade_rights ? 'Yes' : 'No') ||
        setFieldIfExists('Trade rights', formData.trade_rights ? 'Yes' : 'No');
    }

    // Personal details
    setFieldIfExists('contact_name', formData.contact_name) ||
      setFieldIfExists('Names', formData.contact_name);

    setFieldIfExists('next_of_kin', formData.next_of_kin) ||
      setFieldIfExists('Next of kin', formData.next_of_kin);

    setFieldIfExists('daytime_phone', formData.daytime_phone) ||
      setFieldIfExists('Day time telephone number', formData.daytime_phone);

    setFieldIfExists('mobile_phone', formData.mobile_phone) ||
      setFieldIfExists('Mobile (GSM) TELEPHONE NUMBER', formData.mobile_phone);

    setFieldIfExists('email', formData.email) ||
      setFieldIfExists('Email address', formData.email);

    // Bank details for e-dividend
    setFieldIfExists('bank_name_edividend', formData.bank_name_edividend) ||
      setFieldIfExists('E-dividend bank name', formData.bank_name_edividend);

    setFieldIfExists('bank_branch_edividend', formData.bank_branch_edividend) ||
      setFieldIfExists('E-dividend branch', formData.bank_branch_edividend);

    setFieldIfExists('account_number', formData.account_number) ||
      setFieldIfExists('Account number', formData.account_number);

    setFieldIfExists('bvn', formData.bvn) ||
      setFieldIfExists('Bank verification number', formData.bvn);

    // Corporate details
    if (formData.corporate_signatory_names) {
      setFieldIfExists('corporate_signatory_names', formData.corporate_signatory_names) ||
        setFieldIfExists('Corporate signatories', formData.corporate_signatory_names);

      setFieldIfExists('corporate_designations', formData.corporate_designations) ||
        setFieldIfExists('Corporate designations', formData.corporate_designations);
    }

    // Signature type
    setFieldIfExists('signature_type', formData.signature_type === 'single' ? 'Single' : 'Joint') ||
      setFieldIfExists('Signature type', formData.signature_type === 'single' ? 'Single' : 'Joint');

    form.flatten();
  } catch (_) {
    // ignore if form fields not present; we still return original template
  } 
  const modifiedPdf = await pdfDoc.save();
  return Buffer.from(modifiedPdf);
}

// Helper: persist a PDF buffer to uploads/forms and return relative path
async function savePdfBufferToUploadsForms(pdfBuffer) {
  const fileName = `filled-form-${Date.now()}-${Math.floor(Math.random() * 1000000000)}.pdf`;
  const absPath = path.join(__dirname, '../uploads/forms', fileName);
  await fs.writeFile(absPath, pdfBuffer);
  return `forms/${fileName}`;
}

// Helper function to clean numeric fields
const cleanNumericField = (value) => {
  if (value === '' || value === null || value === undefined) return null;
  const num = Number(value);
  return isNaN(num) ? null : num;
};

// Generate payment account number
// const generatePaymentAccountNumber = () => {
//   const timestamp = Date.now().toString();
//   const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
//   return `238${timestamp.slice(-6)}${random}`;
// };

// Preview rights form PDF (returns PDF buffer without saving)
router.post('/preview-rights', async (req, res) => {
  try {
    const formData = req.body;
    
    // Validate required fields based on action type
    let requiredFields = [
      'stockbroker', 'chn', 'action_type', 'contact_name', 'next_of_kin',
      'daytime_phone', 'mobile_phone', 'email', 'bank_name_edividend',
      'bank_branch_edividend', 'account_number', 'bvn'
    ];

    if (formData.action_type === 'full_acceptance') {
      requiredFields = [...requiredFields, 'accept_full', 'payment_amount', 'bank_name', 'cheque_number', 'branch'];
    } else {
      requiredFields = [...requiredFields, 'shares_accepted', 'amount_payable', 'shares_renounced'];
    }
    
    const missingFields = requiredFields.filter(field => !formData[field] || formData[field].toString().trim() === '');
    
    if (missingFields.length > 0) {
      return res.status(400).json({
        error: 'Missing required fields',
        message: 'All fields must be completed to preview the form',
        missingFields
      });
    }

  
      // Generate PDF buffer
      const pdfBuffer = await generateRightsPdfBuffer(formData);
    
      // Return PDF with proper headers
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', 'inline; filename="rights-form-preview.pdf"');
      res.setHeader('Content-Length', pdfBuffer.length);
      res.send(pdfBuffer);
      
    } catch (error) {
      console.error('Error generating preview:', error);
      res.status(500).json({ 
        error: 'Failed to generate preview',
        message: error.message 
      });
    }
  });


// Submit rights issue form with comprehensive validation
router.post('/submit-rights', async (req, res) => {
  try {
    let formData = req.body;
    
    // Clean numeric fields
    const numericFields = [
      'shareholder_id', 'stockbroker', 'additional_shares', 'additional_amount',
      'payment_amount', 'shares_accepted', 'amount_payable', 'shares_renounced',
      'holdings', 'rights_issue', 'holdings_after', 'amount_due'
    ];
    
    // Create a new object with cleaned numeric fields
    const cleanedFormData = { ...formData };
    numericFields.forEach(field => {
      if (field in cleanedFormData) {
        cleanedFormData[field] = cleanNumericField(cleanedFormData[field]);
      }
    });
    
    formData = cleanedFormData;

    // Calculate amount payable based on shares accepted and price per share
    const pricePerShare = 1.50; // Set your price per share here or get it from config
    
    if (formData.action_type === 'full_acceptance') {
      // For full acceptance, amount payable is rights_issue * price per share
      formData.amount_payable = (formData.rights_issue * pricePerShare).toFixed(2);
      formData.shares_accepted = formData.rights_issue;
      formData.shares_renounced = 0;
    } else if (formData.action_type === 'partial_acceptance') {
      // For partial acceptance, amount payable is shares_accepted * price per share
      formData.amount_payable = (formData.shares_accepted * pricePerShare).toFixed(2);
      formData.shares_renounced = formData.rights_issue - formData.shares_accepted;
    } else if (formData.action_type === 'renounce') {
      // For renunciation, amount payable is 0
      formData.amount_payable = 0;
      formData.shares_accepted = 0;
      formData.shares_renounced = formData.rights_issue;
    }

    // Validate required fields based on action type
    let requiredFields = [
      'shareholder_id', 'stockbroker', 'chn', 'action_type', 'instructions_read',
      'contact_name', 'next_of_kin', 'daytime_phone', 'mobile_phone', 'email',
      'bank_name_edividend', 'bank_branch_edividend', 'account_number', 'bvn',
      'signature_type'
    ];

    if (formData.action_type === 'full_acceptance') {
      requiredFields = [...requiredFields, 'accept_full', 'payment_amount', 'bank_name', 'cheque_number', 'branch'];
    } else {
      requiredFields = [...requiredFields, 'shares_accepted', 'amount_payable', 'shares_renounced'];
    }
    
    const missingFields = requiredFields.filter(field => !formData[field] || formData[field].toString().trim() === '');
    
    if (missingFields.length > 0) {
      return res.status(400).json({
        error: 'Missing required fields',
        message: 'All fields must be completed to submit the form',
        missingFields
      });
    }

    // Check if form already exists for this shareholder
    const existingFormQuery = `
      SELECT id FROM rights_submissions WHERE shareholder_id = $1
    `;
    const existingForm = await pool.query(existingFormQuery, [formData.shareholder_id]);
    
    if (existingForm.rows.length > 0) {
      return res.status(400).json({ 
        error: 'Form already submitted for this shareholder',
        message: 'A rights issue form has already been submitted for this shareholder' 
      });
    }

    // Handle receipt upload
    let receiptPath = null;
    if (req.files && req.files.receipt) {
      const receipt = req.files.receipt;
      const receiptExt = path.extname(receipt.name);
      const receiptFileName = `receipt-${Date.now()}-${Math.floor(Math.random() * 1000000000)}${receiptExt}`;
      receiptPath = path.join(__dirname, '../uploads/receipts', receiptFileName);
      await receipt.mv(receiptPath);
      receiptPath = `receipts/${receiptFileName}`;
    } else if (formData.action_type !== 'renounce') {
      return res.status(400).json({
        error: 'Receipt required',
        message: 'Payment receipt is required to submit the form'
      });
    }

    // Handle signature upload(s)
    const signaturePaths = [];
    if (req.files) {
      // Get all signature files
      const signatureFiles = Object.entries(req.files)
        .filter(([key]) => key.startsWith('signature_'))
        .map(([_, file]) => file);

      if (signatureFiles.length === 0) {
        return res.status(400).json({
          error: 'Signature required',
          message: 'At least one signature is required to submit the form'
        });
      }

      for (const signature of signatureFiles) {
        const signatureExt = path.extname(signature.name);
        const signatureFileName = `signature-${Date.now()}-${Math.floor(Math.random() * 1000000000)}${signatureExt}`;
        const signatureFilePath = path.join(__dirname, '../uploads/signatures', signatureFileName);
        await signature.mv(signatureFilePath);
        signaturePaths.push(`signatures/${signatureFileName}`);
      }
    }

    // Generate filled PDF from form data
    const pdfBuffer = await generateRightsPdfBuffer(formData);
    const filledFormPath = await savePdfBufferToUploadsForms(pdfBuffer);

    // Insert rights submission with all form data
    const insertQuery = `
      INSERT INTO rights_submissions (
        shareholder_id, instructions_read, stockbroker_id, chn, action_type,
        accept_full, apply_additional, additional_shares, additional_amount,
        accept_smaller_allotment, payment_amount, payment_bank_name, payment_cheque_number, payment_branch,
        shares_accepted, amount_payable, shares_renounced, accept_partial, renounce_rights, trade_rights,
        contact_name, next_of_kin, daytime_phone, mobile_phone, email,
        bank_name_edividend, bank_branch_edividend, account_number, bvn,
        corporate_signatory_names, corporate_designations,
        signature_type, reg_account_number, name, holdings, rights_issue,
        holdings_after, amount_due, filled_form_path, receipt_path, signature_paths,
        status, created_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16,
        $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30,
        $31, $32, $33, $34, $35, $36, $37, $38, $39, $40, $41, 'pending', CURRENT_TIMESTAMP
      )
      RETURNING *
    `;

    const result = await pool.query(insertQuery, [
      formData.shareholder_id, formData.instructions_read, formData.stockbroker, formData.chn, formData.action_type,
      formData.accept_full, formData.apply_additional, formData.additional_shares, formData.additional_amount,
      formData.accept_smaller_allotment, formData.payment_amount, formData.bank_name, formData.cheque_number, formData.branch,
      formData.shares_accepted, formData.amount_payable, formData.shares_renounced, formData.accept_partial, formData.renounce_rights, formData.trade_rights,
      formData.contact_name, formData.next_of_kin, formData.daytime_phone, formData.mobile_phone, formData.email,
      formData.bank_name_edividend, formData.bank_branch_edividend, formData.account_number, formData.bvn,
      formData.corporate_signatory_names, formData.corporate_designations,
      formData.signature_type, formData.reg_account_number, formData.name, formData.holdings, formData.rights_issue,
      formData.holdings_after, formData.amount_due, filledFormPath, receiptPath, signaturePaths
    ]);

    const submissionData = result.rows[0];

    // Send email notifications
    try {
      // Send notification to admin
      await sendRightsSubmissionNotification(submissionData);
      
      // Send confirmation to shareholder with filled form
      await sendShareholderConfirmation({
        ...submissionData,
        email: formData.email,
        name: formData.name || formData.contact_name
      });
    } catch (emailError) {
      console.error('Failed to send email notifications:', emailError);
      // Don't fail the request if email fails
    }

    res.status(201).json({
      success: true,
      message: 'Rights issue form submitted successfully',
      data: submissionData
    });
  } catch (error) {
    console.error('Error submitting rights form:', error);
    res.status(500).json({ 
      error: 'Failed to submit rights form',
      message: error.message 
    });
  }
});

// Get stockbrokers list
router.get('/stockbrokers', async (req, res) => {
  try {
    const query = 'SELECT id, name, code FROM stockbrokers ORDER BY name';
    const result = await pool.query(query);
    
    res.json({
      success: true,
      data: result.rows
    });
  } catch (error) {
    console.error('Error fetching stockbrokers:', error);
    res.status(500).json({ 
      error: 'Failed to fetch stockbrokers',
      message: error.message 
    });
  }
});
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
    // const insertQuery = `
    //   INSERT INTO forms (
    //     shareholder_id, acceptance_type, shares_accepted, shares_renounced,
    //     additional_shares_applied, amount_payable, payment_account_number,
    //     contact_name, next_of_kin, daytime_phone, mobile_phone, email,
    //     bank_name, bank_branch, account_number, bvn, signature_file, receipt_file
    //   ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
    //   RETURNING *
    // `;

    // const result = await pool.query(insertQuery, [
    //   shareholder_id, acceptance_type, shares_accepted, shares_renounced,
    //   additional_shares_applied, amount_payable, payment_account_number,
    //   contact_name, next_of_kin, daytime_phone, mobile_phone, email,
    //   bank_name, bank_branch, account_number, bvn, signature_file, receipt_file
    // ]);

    // Send email notification
    // const submissionData = result.rows[0];
    // try {
    //   await sendFormSubmissionNotification(submissionData);
    // } catch (emailError) {
    //   console.error('Failed to send email notification:', emailError);
    //   // Don't fail the request if email fails
    // }

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