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
const FileUpload = require('../utils/fileUpload'); // Cloudinary utility

// Helper: generate filled rights PDF as Buffer from provided fields
async function generateRightsPdfBuffer(formData) {
  let pdfBytes;
  let pdfDoc;
  let form;
  
  try {
    // Load PDF template
    if (false && process.env.NODE_ENV === 'production') {
      const cloudinary = require('../config/cloudinary');
      const templateUrl = cloudinary.url('rights-submissions/rights-form/TIP_RIGHTS_ISSUE', { format: 'pdf' });
      const response = await fetch(templateUrl);
      if (!response.ok) {
        throw new Error(`Failed to fetch PDF template: ${response.status} ${response.statusText}`);
      }
      pdfBytes = await response.arrayBuffer();
    } else {
      const templatePath = path.join(__dirname, '../rights-form/TIP_RIGHTS_ISSUE.pdf');
      try {
        pdfBytes = await fs.readFile(templatePath);
      } catch (error) {
        throw new Error(`Failed to read PDF template: ${error.message}`);
      }
    }

    // Load the PDF document and get the form
    pdfDoc = await PDFDocument.load(pdfBytes);
    form = pdfDoc.getForm();
    
    if (!form) {
      throw new Error('Failed to get form from PDF document');
    }
    
    // Helper function to set form fields if they exist
    const setFieldIfExists = (fieldName, value) => {
      try {
        const field = form.getField(fieldName);
        if (field && typeof field.setText === 'function') {
          field.setText(String(value ?? ''));
          return true;
        }
      } catch (_) {
        // Ignore errors for missing fields
      }
      return false;
    };

    // Helper function to clear form fields
    const clearFieldIfExists = (fieldName) => {
      try {
        const field = form.getField(fieldName);
        if (field && typeof field.setText === 'function') {
          field.setText('');
          return true;
        }
      } catch (_) {
        // Ignore errors for missing fields
      }
      return false;
    };

    // Basic shareholder info (always populate)
    setFieldIfExists('reg_account_number', formData.reg_account_number) ||
      setFieldIfExists('Registration account number', formData.reg_account_number);
    
    setFieldIfExists('shareholder_name', formData.name) ||
      setFieldIfExists('Name', formData.name);

    // Rights and shares info (always populate)
    setFieldIfExists('holdings', (formData.holdings ?? '').toLocaleString?.() ?? formData.holdings) ||
      setFieldIfExists('Shares Held', (formData.holdings ?? '').toLocaleString?.() ?? formData.holdings);

    setFieldIfExists('rights_issue', (formData.rights_issue ?? '').toLocaleString?.() ?? formData.rights_issue) ||
      setFieldIfExists('Rights Allotted', (formData.rights_issue ?? '').toLocaleString?.() ?? formData.rights_issue);

    setFieldIfExists('amount_due', `NGN ${(formData.amount_due ?? '').toLocaleString?.() ?? formData.amount_due}`) ||
      setFieldIfExists('Amount Due', `NGN ${(formData.amount_due ?? '').toLocaleString?.() ?? formData.amount_due}`);

    // Stockbroker & CHN details (always populate)
    setFieldIfExists('stockbroker', formData.stockbroker) ||
      setFieldIfExists('Stockbroker', formData.stockbroker);

    setFieldIfExists('chn', formData.chn) ||
      setFieldIfExists('CHN number', formData.chn);

    // SECTION LOGIC - CLEAR ALL FIELDS FIRST
    // Clear all conditional fields first to avoid cross-contamination
    const allConditionalFields = [
      // Section A - Full Acceptance
      'accept_full', 'Accept full allotment',
      'apply_additional', 'Apply for additional shares',
      'additional_shares', 'Additional shares applied',
      'additional_amount', 'Additional amount payable',
      'accept_smaller_allotment', 'Accept smaller allotment',
      'payment_amount', 'Payment amount',
      'bank_name', 'Bank name',
      'cheque_number', 'Cheque number',
      'branch', 'Branch',
      'amount_payable', 'Amount payable',

      
      // Section B - Renunciation/Partial
      'shares_accepted', 'Shares accepted',
      'amount_payable', 'Amount payable',
      'shares_renounced', 'Shares renounced',
      'accept_partial', 'Accept partial',
      'renounce_rights', 'Renounce rights',
      'trade_rights', 'Trade rights'
    ];

    // Clear all conditional fields
    allConditionalFields.forEach(field => clearFieldIfExists(field));

    // CONDITIONAL FIELDS BASED ON ACTION TYPE
    if (formData.action_type === 'full_acceptance') {
      console.log('Processing FULL ACCEPTANCE section');
      
      // SECTION A: Full Acceptance fields
      setFieldIfExists('accept_full', '✓') ||
        setFieldIfExists('Accept full allotment', '✓');

      // Additional shares logic
      if (formData.apply_additional) {
        console.log('Processing ADDITIONAL SHARES section');
        setFieldIfExists('apply_additional', '✓') ||
          setFieldIfExists('Apply for additional shares', '✓');

        setFieldIfExists('additional_shares', formData.additional_shares?.toString() || '') ||
          setFieldIfExists('Additional shares applied', formData.additional_shares?.toString() || '');

        setFieldIfExists('additional_amount', formData.additional_amount?.toString() || '') ||
          setFieldIfExists('Additional amount payable', formData.additional_amount?.toString() || '');

        setFieldIfExists('accept_smaller_allotment', formData.accept_smaller_allotment ? '✓' : '') ||
          setFieldIfExists('Accept smaller allotment', formData.accept_smaller_allotment ? '✓' : '');
      }

      // Payment details for Section A (only if additional shares or full acceptance with payment)
      if (formData.apply_additional && formData.additional_shares > 0) {
        // Use the additional payment fields for additional shares
        setFieldIfExists('payment_amount', formData.additional_amount?.toString() || '') ||
          setFieldIfExists('Payment amount', formData.additional_amount?.toString() || '');

        setFieldIfExists('bank_name', formData.additional_payment_bank_name || '') ||
          setFieldIfExists('Bank name', formData.additional_payment_bank_name || '');

        setFieldIfExists('cheque_number', formData.additional_payment_cheque_number || '') ||
          setFieldIfExists('Cheque number', formData.additional_payment_cheque_number || '');

        setFieldIfExists('branch', formData.additional_payment_branch || '') ||
          setFieldIfExists('Branch', formData.additional_payment_branch || '');
          
        setFieldIfExists('amount_payable', formData.amount_payable?.toString() || '') ||
          setFieldIfExists('Amount payable', formData.amount_payable?.toString() || '');


      } else if (formData.payment_amount) {
        // Fallback to original payment fields if additional shares not applied
        setFieldIfExists('payment_amount', formData.payment_amount?.toString() || '') ||
          setFieldIfExists('Payment amount', formData.payment_amount?.toString() || '');

        setFieldIfExists('bank_name', formData.bank_name || '') ||
          setFieldIfExists('Bank name', formData.bank_name || '');

        setFieldIfExists('cheque_number', formData.cheque_number || '') ||
          setFieldIfExists('Cheque number', formData.cheque_number || '');

        setFieldIfExists('branch', formData.branch || '') ||
          setFieldIfExists('Branch', formData.branch || '');
      }

      // ENSURE SECTION B IS CLEAR for Full Acceptance
      const sectionBFields = [
        'shares_accepted', 'Shares accepted',
        'amount_payable', 'Amount payable', 
        'shares_renounced', 'Shares renounced',
        'accept_partial', 'Accept partial',
        'renounce_rights', 'Renounce rights',
        'trade_rights', 'Trade rights'
      ];
      sectionBFields.forEach(field => clearFieldIfExists(field));

    } else if (formData.action_type === 'renunciation_partial') {
      console.log('Processing RENUNCIATION/PARTIAL section');
      
      // SECTION B: Renunciation/Partial Acceptance fields
      setFieldIfExists('shares_accepted', formData.shares_accepted?.toString() || '') ||
        setFieldIfExists('Shares accepted', formData.shares_accepted?.toString() || '');

      setFieldIfExists('amount_payable', formData.amount_payable?.toString() || '') ||
        setFieldIfExists('Amount payable', formData.amount_payable?.toString() || '');

      setFieldIfExists('shares_renounced', formData.shares_renounced?.toString() || '') ||
        setFieldIfExists('Shares renounced', formData.shares_renounced?.toString() || '');

      setFieldIfExists('accept_partial', formData.accept_partial ? '✓' : '') ||
        setFieldIfExists('Accept partial', formData.accept_partial ? '✓' : '');

      setFieldIfExists('renounce_rights', formData.renounce_rights ? '✓' : '') ||
        setFieldIfExists('Renounce rights', formData.renounce_rights ? '✓' : '');

      setFieldIfExists('trade_rights', formData.trade_rights ? '✓' : '') ||
        setFieldIfExists('Trade rights', formData.trade_rights ? '✓' : '');

      // Payment details for Section B (only if partial acceptance with payment)
      if (formData.shares_accepted > 0) {
        // Use the partial payment fields for partial acceptance
        setFieldIfExists('bank_name', formData.partial_payment_bank_name || '') ||
          setFieldIfExists('Bank name', formData.partial_payment_bank_name || '');

        setFieldIfExists('cheque_number', formData.partial_payment_cheque_number || '') ||
          setFieldIfExists('Cheque number', formData.partial_payment_cheque_number || '');

        setFieldIfExists('branch', formData.partial_payment_branch || '') ||
          setFieldIfExists('Branch', formData.partial_payment_branch || '');
      }

      // ENSURE SECTION A IS CLEAR for Renunciation/Partial
      const sectionAFields = [
        'accept_full', 'Accept full allotment',
        'apply_additional', 'Apply for additional shares', 
        'additional_shares', 'Additional shares applied',
        'additional_amount', 'Additional amount payable',
        'accept_smaller_allotment', 'Accept smaller allotment',
        'payment_amount', 'Payment amount',
        'amount_payable', 'Amount payable'
      ];
      sectionAFields.forEach(field => clearFieldIfExists(field));
    }

    // Personal details (always populate)
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

    // Bank details for e-dividend (always populate)
    setFieldIfExists('bank_name_edividend', formData.bank_name_edividend) ||
      setFieldIfExists('E-dividend bank name', formData.bank_name_edividend);

    setFieldIfExists('bank_branch_edividend', formData.bank_branch_edividend) ||
      setFieldIfExists('E-dividend branch', formData.bank_branch_edividend);

    setFieldIfExists('account_number', formData.account_number) ||
      setFieldIfExists('Account number', formData.account_number);

    setFieldIfExists('bvn', formData.bvn) ||
      setFieldIfExists('Bank verification number', formData.bvn);

    // Corporate details (if provided)
    if (formData.corporate_signatory_names) {
      setFieldIfExists('corporate_signatory_names', formData.corporate_signatory_names) ||
        setFieldIfExists('Corporate signatories', formData.corporate_signatory_names);

      setFieldIfExists('corporate_designations', formData.corporate_designations) ||
        setFieldIfExists('Corporate designations', formData.corporate_designations);
    }

    // Signature type
    setFieldIfExists('signature_type', formData.signature_type === 'single' ? 'Single' : 'Joint') ||
      setFieldIfExists('Signature type', formData.signature_type === 'single' ? 'Single' : 'Joint');

    // Flatten the form if available
    if (form) {
      form.flatten();
    }
    
  } catch (error) {
    console.error('Error generating PDF:', error);
    if (!pdfDoc && pdfBytes) {
      try {
        pdfDoc = await PDFDocument.load(pdfBytes);
      } catch (loadError) {
        console.error('Failed to load fallback PDF:', loadError);
        throw new Error(`Failed to generate PDF: ${error.message}`);
      }
    }
    if (!pdfDoc) {
      throw new Error(`Failed to generate PDF: ${error.message}`);
    }
  }

  // Save and return the PDF
  if (pdfDoc) {
    const modifiedPdf = await pdfDoc.save();
    return Buffer.from(modifiedPdf);
  } else {
    throw new Error('Failed to create PDF document');
  }
}

