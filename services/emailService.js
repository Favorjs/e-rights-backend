const nodemailer = require('nodemailer');
const path = require('path');
const fs = require('fs').promises;
const formData = require('form-data');
const Mailgun = require('mailgun.js');

// Main Mailgun Email Service Class
class MailgunEmailService {
  constructor() {
    this.apiKey = process.env.MAILGUN_API_KEY;
    this.domain = process.env.MAILGUN_DOMAIN;
    this.fromEmail = process.env.MAILGUN_FROM_EMAIL;
    this.fromName = 'Linkage Assurance Plc E-rights';
    this.mailgun = new Mailgun(formData);
    this.client = null;

    this.initializeClient();
  }

  // Initialize Mailgun client
  initializeClient() {
    try {
      this.client = this.mailgun.client({
        username: 'api',
        key: this.apiKey,
      });
      console.log('Mailgun client initialized');
    } catch (error) {
      console.error('Failed to initialize Mailgun client:', error.message);
      throw error;
    }
  }

  // Send email via Mailgun API
  async sendEmail(to, subject, html, attachments = []) {
    try {
      if (!this.client) {
        this.initializeClient();
      }

      const emailData = {
        from: `${this.fromName} <${this.fromEmail}>`,
        to: to,
        subject: subject,
        html: html,
      };

      // Add attachments if any
      if (attachments.length > 0) {
        emailData.attachment = attachments;
      }

      const response = await this.client.messages.create(this.domain, emailData);

      console.log('Email sent via Mailgun API to', to);
      return {
        success: true,
        messageId: response.id,
        response: response
      };
    } catch (error) {
      console.error('Mailgun API email failed:', error.message);

      // Log detailed error information for debugging
      if (error.details) {
        console.error('Mailgun error details:', error.details);
      }

      throw error;
    }
  }