async function generateRightsPdfBufferjustDownload(formData) {
  let pdfBytes;
  let pdfDoc;
  let form;
  
  try {
    // Load PDF template
    if (false && process.env.NODE_ENV === 'production') {
      const cloudinary = require('../config/cloudinary');
      const templateUrl = cloudinary.url('rights-submissions/rights-form/TIP_RIGHTS_ISSUE_B', { format: 'pdf' });
      const response = await fetch(templateUrl);
      if (!response.ok) {
        throw new Error(`Failed to fetch PDF template: ${response.status} ${response.statusText}`);
      }
      pdfBytes = await response.arrayBuffer();
    } else {
      const templatePath = path.join(__dirname, '../rights-form/TIP_RIGHTS_ISSUE_B.pdf');
      try {
        pdfBytes = await fs.readFile(templatePath);
      } catch (error) {
        throw new Error(`Failed to read PDF template: ${error.message}`);
      }
    }

    // Load the PDF document and get the form
    pdfDoc = await PDFDocument.load(pdfBytes);
    form = pdfDoc.getForm();
    
    if (!form) {
      throw new Error('Failed to get form from PDF document');
    }
    
    // Helper function to set form fields if they exist
    const setFieldIfExists = (fieldName, value) => {
      try {
        const field = form.getField(fieldName);
        if (field && typeof field.setText === 'function') {
          field.setText(String(value ?? ''));
          return true;
        }
      } catch (_) {
        // Ignore errors for missing fields
      }
      return false;
    };

    // Helper function to clear form fields
    const clearFieldIfExists = (fieldName) => {
      try {
        const field = form.getField(fieldName);
        if (field && typeof field.setText === 'function') {
          field.setText('');
          return true;
        }
      } catch (_) {
        // Ignore errors for missing fields
      }
      return false;
    };

    // Basic shareholder info (always populate)
    setFieldIfExists('reg_account_number', formData.reg_account_number) ||
      setFieldIfExists('Registration account number', formData.reg_account_number);
    
    setFieldIfExists('shareholder_name', formData.name) ||
      setFieldIfExists('Name', formData.name);

    // Rights and shares info (always populate)
    setFieldIfExists('holdings', (formData.holdings ?? '').toLocaleString?.() ?? formData.holdings) ||
      setFieldIfExists('Shares Held', (formData.holdings ?? '').toLocaleString?.() ?? formData.holdings);

    setFieldIfExists('rights_issue', (formData.rights_issue ?? '').toLocaleString?.() ?? formData.rights_issue) ||
      setFieldIfExists('Rights Allotted', (formData.rights_issue ?? '').toLocaleString?.() ?? formData.rights_issue);

    setFieldIfExists('amount_due', `NGN ${(formData.amount_due ?? '').toLocaleString?.() ?? formData.amount_due}`) ||
      setFieldIfExists('Amount Due', `NGN ${(formData.amount_due ?? '').toLocaleString?.() ?? formData.amount_due}`);

  
    // Flatten the form if available
    if (form) {
      form.flatten();
    }
    
  } catch (error) {
    console.error('Error generating PDF:', error);
    if (!pdfDoc && pdfBytes) {
      try {
        pdfDoc = await PDFDocument.load(pdfBytes);
      } catch (loadError) {
        console.error('Failed to load fallback PDF:', loadError);
        throw new Error(`Failed to generate PDF: ${error.message}`);
      }
    }
    if (!pdfDoc) {
      throw new Error(`Failed to generate PDF: ${error.message}`);
    }
  }

  // Save and return the PDF
  if (pdfDoc) {
    const modifiedPdf = await pdfDoc.save();
    return Buffer.from(modifiedPdf);
  } else {
    throw new Error('Failed to create PDF document');
  }
}

// Helper: Upload PDF buffer to Cloudinary and return public ID
async function uploadPdfToCloudinary(pdfBuffer, fileName) {
  try {
    const result = await FileUpload.uploadBuffer(
      pdfBuffer, 
      fileName, 
      'rights-submissions/filled-forms'
    );
    return result.public_id;
  } catch (error) {
    console.error('Error uploading PDF to Cloudinary:', error);
    throw error;
  }
}


// Helper function to clean numeric fields
const cleanNumericField = (value) => {
  if (value === '' || value === null || value === undefined) return null;
  const num = Number(value);
  return isNaN(num) ? null : num;
};

// Helper function to trim strings to max length
const trimToMaxLength = (str, maxLength = 500) => {
  if (typeof str !== 'string') return str;
  return str.length > maxLength ? str.substring(0, maxLength) : str;
};

// Handle receipt upload to Cloudinary
// Helper function with retry logic for Cloudinary uploads
async function uploadWithRetry(uploadFunction, maxRetries = 3) {
  let lastError;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`Upload attempt ${attempt} of ${maxRetries}`);
      return await uploadFunction();
    } catch (error) {
      lastError = error;
      console.warn(`Upload attempt ${attempt} failed:`, error.message);
      
      if (attempt < maxRetries) {
        // Wait before retrying (exponential backoff)
        const delay = Math.min(1000 * Math.pow(2, attempt - 1), 10000);
        console.log(`Waiting ${delay}ms before retry...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  
  throw lastError; // All retries failed
}

// Updated handleReceiptUpload with retry logic
async function handleReceiptUpload(files) {
  if (!files || !files.receipt) return null;

  try {
    const receiptFile = files.receipt;
    
    // Get the file data as a buffer (same as before)
    let fileBuffer;
    let fileName = receiptFile.name || `receipt-${Date.now()}`;
    
    if (receiptFile.tempFilePath) {
      const fs = require('fs').promises;
      fileBuffer = await fs.readFile(receiptFile.tempFilePath);
    } else if (receiptFile.data) {
      fileBuffer = receiptFile.data;
    } else if (receiptFile.buffer) {
      fileBuffer = receiptFile.buffer;
    } else {
      throw new Error('No valid file data found in the receipt upload');
    }
    
    // Validate file size
    const maxFileSize = 10 * 1024 * 1024; // 10MB
    if (fileBuffer.length > maxFileSize) {
      throw new Error(`File size ${(fileBuffer.length / 1024 / 1024).toFixed(2)}MB exceeds maximum allowed size of 10MB`);
    }
    
    // Ensure valid file extension
    if (!fileName.includes('.')) {
      const mime = receiptFile.mimetype || '';
      const ext = mime.split('/')[1] || 'bin';
      fileName = `${fileName}.${ext}`;
    }
    
    console.log(`Uploading receipt to Cloudinary: ${fileName} (${fileBuffer.length} bytes)`);
    
    // Use retry logic for the upload
    const receiptResult = await uploadWithRetry(async () => {
      return await FileUpload.uploadReceipt(fileBuffer, fileName);
    }, 3); // Retry up to 3 times
    
    console.log(`Receipt uploaded successfully: ${receiptResult.public_id}`);
    return receiptResult.public_id;
    
  } catch (error) {
    console.error('Error uploading receipt to Cloudinary:', error);
    
    // Improved error messages
    if (error.http_code === 499 || error.name === 'TimeoutError') {
      throw new Error('Upload timeout. The file might be too large or your internet connection is slow. Please try a smaller file.');
    } else if (error.http_code === 400) {
      throw new Error('Invalid file format. Please upload JPG, PNG, GIF, or PDF files only.');
    } else if (error.message.includes('File size')) {
      throw new Error(error.message);
    } else if (error.message.includes('ENOTFOUND') || error.message.includes('Network')) {
      throw new Error('Network error. Please check your internet connection and try again.');
    } else {
      throw new Error('Upload failed. Please try again with a different file.');
    }
  }
}
// Handle file uploads to Cloudinary
async function handleFileUpload(files, fieldName, folder) {
  if (!files || !files[fieldName]) return null;

  try {
    const file = files[fieldName];
    
    // Get the file data as a buffer
    let fileBuffer;
    let fileName = file.name || `${fieldName}-${Date.now()}`;
    
    // Check if we're using temp files (from express-fileupload)
    if (file.tempFilePath) {
      // Read the temp file into a buffer
      const fs = require('fs').promises;
      fileBuffer = await fs.readFile(file.tempFilePath);
    } else if (file.data) {
      // Use the data buffer directly
      fileBuffer = file.data;
    } else if (file.buffer) {
      // Handle case where file is already a buffer
      fileBuffer = file.buffer;
    } else {
      throw new Error(`No valid file data found for ${fieldName}`);
    }
    
    // Ensure we have a valid file extension
    if (!fileName.includes('.')) {
      // Try to determine extension from mimetype if no extension
      const mime = file.mimetype || '';
      const ext = mime.split('/')[1] || 'bin';
      fileName = `${fileName}.${ext}`;
    }
    
    // Upload the file buffer to Cloudinary
    const result = await FileUpload.uploadBuffer(
      fileBuffer,
      fileName,
      `rights-submissions/${folder}`
    );
    
    return result.public_id;
  } catch (error) {
    console.error(`Error uploading ${fieldName} to Cloudinary:`, error);
    throw new Error(`Failed to upload ${fieldName}. Please try again with a valid file.`);
  }
}

// Handle multiple signature uploads
async function handleSignatureUploads(files) {
  const signaturePaths = [];
  
  if (!files) return signaturePaths;
  
  try {
    // Handle single signature (signature_0 for consistency with client-side)
    if (files.signature_0) {
      const signatureId = await handleFileUpload(files, 'signature_0', 'signatures');
      if (signatureId) signaturePaths.push(signatureId);
    }
    
    // Handle multiple signatures (signature_0, signature_1, etc.)
    let index = 0;
    while (files[`signature_${index}`]) {
      const signatureId = await handleFileUpload(files, `signature_${index}`, 'signatures');
      if (signatureId) signaturePaths.push(signatureId);
      index++;
    }
    
    // Backward compatibility with old format (signature1, signature2, etc.)
    let i = 1;
    while (files[`signature${i}`] && signaturePaths.length === 0) {
      const signatureId = await handleFileUpload(files, `signature${i}`, 'signatures');
      if (signatureId) signaturePaths.push(signatureId);
      i++;
    }
    
    return signaturePaths;
  } catch (error) {
    console.error('Error uploading signatures:', error);
    // If we have partial uploads, clean them up
    if (signaturePaths.length > 0) {
      try {
        await Promise.all(signaturePaths.map(publicId => 
          FileUpload.deleteFile(publicId).catch(console.error)
        ));
      } catch (cleanupError) {
        console.error('Error cleaning up failed signature uploads:', cleanupError);
      }
    }
    throw new Error('Failed to upload one or more signatures. Please try again with valid image files.');
  }
}

// Generate payment account number
const generatePaymentAccountNumber = () => {
  const timestamp = Date.now().toString();
  const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
  return `238${timestamp.slice(-6)}${random}`;
};

// Preview rights form PDF (returns PDF buffer without saving)
router.post('/preview-rights', async (req, res) => {
  try {
    const formData = req.body;
    
    // Validate required fields based on action type
    let requiredFields = [
      'stockbroker', 'chn', 'action_type', 'contact_name', 'next_of_kin',
      'daytime_phone', 'mobile_phone', 'email', 'account_number', 'bvn'
    ];

    if (formData.action_type === 'full_acceptance') {
      requiredFields = [...requiredFields, 'accept_full'];
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
    const files = req.files;
    
    // Clean numeric fields
    const numericFields = [
      'shareholder_id', 'stockbroker', 'additional_shares', 'additional_amount',
      'payment_amount', 'shares_accepted', 'amount_payable', 'shares_renounced',
      'holdings', 'rights_issue', 'holdings_after', 'amount_due',
      'additional_payment_cheque_number', 'partial_payment_cheque_number'
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
  const pricePerShare = 7;

// Helper function to safely parse numbers
const safeNumber = (value) => {
  const num = parseFloat(value);
  return isNaN(num) ? 0 : num;
};

// Calculate based on action type
if (formData.action_type === 'full_acceptance') {
  const rightsAmount = safeNumber(formData.rights_issue) * pricePerShare;
  
  let additionalAmount = 0;
  let additionalShares = 0;
  
  if (formData.apply_additional) {
    additionalShares = safeNumber(formData.additional_shares);
    additionalAmount = additionalShares * pricePerShare;
  }
  
  formData.amount_payable = (rightsAmount + additionalAmount).toFixed(2);
  formData.shares_accepted = safeNumber(formData.rights_issue) + additionalShares;
  formData.shares_renounced = 0;

} else if (formData.action_type === 'renunciation_partial') {
  const sharesAccepted = safeNumber(formData.shares_accepted);
  formData.amount_payable = (sharesAccepted * pricePerShare).toFixed(2);
  formData.shares_renounced = safeNumber(formData.rights_issue) - sharesAccepted;
  
} else {
  // Default fallback
  formData.amount_payable = '0.00';
  formData.shares_accepted = 0;
  formData.shares_renounced = safeNumber(formData.rights_issue);
}

    // Validate required fields
    let requiredFields = [
      'shareholder_id', 'stockbroker', 'chn', 'action_type', 'instructions_read',
      'contact_name', 'next_of_kin', 'daytime_phone', 'mobile_phone', 'email',
    'account_number', 'bvn',
      'signature_type'
    ];

//     if (formData.action_type === 'full_acceptance') {
//       requiredFields = [...requiredFields, 'accept_full'];

//         if (formData.action_type === 'apply_additional') {
//     requiredFields = [...requiredFields, 'additional_shares', 'additional_amount', 'payment_amount', 'bank_name', 'branch'];
//   }
// } else {
//   requiredFields = [...requiredFields, 'shares_accepted', 'amount_payable', 'shares_renounced'];
// }
   // Updated validation for different action types
   if (formData.action_type === 'full_acceptance') {
     requiredFields = [...requiredFields, 'accept_full'];

     // Additional validation for additional shares
     if (formData.apply_additional === 'true' || formData.apply_additional === true) {
       requiredFields = [...requiredFields, 'additional_shares'];
       
       // Payment fields only required if applying for additional shares with shares > 0
       if (parseInt(formData.additional_shares) > 0) {
         requiredFields = [
           ...requiredFields, 
        
          
         ];
       }
     }
   } else if (formData.action_type === 'renunciation_partial') {
  requiredFields = [...requiredFields, 'shares_accepted', 'amount_payable', 'shares_renounced'];
  
  // Payment fields only required if accepting partial shares WITH payment
  const sharesAccepted = parseInt(formData.shares_accepted) || 0;
  if (sharesAccepted > 0) {
    // Only require payment details if shares are being accepted (meaning payment is needed)
    requiredFields = [
      ...requiredFields, 
   
    ];
  }
  // If shares_accepted is 0, no payment details should be required
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
    let filledFormPublicId; 
   // Upload files to Cloudinary
// Upload files to Cloudinary with better error handling
  // Upload files to Cloudinary
  let receiptPublicId = null;
  if (files && files.receipt) {
    receiptPublicId = await handleReceiptUpload(files);
  } else if (formData.action_type !== 'renounce') {
    return res.status(400).json({
      error: 'Receipt required',
      message: 'Payment receipt is required to submit the form'
    });
  }


// Upload signatures to Cloudinary
 const signaturePublicIds = await handleSignatureUploads(files);
 if (signaturePublicIds.length === 0) {
   return res.status(400).json({
     error: 'Signature required',
     message: 'At least one signature is required to submit the form'
   });
 }
// Generate filled PDF and upload to Cloudinary

// Generate filled PDF and upload to Cloudinary
try {
  const pdfBuffer = await generateRightsPdfBuffer(formData);
  const fileName = `rights-form-${formData.reg_account_number}-${Date.now()}.pdf`;

  // FIX: Get the Cloudinary result and extract the public_id
  const cloudinaryResult = await FileUpload.uploadBuffer(
    pdfBuffer,
    fileName,
    'rights-submissions/filled-forms'
  );
  filledFormPublicId = cloudinaryResult.public_id; // Extract just the public_id
  console.log(`✅ PDF uploaded: ${filledFormPublicId}`);
} catch (pdfError) {
  console.error('Error generating or uploading PDF:', pdfError);
  return res.status(500).json({ 
    error: 'Failed to generate filled form',
    message: 'PDF generation failed. Please try again.'
  });
}

    // Insert rights submission with Cloudinary public IDs
  const insertQuery = `
  INSERT INTO rights_submissions (
    shareholder_id, instructions_read, stockbroker_id, chn, action_type,
    accept_full, apply_additional, additional_shares, additional_amount,
    accept_smaller_allotment, payment_amount, 
    additional_payment_bank_name, additional_payment_cheque_number, additional_payment_branch,
    shares_accepted, amount_payable, shares_renounced, accept_partial, renounce_rights, trade_rights,
    contact_name, next_of_kin, daytime_phone, mobile_phone, email,
    bank_name_edividend, bank_branch_edividend, account_number, bvn,
    corporate_signatory_names, corporate_designations,
    signature_type, reg_account_number, name, holdings, rights_issue,
    holdings_after, amount_due, filled_form_path, receipt_path, signature_paths,
    partial_payment_bank_name, partial_payment_cheque_number, partial_payment_branch,
    status, created_at
  ) VALUES (
    $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16,
    $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30,
    $31, $32, $33, $34, $35, $36, $37, $38, $39, $40, $41, $42, $43, $44, $45, $46
  )
  RETURNING *
`;

    // Prepare data for insertion, trimming any strings that are too long
    const insertData = [
      // First 5 fields
      formData.shareholder_id, 
      formData.instructions_read, 
      trimToMaxLength(formData.stockbroker), 
      trimToMaxLength(formData.chn), 
      trimToMaxLength(formData.action_type),
      
      // Full acceptance fields (6-14)
      formData.accept_full, 
      formData.apply_additional, 
      formData.additional_shares, 
      formData.additional_amount,
      formData.accept_smaller_allotment, 
      formData.payment_amount, 
      trimToMaxLength(formData.additional_payment_bank_name),
      trimToMaxLength(formData.additional_payment_cheque_number),
      trimToMaxLength(formData.additional_payment_branch),
      
      // Shares and payment info (15-24)
      formData.shares_accepted, 
      formData.amount_payable, 
      formData.shares_renounced, 
      formData.accept_partial, 
      formData.renounce_rights, 
      formData.trade_rights,
      
      // Contact info (25-34)
      trimToMaxLength(formData.contact_name), 
      trimToMaxLength(formData.next_of_kin), 
      trimToMaxLength(formData.daytime_phone), 
      trimToMaxLength(formData.mobile_phone), 
      trimToMaxLength(formData.email),
      trimToMaxLength(formData.bank_name_edividend), 
      trimToMaxLength(formData.bank_branch_edividend), 
      trimToMaxLength(formData.account_number), 
      trimToMaxLength(formData.bvn),
      
      // Corporate details (35-36)
      trimToMaxLength(formData.corporate_signatory_names), 
      trimToMaxLength(formData.corporate_designations),
      
      // Form metadata (37-44)
      trimToMaxLength(formData.signature_type), 
      trimToMaxLength(formData.reg_account_number), 
      trimToMaxLength(formData.name), 
      formData.holdings, 
      formData.rights_issue,
      formData.holdings_after, 
      formData.amount_due, 
      
      // File paths (45-47)
      trimToMaxLength(filledFormPublicId, 500), 
      trimToMaxLength(receiptPublicId, 500), 
      signaturePublicIds,
      
      // Partial payment details (48-50)
      trimToMaxLength(formData.partial_payment_bank_name),
      trimToMaxLength(formData.partial_payment_cheque_number),
      trimToMaxLength(formData.partial_payment_branch),
      
      // Status (51-52)
      'pending',
      new Date()
    ];

    const result = await pool.query(insertQuery, insertData);

    const submissionData = result.rows[0];

    // Generate Cloudinary URLs for email attachments
    const cloudinary = require('../config/cloudinary');
    const filledFormUrl = cloudinary.url(filledFormPublicId, {
      secure: true,
      flags: 'attachment:filled_rights_form.pdf'
    });

    // Send email notifications with Cloudinary URLs
    try {
      // Send notification to admin
      await sendRightsSubmissionNotification({
        ...submissionData,
        filled_form_url: filledFormUrl
      });
      
      // Send confirmation to shareholder with filled form
      await sendShareholderConfirmation({
        ...submissionData,
        email: formData.email,
        name: formData.name || formData.contact_name,
        filled_form_url: filledFormUrl
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

// Get file download URL from Cloudinary
router.get('/download/:publicId', async (req, res) => {
  try {
    const { publicId } = req.params;
    
    const cloudinary = require('../config/cloudinary');
    const downloadUrl = cloudinary.url(publicId, {
      secure: true,
      flags: 'attachment'
    });

    res.json({
      success: true,
      data: {
        downloadUrl: downloadUrl
      }
    });
  } catch (error) {
    console.error('Error generating download URL:', error);
    res.status(500).json({ 
      error: 'Failed to generate download URL',
      message: error.message 
    });
  }
});


// Add this route to forms.js for file downloads

// In your server routes (e.g., routes/forms.js or routes/uploads.js)
router.get('/download-file/:publicId', async (req, res) => {
  try {
    const { publicId } = req.params;
    const { filename } = req.query;
    
    // Get the file from Cloudinary
    const result = await cloudinary.api.resource(publicId, {
      resource_type: 'raw'
    });
    
    // Set the appropriate headers
    res.setHeader('Content-Type', result.format ? `application/${result.format}` : 'application/octet-stream');
    if (filename) {
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    }
    
    // Stream the file
    const response = await axios.get(result.secure_url, { responseType: 'stream' });
    response.data.pipe(res);
  } catch (error) {
    console.error('Error downloading file:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to download file',
      message: error.message 
    });
  }
});

router.get('/stream-file/:publicId', async (req, res) => {
  try {
    const { publicId } = req.params;
    const { filename } = req.query;
    
    // Get the file from Cloudinary
    const result = await cloudinary.api.resource(publicId);
    
    // Set the appropriate headers
    res.setHeader('Content-Type', result.format ? `image/${result.format}` : 'image/jpeg');
    if (filename) {
      res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
    }
    
    // Stream the file
    const response = await axios.get(result.secure_url, { responseType: 'stream' });
    response.data.pipe(res);
  } catch (error) {
    console.error('Error streaming file:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to stream file',
      message: error.message 
    });
  }
});

// Alternative: Stream file through your server (if redirect doesn't work)
router.get('/stream-file/:publicId', async (req, res) => {
  try {
    const { publicId } = req.params;
    const { filename } = req.query;

    const cloudinary = require('../config/cloudinary');
    const fileUrl = cloudinary.url(publicId, { secure: true });

    const response = await fetch(fileUrl);
    
    if (!response.ok) {
      throw new Error('Failed to fetch file from Cloudinary');
    }

    // Set appropriate headers
    const contentDisposition = filename 
      ? `attachment; filename="${filename}"`
      : 'attachment';
    
    res.setHeader('Content-Disposition', contentDisposition);
    res.setHeader('Content-Type', response.headers.get('content-type'));
    
    // Stream the file
    const arrayBuffer = await response.arrayBuffer();
    res.send(Buffer.from(arrayBuffer));
    
  } catch (error) {
    console.error('Error streaming file:', error);
    res.status(500).json({ 
      error: 'Failed to download file',
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

// Upload form template to Cloudinary (admin function)
router.post('/upload-template', async (req, res) => {
  try {
    if (!req.files || !req.files.template) {
      return res.status(400).json({
        success: false,
        message: 'No file uploaded'
      });
    }

    const templateFile = req.files.template;
    const result = await FileUpload.uploadToCloudinary(templateFile.tempFilePath, 'rights-forms');

    res.json({
      success: true,
      message: 'Template uploaded successfully to Cloudinary',
      data: {
        publicId: result.public_id,
        url: result.secure_url
      }
    });
  } catch (error) {
    console.error('Error uploading template:', error);
    res.status(500).json({
      success: false,
      message: 'Error uploading template'
    });
  }
});

// Serve form template from Cloudinary
router.get('/form-template', async (req, res) => {
  try {
    const cloudinary = require('../config/cloudinary');
    const downloadUrl = cloudinary.url('rights-forms/TIP_RIGHTS_ISSUE', {
      secure: true,
      flags: 'attachment:TIP_RIGHTS_ISSUE_FORM.pdf'
    });

    res.json({
      success: true,
      downloadUrl: downloadUrl
    });
  } catch (error) {
    console.error('Error serving form template:', error);
    res.status(500).json({
      success: false,
      message: 'Error serving form template'
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
        }
      } catch (e) {
        console.warn(`Could not set field '${fieldName}':`, e.message);
      }
      return false;
    };
      
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
    
    // Save the filled PDF
    try {
      const filledPdfBytes = await pdfDoc.save();
      return filledPdfBytes;
    } catch (error) {
      throw new Error(`Failed to save filled PDF: ${error.message}`);
    }

    // 5. Send the PDF with proper headers
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="TIP_RIGHTS_${shareholderName.replace(/[^a-z0-9]/gi, '_').substring(0, 50)}.pdf"`);
    res.setHeader('Content-Length', filledPdfBytes.length);
    res.send(Buffer.from(filledPdfBytes));
    
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



// Generate basic pre-filled PDF with only shareholder info
router.post('/generate-basic-pdf', async (req, res) => {
  try {
    const formData = req.body;
    
    // Validate required basic fields
    const requiredFields = [
      'reg_account_number', 'name', 'holdings', 
      'rights_issue', 'amount_due'
    ];
    
    const missingFields = requiredFields.filter(field => !formData[field]);
    
    if (missingFields.length > 0) {
      return res.status(400).json({
        error: 'Missing required fields',
        message: 'All basic shareholder fields are required',
        missingFields
      });
    }

    // Generate PDF buffer with minimal data
    const pdfBuffer = await generateRightsPdfBufferjustDownload({
      ...formData,
      action_type: 'full_acceptance', // Force basic acceptance
      accept_full: true,
      contact_name: formData.name || '',
      signature_type: 'single'
    });
  
    // Return PDF with proper headers
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="TIP_RIGHTS_${formData.reg_account_number}.pdf"`);
    res.setHeader('Content-Length', pdfBuffer.length);
    res.send(pdfBuffer);
      
  } catch (error) {
    console.error('Error generating basic PDF:', error);
    res.status(500).json({ 
      error: 'Failed to generate PDF',
      message: error.message 
    });
  }
});

module.exports = router; 