  // Send rights submission notification to admin
  async sendRightsSubmissionNotification(submissionData) {
    const subject = `New Rights Issue Submission - ${submissionData.name || 'Shareholder'}`;
    const to = process.env.ADMIN_EMAIL;

    // Determine acceptance status
    let acceptanceStatus = '';
    let statusColor = '#374151';

    if (submissionData.action_type === 'full_acceptance') {
      if (submissionData.apply_additional) {
        acceptanceStatus = 'Full Acceptance with Additional Shares';
        statusColor = '#059669';
      } else {
        acceptanceStatus = 'Full Acceptance Only';
        statusColor = '#10b981';
      }
    } else if (submissionData.action_type === 'renunciation_partial') {
      if (submissionData.shares_renounced > 0) {
        acceptanceStatus = 'Partial Acceptance with Renunciation';
        statusColor = '#f59e0b';
      } else {
        acceptanceStatus = 'Partial Acceptance';
        statusColor = '#fbbf24';
      }
    }

    const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <style>
        @media only screen and (max-width: 620px) {
          .wrapper { padding: 10px !important; }
          .container { width: 100% !important; border-radius: 12px !important; }
          .content { padding: 20px !important; }
          .header { padding: 20px !important; }
          .info-table td { display: block !important; width: 100% !important; box-sizing: border-box !important; }
          .info-table td:first-child { padding-bottom: 4px !important; color: #6b7280 !important; font-size: 11px !important; text-transform: uppercase !important; }
          .info-table td:last-child { padding-bottom: 16px !important; border-bottom: none !important; }
          .amount-value { font-size: 20px !important; }
        }
      </style>
    </head>
    <body style="margin: 0; padding: 0; background-color: #f1f5f9; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #f1f5f9;" class="wrapper">
        <tr>
          <td align="center" style="padding: 30px 10px;">
            <table role="presentation" width="600" cellspacing="0" cellpadding="0" style="background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);" class="container">
              
              <!-- Header -->
              <tr>
                <td style="background-color: #0c4a6e; padding: 32px; text-align: left;" class="header">
                  <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                    <tr>
                      <td>
                        <h1 style="color: #ffffff; font-size: 18px; margin: 0; font-weight: 700; letter-spacing: -0.025em;">Linkage Assurance Plc</h1>
                        <p style="color: #7dd3fc; font-size: 11px; margin: 4px 0 0; text-transform: uppercase; font-weight: 600; letter-spacing: 0.05em;">Admin Notification Portal</p>
                      </td>
                      <td align="right">
                        <span style="background-color: rgba(255,255,255,0.15); color: #ffffff; padding: 6px 12px; border-radius: 9999px; font-size: 11px; font-weight: 700; text-transform: uppercase;">NEW ENTRY</span>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
              
              <!-- Body Content -->
              <tr>
                <td style="padding: 32px;" class="content">
                  <h2 style="color: #111827; font-size: 20px; margin: 0 0 8px; font-weight: 700;">Rights Submission Review</h2>
                  <p style="color: #4b5563; font-size: 14px; line-height: 1.5; margin: 0 0 24px;">
                    A new rights issue application has been received from <strong>${submissionData.name}</strong> and is ready for verification.
                  </p>
                  
                  <!-- Main Info -->
                  <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 24px; margin-bottom: 24px;">
                    <h3 style="color: #0f172a; font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; margin: 0 0 16px; border-bottom: 1px solid #e2e8f0; padding-bottom: 12px;">Shareholder Details</h3>
                    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" class="info-table">
                      <tr>
                        <td style="padding: 8px 0; font-size: 14px; color: #64748b; width: 40%;">CHN Number</td>
                        <td style="padding: 8px 0; font-size: 14px; color: #1e293b; font-weight: 600;">${submissionData.chn}</td>
                      </tr>
                      <tr>
                        <td style="padding: 8px 0; font-size: 14px; color: #64748b;">Account Number</td>
                        <td style="padding: 8px 0; font-size: 14px; color: #1e293b; font-weight: 600;">${submissionData.reg_account_number}</td>
                      </tr>
                      <tr>
                        <td style="padding: 8px 0; font-size: 14px; color: #64748b;">Acceptance Type</td>
                        <td style="padding: 8px 0; font-size: 14px; color: ${statusColor}; font-weight: 700;">${acceptanceStatus}</td>
                      </tr>
                      <tr>
                        <td style="padding: 8px 0; font-size: 14px; color: #64748b;">Receipt Status</td>
                        <td style="padding: 8px 0; font-size: 14px;">
                          ${submissionData.receipt_path
        ? `<span style="color: #059669; font-weight: 700;">[Attached]</span>`
        : submissionData.payment_ref
          ? `<span style="color: #7c3aed; font-weight: 700;">[Paid Online: ${submissionData.payment_ref}]</span>`
          : `<span style="color: #dc2626; font-weight: 700;">[Missing]</span>`
      }
                        </td>
                      </tr>
                    </table>
                  </div>

                  <!-- Financials -->
                  <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 24px; margin-bottom: 32px;">
                    <h3 style="color: #0f172a; font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; margin: 0 0 16px; border-bottom: 1px solid #e2e8f0; padding-bottom: 12px;">Financial Summary</h3>
                    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" class="info-table">
                      <tr>
                        <td style="padding: 8px 0; font-size: 14px; color: #64748b; width: 40%;">Rights Amount</td>
                        <td style="padding: 8px 0; font-size: 14px; color: #1e293b; font-weight: 600;">₦${parseFloat(submissionData.amount_due || 0).toLocaleString('en-NG', { minimumFractionDigits: 2 })}</td>
                      </tr>
                      ${submissionData.apply_additional ? `
                      <tr>
                        <td style="padding: 8px 0; font-size: 14px; color: #64748b;">Additional Amount</td>
                        <td style="padding: 8px 0; font-size: 14px; color: #059669; font-weight: 600;">+ ₦${parseFloat(submissionData.additional_amount || 0).toLocaleString('en-NG', { minimumFractionDigits: 2 })}</td>
                      </tr>
                      ` : ''}
                      <tr style="border-top: 1px dashed #cbd5e1;">
                        <td style="padding: 16px 0 0; font-size: 15px; color: #0f172a; font-weight: 700;">Total Payable</td>
                        <td style="padding: 16px 0 0; font-size: 24px; color: #0369a1; font-weight: 800;" class="amount-value">₦${parseFloat(submissionData.amount_payable || submissionData.amount_due || 0).toLocaleString('en-NG', { minimumFractionDigits: 2 })}</td>
                      </tr>
                    </table>
                  </div>

                  <!-- Action Button -->
                  <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                    <tr>
                      <td align="center">
                        <a href="${process.env.FRONTEND_URL || 'http://localhost:3000'}/admin" 
                           style="background-color: #0c4a6e; color: #ffffff; padding: 16px 40px; text-decoration: none; border-radius: 12px; display: inline-block; font-size: 15px; font-weight: 700; box-shadow: 0 4px 6px -1px rgba(12, 74, 110, 0.2);">
                          Review Submission
                        </a>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
              
              <!-- Footer -->
              <tr>
                <td style="padding: 32px; background-color: #f8fafc; border-top: 1px solid #e2e8f0; text-align: center;">
                  <p style="color: #94a3b8; font-size: 12px; margin: 0; line-height: 1.5;">
                    Rights Issue Management System — ${new Date().getFullYear()}<br>
                    Submission ID: ${submissionData.id} • ${new Date(submissionData.created_at).toLocaleString('en-NG')}
                  </p>
                </td>
              </tr>
              
            </table>
          </td>
        </tr>
      </table>
    </body>
    </html>
    `;

    try {
      const result = await this.sendEmail(to, subject, html);
      console.log('Rights submission notification sent to admin');
      return result;
    } catch (error) {
      console.error('Failed to send rights submission notification:', error);
      return { success: false, error: error.message };
    }
  }

  // Also update the shareholder confirmation email
  async sendShareholderConfirmation(submissionData) {
    const subject = 'Submission Confirmation - Linkage Assurance Plc Rights Issue';
    const to = submissionData.email;

    // Determine acceptance status
    let acceptanceStatus = '';
    let statusColor = '#374151';

    if (submissionData.action_type === 'full_acceptance') {
      if (submissionData.apply_additional) {
        acceptanceStatus = 'Full Acceptance with Additional Shares';
        statusColor = '#059669';
      } else {
        acceptanceStatus = 'Full Acceptance Only';
        statusColor = '#10b981';
      }
    } else if (submissionData.action_type === 'renunciation_partial') {
      if (submissionData.shares_renounced > 0) {
        acceptanceStatus = 'Partial Acceptance with Renunciation';
        statusColor = '#f59e0b';
      } else {
        acceptanceStatus = 'Partial Acceptance';
        statusColor = '#fbbf24';
      }
    }

    const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <style>
        @media only screen and (max-width: 620px) {
          .wrapper { padding: 10px !important; }
          .container { width: 100% !important; border-radius: 12px !important; }
          .content { padding: 24px 20px !important; }
          .header { padding: 32px 20px !important; }
          .info-table td { display: block !important; width: 100% !important; box-sizing: border-box !important; }
          .info-table td:first-child { padding-bottom: 4px !important; color: #6b7280 !important; font-size: 11px !important; text-transform: uppercase !important; }
          .info-table td:last-child { padding-bottom: 16px !important; border-bottom: none !important; }
          .amount-value { font-size: 24px !important; }
        }
      </style>
    </head>
    <body style="margin: 0; padding: 0; background-color: #f8fafc; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #f8fafc;" class="wrapper">
        <tr>
          <td align="center" style="padding: 40px 10px;">
            <table role="presentation" width="600" cellspacing="0" cellpadding="0" style="background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);" class="container">
              
              <!-- Header -->
              <tr>
                <td style="background-color: #0A4269; padding: 40px; text-align: center;" class="header">
                  <h1 style="color: #ffffff; font-size: 22px; margin: 0; font-weight: 700; letter-spacing: -0.02em;">Linkage Assurance Plc</h1>
                  <p style="color: #93c5fd; font-size: 11px; margin: 8px 0 0; text-transform: uppercase; font-weight: 700; letter-spacing: 0.1em;">Rights Issue Confirmation</p>
                </td>
              </tr>
              
              <!-- Content -->
              <tr>
                <td style="padding: 40px;" class="content">
                  <div style="text-align: center; margin-bottom: 32px;">
                    <div style="background-color: #ecfdf5; color: #059669; padding: 8px 16px; border-radius: 9999px; font-size: 13px; font-weight: 700; display: inline-block; margin-bottom: 16px;">✓ SUBMISSION RECEIVED</div>
                    <h2 style="color: #111827; font-size: 18px; margin: 0; font-weight: 700;">Application Confirmation</h2>
                  </div>

                  <p style="color: #374151; font-size: 15px; line-height: 1.6; margin: 0 0 24px;">
                    Dear <strong>${submissionData.name}</strong>,
                  </p>
                  <p style="color: #4b5563; font-size: 14px; line-height: 1.6; margin: 0 0 32px;">
                    Your Rights Issue application has been successfully submitted. Below is a summary of your application for your records.
                  </p>
                  
                  <!-- Summary Card -->
                  <div style="background-color: #f8fafc; border: 1px solid #e5e7eb; border-radius: 12px; padding: 24px; margin-bottom: 32px;">
                    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" class="info-table">
                      <tr>
                        <td style="padding: 10px 0; font-size: 14px; color: #6b7280; width: 45%;">Registration Number</td>
                        <td style="padding: 10px 0; font-size: 14px; color: #111827; font-weight: 600;">${submissionData.reg_account_number}</td>
                      </tr>
                      <tr>
                        <td style="padding: 10px 0; font-size: 14px; color: #6b7280;">Acceptance Type</td>
                        <td style="padding: 10px 0; font-size: 14px; color: ${statusColor}; font-weight: 700;">${acceptanceStatus}</td>
                      </tr>
                      <tr>
                        <td style="padding: 10px 0; font-size: 14px; color: #6b7280;">Payment Method</td>
                        <td style="padding: 10px 0; font-size: 14px; color: #111827; font-weight: 600;">
                          ${submissionData.payment_ref ? 'Online Payment Gateway' : 'Bank Transfer / Manual'}
                        </td>
                      </tr>
                      ${submissionData.payment_ref ? `
                      <tr>
                        <td style="padding: 10px 0; font-size: 14px; color: #6b7280;">Payment Ref</td>
                        <td style="padding: 10px 0; font-size: 14px; color: #111827; font-weight: 600; font-family: monospace;">${submissionData.payment_ref}</td>
                      </tr>
                      ` : ''}
                      <tr style="border-top: 1px solid #e5e7eb;">
                        <td style="padding: 20px 0 0; font-size: 15px; color: #111827; font-weight: 700;">Total Paid/Payable</td>
                        <td style="padding: 20px 0 0; font-size: 28px; color: #059669; font-weight: 800;" class="amount-value">₦${parseFloat(submissionData.amount_payable || submissionData.amount_due || 0).toLocaleString('en-NG', { minimumFractionDigits: 2 })}</td>
                      </tr>
                    </table>
                  </div>
                  
                  <!-- Info Box -->
                  <div style="background-color: #f0f9ff; border-left: 4px solid #0ea5e9; padding: 20px; border-radius: 4px; margin-bottom: 32px;">
                    <p style="color: #0c4a6e; font-size: 13px; font-weight: 600; margin: 0 0 8px;">What's Next?</p>
                    <p style="color: #0ea5e9; font-size: 13px; margin: 0; line-height: 1.5;">
                      Our team will review your submission. Once verified, you will receive notifications regarding the allotment of your shares. Please keep this email for your reference.
                    </p>
                  </div>
                  
                  <p style="color: #64748b; font-size: 13px; line-height: 1.6; margin: 0; text-align: center;">
                    Questions? Contact us at <a href="mailto:registrars@apel.ng" style="color: #0A4269; text-decoration: none; font-weight: 600;">registrars@apel.ng</a>
                  </p>
                </td>
              </tr>
              
              <!-- Footer -->
              <tr>
                <td style="background-color: #f8fafc; padding: 32px 40px; text-align: center; border-top: 1px solid #e5e7eb;">
                  <p style="color: #94a3b8; font-size: 11px; margin: 0 0 8px; text-transform: uppercase; letter-spacing: 0.05em;">
                    Linkage Assurance Plc Rights Issue Portal
                  </p>
                  <p style="color: #cbd5e1; font-size: 10px; margin: 0;">
                    &copy; ${new Date().getFullYear()} Linkage Assurance Plc. All rights reserved.
                  </p>
                </td>
              </tr>
              
            </table>
          </td>
        </tr>
      </table>
    </body>
    </html>
    `;

    // Handle attachment if filled_form_path exists
    let attachments = [];
    if (submissionData.filled_form_path) {
      try {
        const cloudName = process.env.CLOUDINARY_CLOUD_NAME || 'apelng';

        // Generate the direct download URL
        const directDownloadUrl = `https://res.cloudinary.com/${cloudName}/image/upload/${submissionData.filled_form_path}`;

        console.log('Attempting to download PDF from:', directDownloadUrl);

        const response = await fetch(directDownloadUrl);

        if (response.ok) {
          const fileBuffer = await response.arrayBuffer();

          // For Mailgun, attachments need to be in a specific format
          attachments.push({
            filename: `Rights_Issue_Form_${submissionData.reg_account_number || submissionData.id}.pdf`,
            data: Buffer.from(fileBuffer),
          });

          console.log('PDF attachment added to email');
        } else {
          console.warn('Could not download PDF file, status:', response.status);
        }
      } catch (attachmentError) {
        console.warn('Could not attach PDF file, sending email without attachment:', attachmentError.message);
      }
    } else {
      console.warn('No filled_form_path found in submission data');
    }

    try {
      const result = await this.sendEmail(to, subject, html, attachments);
      console.log('Shareholder confirmation email sent');
      return result;
    } catch (error) {
      console.error('Failed to send shareholder confirmation:', error);
      return { success: false, error: error.message };
    }
  }

  // Test connection
  async testConnection() {
    try {
      // Test by sending a simple verification request
      const domains = await this.client.domains.list();
      console.log('Mailgun API connection established');
      return {
        success: true,
        message: 'Mailgun API connection established',
        domain: this.domain
      };
    } catch (error) {
      console.error('Mailgun API connection failed:', error.message);
      return { success: false, error: error.message };
    }
  }

  // Send payment success notification
  async sendPaymentSuccessEmail({ email, name, transactionRef, amount, amountPaid, processorFee, paymentDate }) {
    const subject = 'Payment Receipt - Linkage Assurance Plc Rights Issue';

    const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <style>
        @media only screen and (max-width: 620px) {
          .wrapper { padding: 0 !important; }
          .container { width: 100% !important; border-radius: 0 !important; }
          .content { padding: 32px 20px !important; }
          .header { padding: 40px 20px !important; }
          .detail-row td { display: block !important; width: 100% !important; text-align: left !important; }
          .detail-row td:first-child { padding-bottom: 4px !important; color: #6b7280 !important; font-size: 11px !important; text-transform: uppercase !important; }
          .detail-row td:last-child { padding-bottom: 20px !important; border-bottom: none !important; }
          .total-paid { font-size: 28px !important; }
        }
      </style>
    </head>
    <body style="margin: 0; padding: 0; background-color: #f1f5f9; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #f1f5f9;" class="wrapper">
        <tr>
          <td align="center">
            <table role="presentation" width="600" cellspacing="0" cellpadding="0" style="background-color: #ffffff; border-radius: 20px; overflow: hidden; box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1);" class="container">
              
              <!-- Header -->
              <tr>
                <td style="background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%); padding: 48px 40px; text-align: center;" class="header">
                  <div style="background-color: #10b981; width: 64px; height: 64px; border-radius: 32px; margin: 0 auto 24px; display: table;">
                    <span style="display: table-cell; vertical-align: middle; color: #ffffff; font-size: 32px; font-weight: bold;">✓</span>
                  </div>
                  <h1 style="color: #ffffff; font-size: 24px; margin: 0; font-weight: 800; letter-spacing: -0.02em;">Payment Successful</h1>
                  <p style="color: #94a3b8; font-size: 13px; margin: 8px 0 0; text-transform: uppercase; font-weight: 700; letter-spacing: 0.1em;">Official Receipt</p>
                </td>
              </tr>
              
              <!-- Content -->
              <tr>
                <td style="padding: 48px 40px;" class="content">
                  <p style="color: #475569; font-size: 16px; line-height: 1.6; margin: 0 0 32px;">
                    Hi <strong>${name}</strong>, your payment for the Linkage Assurance Plc Rights Issue has been confirmed. Thank you for your subscription.
                  </p>
                  
                  <!-- Receipt Box -->
                  <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 16px; overflow: hidden; margin-bottom: 32px;">
                    <div style="padding: 24px; border-bottom: 1px dashed #e2e8f0;">
                      <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                        <tr class="detail-row">
                          <td style="padding: 8px 0; font-size: 14px; color: #64748b;">Transaction Reference</td>
                          <td style="padding: 8px 0; font-size: 14px; color: #0f172a; font-weight: 700; text-align: right; font-family: monospace;">${transactionRef}</td>
                        </tr>
                        <tr class="detail-row">
                          <td style="padding: 8px 0; font-size: 14px; color: #64748b;">Payment Date</td>
                          <td style="padding: 8px 0; font-size: 14px; color: #0f172a; font-weight: 600; text-align: right;">${paymentDate}</td>
                        </tr>
                      </table>
                    </div>
                    
                    <div style="padding: 24px;">
                      <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                        <tr class="detail-row">
                          <td style="padding: 8px 0; font-size: 14px; color: #64748b;">Amount Paid</td>
                          <td style="padding: 8px 0; font-size: 14px; color: #0f172a; font-weight: 600; text-align: right;">₦${parseFloat(amount || 0).toLocaleString('en-NG', { minimumFractionDigits: 2 })}</td>
                        </tr>
                      
                        <tr>
                          <td colspan="2" style="padding: 20px 0 0;">
                            <div style="background-color: #f1f5f9; padding: 20px; border-radius: 12px; text-align: center;">
                              <p style="color: #64748b; font-size: 12px; margin: 0 0 4px; text-transform: uppercase; font-weight: 700;">Total Amount Paid</p>
                              <p style="color: #059669; font-size: 32px; margin: 0; font-weight: 800;" class="total-paid">₦${parseFloat(amountPaid || 0).toLocaleString('en-NG', { minimumFractionDigits: 2 })}</p>
                            </div>
                          </td>
                        </tr>
                      </table>
                    </div>
                  </div>

                  <!-- Note -->
                  <div style="border-top: 1px solid #f1f5f9; padding-top: 32px; text-align: center;">
                    <p style="color: #94a3b8; font-size: 13px; margin: 0;">
                      Please retain this receipt for your records. Your wallet has been credited and your application is being processed.
                    </p>
                  </div>
                </td>
              </tr>
              
              <!-- Footer -->
              <tr>
                <td style="background-color: #f8fafc; padding: 32px; text-align: center; border-top: 1px solid #f1f5f9;">
                  <p style="color: #64748b; font-size: 14px; font-weight: 600; margin: 0 0 8px;">Linkage Assurance Plc</p>
                  <p style="color: #94a3b8; font-size: 11px; margin: 0;">&copy; ${new Date().getFullYear()} Linkage Assurance Plc Registrars. All rights reserved.</p>
                </td>
              </tr>
              
            </table>
          </td>
        </tr>
      </table>
    </body>
    </html>
    `;

    try {
      const result = await this.sendEmail(email, subject, html);
      console.log('Payment success email sent to', email);
      return result;
    } catch (error) {
      console.error('Failed to send payment success email:', error);
      return { success: false, error: error.message };
    }
  }

  // Send payment failure notification
  async sendPaymentFailureEmail({ email, name, transactionRef, amount, errorMessage, paymentDate }) {
    const subject = 'Payment Issue - Linkage Assurance Plc Rights Issue';

    const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <style>
        @media only screen and (max-width: 620px) {
          .wrapper { padding: 0 !important; }
          .container { width: 100% !important; border-radius: 0 !important; }
          .content { padding: 32px 20px !important; }
          .header { padding: 40px 20px !important; }
          .detail-row td { display: block !important; width: 100% !important; text-align: left !important; }
          .detail-row td:first-child { padding-bottom: 4px !important; color: #6b7280 !important; font-size: 11px !important; text-transform: uppercase !important; }
          .detail-row td:last-child { padding-bottom: 20px !important; border-bottom: none !important; }
        }
      </style>
    </head>
    <body style="margin: 0; padding: 0; background-color: #f1f5f9; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #f1f5f9;" class="wrapper">
        <tr>
          <td align="center" style="padding: 40px 0;">
            <table role="presentation" width="600" cellspacing="0" cellpadding="0" style="background-color: #ffffff; border-radius: 20px; overflow: hidden; box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1);" class="container">
              
              <!-- Header -->
              <tr>
                <td style="background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%); padding: 48px 40px; text-align: center;" class="header">
                  <div style="background-color: #ef4444; width: 64px; height: 64px; border-radius: 32px; margin: 0 auto 24px; display: table;">
                    <span style="display: table-cell; vertical-align: middle; color: #ffffff; font-size: 32px; font-weight: bold;">!</span>
                  </div>
                  <h1 style="color: #ffffff; font-size: 24px; margin: 0; font-weight: 800; letter-spacing: -0.02em;">Payment Unverified</h1>
                  <p style="color: #94a3b8; font-size: 13px; margin: 8px 0 0; text-transform: uppercase; font-weight: 700; letter-spacing: 0.1em;">Action Required</p>
                </td>
              </tr>
              
              <!-- Content -->
              <tr>
                <td style="padding: 48px 40px;" class="content">
                  <p style="color: #475569; font-size: 16px; line-height: 1.6; margin: 0 0 32px;">
                    Hi <strong>${name || 'Valued Shareholder'}</strong>, we were unable to verify your payment for the Linkage Assurance Plc Rights Issue. Please see the details below.
                  </p>
                  
                  <!-- Error Box -->
                  <div style="background-color: #fef2f2; border: 1px solid #fee2e2; border-radius: 16px; overflow: hidden; margin-bottom: 32px;">
                    <div style="padding: 24px; border-bottom: 1px dashed #fee2e2;">
                      <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                        <tr class="detail-row">
                          <td style="padding: 8px 0; font-size: 14px; color: #991b1b;">Reference Number</td>
                          <td style="padding: 8px 0; font-size: 14px; color: #0f172a; font-weight: 700; text-align: right; font-family: monospace;">${transactionRef}</td>
                        </tr>
                        <tr class="detail-row">
                          <td style="padding: 8px 0; font-size: 14px; color: #991b1b;">Amount</td>
                          <td style="padding: 8px 0; font-size: 14px; color: #0f172a; font-weight: 600; text-align: right;">₦${parseFloat(amount).toLocaleString('en-NG', { minimumFractionDigits: 2 })}</td>
                        </tr>
                      </table>
                    </div>
                    
                    ${errorMessage ? `
                    <div style="padding: 24px; background-color: #fff1f2;">
                      <p style="color: #991b1b; font-size: 12px; margin: 0 0 4px; text-transform: uppercase; font-weight: 700;">Reason for failure</p>
                      <p style="color: #e11d48; font-size: 14px; margin: 0; font-weight: 600;">${errorMessage}</p>
                    </div>
                    ` : ''}
                  </div>

                  <!-- Next Steps -->
                  <div style="background-color: #f8fafc; border-radius: 12px; padding: 24px; border: 1px solid #e2e8f0;">
                    <h3 style="color: #0f172a; font-size: 14px; font-weight: 700; margin: 0 0 12px;">What should you do?</h3>
                    <ul style="color: #475569; font-size: 14px; margin: 0; padding-left: 20px; line-height: 1.6;">
                      <li>Ensure you have sufficient funds in your bank account.</li>
                      <li>Try the payment again or use a different card/method.</li>
                      <li>If you were debited, please contact your bank with the reference above.</li>
                    </ul>
                  </div>

                  <p style="color: #64748b; font-size: 13px; margin: 32px 0 0; text-align: center;">
                    Need help? Contact Linkage Assurance Plc Registrars or your Stockbroker.
                  </p>
                </td>
              </tr>
              
              <!-- Footer -->
              <tr>
                <td style="background-color: #f8fafc; padding: 32px; text-align: center; border-top: 1px solid #f1f5f9;">
                  <p style="color: #64748b; font-size: 14px; font-weight: 600; margin: 0 0 8px;">Linkage Assurance Plc </p>
                  <p style="color: #94a3b8; font-size: 11px; margin: 0;">&copy; ${new Date().getFullYear()} Linkage Assurance Plc Registrars. All rights reserved.</p>
                </td>
              </tr>
              
            </table>
          </td>
        </tr>
      </table>
    </body>
    </html>
    `;

    try {
      const result = await this.sendEmail(email, subject, html);
      console.log('Payment failure email sent to', email);
      return result;
    } catch (error) {
      console.error('Failed to send payment failure email:', error);
      return { success: false, error: error.message };
    }
  }

  // Generic email sending method for custom emails
  async sendCustomEmail(to, subject, html, attachments = []) {
    return await this.sendEmail(to, subject, html, attachments);
  }
}

// Initialize Mailgun Email Service
const mailgunEmailService = new MailgunEmailService();

// Test connection on startup (optional)
mailgunEmailService.testConnection();

// Export the service instance and class
module.exports = {
  MailgunEmailService,
  mailgunEmailService,

  // Legacy function exports for backward compatibility
  sendRightsSubmissionNotification: (submissionData) =>
    mailgunEmailService.sendRightsSubmissionNotification(submissionData),

  sendFormSubmissionNotification: (submissionData) =>
    mailgunEmailService.sendFormSubmissionNotification(submissionData),

  sendShareholderConfirmation: (submissionData) =>
    mailgunEmailService.sendShareholderConfirmation(submissionData)
};
