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
    this.fromName = 'The Initiates E-rights';
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
      console.log('✅ Mailgun client initialized');
    } catch (error) {
      console.error('❌ Failed to initialize Mailgun client:', error.message);
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
      
      console.log(`✅ Email sent via Mailgun API to ${to}`);
      return { 
        success: true, 
        messageId: response.id,
        response: response 
      };
    } catch (error) {
      console.error('❌ Mailgun API email failed:', error.message);
      
      // Log detailed error information for debugging
      if (error.details) {
        console.error('Mailgun error details:', error.details);
      }
      
      throw error;
    }
  }




// Send rights submission notification to admin
async sendRightsSubmissionNotification(submissionData) {
  const subject = 'New Rights Issue Form Submission';
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
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #2563eb;">New Rights Issue Form Submission</h2>
      
      <div style="background-color: #f8fafc; padding: 20px; border-radius: 8px; margin: 20px 0;">
        <h3 style="color: #1e40af; margin-top: 0;">Shareholder Information</h3>
        <table style="width: 100%; border-collapse: collapse;">
          <tr>
            <td style="padding: 8px 0; font-weight: bold; color: #374151;">CHN:</td>
            <td style="padding: 8px 0;">${submissionData.chn}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; font-weight: bold; color: #374151;">Reg Account Number:</td>
            <td style="padding: 8px 0;">${submissionData.reg_account_number}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; font-weight: bold; color: #374151;">Name:</td>
            <td style="padding: 8px 0;">${submissionData.name}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; font-weight: bold; color: #374151;">Holdings:</td>
            <td style="padding: 8px 0;">${submissionData.holdings.toLocaleString()}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; font-weight: bold; color: #374151;">Rights Issue:</td>
            <td style="padding: 8px 0;">${submissionData.rights_issue}</td>
          </tr>
          
          <tr>
            <td style="padding: 8px 0; font-weight: bold; color: #374151;">Acceptance Status:</td>
            <td style="padding: 8px 0;">
              <span style="color: ${statusColor}; font-weight: bold;">${acceptanceStatus}</span>
            </td>
          </tr>

          <!-- Additional Shares Information -->
          ${submissionData.apply_additional ? `
            <tr>
              <td style="padding: 8px 0; font-weight: bold; color: #374151;">Additional Shares Applied:</td>
              <td style="padding: 8px 0; color: #059669; font-weight: bold;">
                ${submissionData.additional_shares?.toLocaleString() || '0'} shares
              </td>
            </tr>
            <tr>
              <td style="padding: 8px 0; font-weight: bold; color: #374151;">Additional Amount:</td>
              <td style="padding: 8px 0; color: #059669; font-weight: bold;">
                ₦${submissionData.additional_amount?.toLocaleString() || '0'}
              </td>
            </tr>
          ` : ''}

          <!-- Renounced Shares Information -->
          ${submissionData.shares_renounced > 0 ? `
            <tr>
              <td style="padding: 8px 0; font-weight: bold; color: #374151;">Shares Renounced:</td>
              <td style="padding: 8px 0; color: #dc2626; font-weight: bold;">
                ${submissionData.shares_renounced.toLocaleString()} shares
              </td>
            </tr>
          ` : ''}

          <tr>
            <td style="padding: 8px 0; font-weight: bold; color: #374151;">Amount Due:</td>
            <td style="padding: 8px 0;">₦${submissionData.amount_due.toLocaleString()}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; font-weight: bold; color: #374151;">Total Amount Payable:</td>
            <td style="padding: 8px 0; font-weight: bold;">₦${submissionData.amount_payable?.toLocaleString() || submissionData.amount_due.toLocaleString()}</td>
          </tr>
        </table>
      </div>
      
      <!-- Rest of the email template remains the same -->
      <div style="background-color: #f0fdf4; padding: 20px; border-radius: 8px; margin: 20px 0;">
        <h3 style="color: #166534; margin-top: 0;">Files Uploaded</h3>
        <ul style="margin: 0; padding-left: 20px;">
          <li style="margin: 8px 0;">Filled Form: ${submissionData.filled_form_path ? '✅ Uploaded' : '❌ Not uploaded'}</li>
          <li style="margin: 8px 0;">Payment Receipt: ${submissionData.receipt_path ? '✅ Uploaded' : '❌ Not uploaded'}</li>
        </ul>
      </div>
      
      <div style="background-color: #fef3c7; padding: 20px; border-radius: 8px; margin: 20px 0;">
        <h3 style="color: #92400e; margin-top: 0;">Submission Details</h3>
        <p style="margin: 8px 0;"><strong>Submission ID:</strong> ${submissionData.id}</p>
        <p style="margin: 8px 0;"><strong>Submitted:</strong> ${new Date(submissionData.created_at).toLocaleString()}</p>
        <p style="margin: 8px 0;"><strong>Status:</strong> <span style="color: #059669; font-weight: bold;">${submissionData.status}</span></p>
      </div>
      
      <div style="text-align: center; margin: 30px 0;">
        <a href="${process.env.FRONTEND_URL || 'http://localhost:5000'}/admin" 
           style="background-color: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">
          View in Admin Dashboard
        </a>
      </div>
      
      <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 30px 0;">
      <p style="color: #6b7280; font-size: 14px; text-align: center;">
        This is an automated notification from the Rights Issue Management System.
      </p>
    </div>
  `;

  try {
    const result = await this.sendEmail(to, subject, html);
    console.log('✅ Rights submission notification sent to admin');
    return result;
  } catch (error) {
    console.error('❌ Failed to send rights submission notification:', error);
    return { success: false, error: error.message };
  }
}

// Also update the shareholder confirmation email
async sendShareholderConfirmation(submissionData) {
  const subject = 'Your Rights Issue Form Submission Confirmation';
  const to = submissionData.email;
  
  // Determine acceptance status for shareholder
  let acceptanceDetails = '';
  if (submissionData.action_type === 'full_acceptance') {
    if (submissionData.apply_additional) {
      acceptanceDetails = `Full Acceptance with ${submissionData.additional_shares?.toLocaleString() || '0'} additional shares`;
    } else {
      acceptanceDetails = 'Full Acceptance of allotted shares';
    }
  } else if (submissionData.action_type === 'renunciation_partial') {
    if (submissionData.shares_renounced > 0) {
      acceptanceDetails = `Partial Acceptance (${submissionData.shares_accepted?.toLocaleString() || '0'} shares accepted, ${submissionData.shares_renounced?.toLocaleString() || '0'} shares renounced)`;
    } else {
      acceptanceDetails = `Partial Acceptance of ${submissionData.shares_accepted?.toLocaleString() || '0'} shares`;
    }
  }
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
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #2563eb;">Rights Issue Form Submission Confirmation</h2>
      
      <p>Dear ${submissionData.name},</p>
      
      <p>Thank you for submitting your Rights Issue Form. Your submission has been received and is being processed.</p>
      
      <div style="background-color: #f8fafc; padding: 20px; border-radius: 8px; margin: 20px 0;">
        <h3 style="color: #1e40af; margin-top: 0;">Submission Summary</h3>
        <table style="width: 100%; border-collapse: collapse;">
          <tr>
            <td style="padding: 8px 0; font-weight: bold; color: #374151; width: 40%;">Registration Number:</td>
            <td style="padding: 8px 0;">${submissionData.reg_account_number}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; font-weight: bold; color: #374151;">Current Holdings:</td>
            <td style="padding: 8px 0;">${submissionData.holdings ? submissionData.holdings.toLocaleString() : '0'}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; font-weight: bold; color: #374151;">Rights Allotted:</td>
            <td style="padding: 8px 0;">${submissionData.rights_issue ? submissionData.rights_issue.toLocaleString() : '0'}</td>
          </tr>

 <tr>
            <td style="padding: 8px 0; font-weight: bold; color: #374151;">Acceptance Status:</td>
            <td style="padding: 8px 0;">
              <span style="color: ${statusColor}; font-weight: bold;">${acceptanceStatus}</span>
            </td>
          </tr>

          <!-- Additional Shares Information -->
          ${submissionData.apply_additional ? `
            <tr>
              <td style="padding: 8px 0; font-weight: bold; color: #374151;">Additional Shares Applied:</td>
              <td style="padding: 8px 0; color: #059669; font-weight: bold;">
                ${submissionData.additional_shares?.toLocaleString() || '0'} shares
              </td>
            </tr>
            <tr>
              <td style="padding: 8px 0; font-weight: bold; color: #374151;">Additional Amount:</td>
              <td style="padding: 8px 0; color: #059669; font-weight: bold;">
                ₦${submissionData.additional_amount?.toLocaleString() || '0'}
              </td>
            </tr>
          ` : ''}

          <!-- Renounced Shares Information -->
          ${submissionData.shares_renounced > 0 ? `
            <tr>
              <td style="padding: 8px 0; font-weight: bold; color: #374151;">Shares Renounced:</td>
              <td style="padding: 8px 0; color: #dc2626; font-weight: bold;">
                ${submissionData.shares_renounced.toLocaleString()} shares
              </td>
            </tr>
          ` : ''}

          <tr>
            <td style="padding: 8px 0; font-weight: bold; color: #374151;">Amount Due:</td>
            <td style="padding: 8px 0;">₦${submissionData.amount_due.toLocaleString()}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; font-weight: bold; color: #374151;">Total Amount Payable:</td>
            <td style="padding: 8px 0; font-weight: bold;">₦${submissionData.amount_payable?.toLocaleString() || submissionData.amount_due.toLocaleString()}</td>
          </tr>
        </table>
      </div>
            <td style="padding: 8px 0; font-weight: bold; color: #374151;">Submission Date:</td>
            <td style="padding: 8px 0;">${new Date(submissionData.created_at).toLocaleString()}</td>
          </tr>
        </table>
      </div>
      
      <p>Please find attached a copy of your completed Rights Issue Form for your records.</p>
      
      <p>If you have any questions about your submission, please contact our support team at ${process.env.SUPPORT_EMAIL || 'support@company.com'}.</p>
      
      <p>Best regards,<br>The ${process.env.COMPANY_NAME || 'Rights Issue'} Team</p>
      
      <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 30px 0;">
      <p style="color: #6b7280; font-size: 12px; text-align: center;">
        This is an automated message. Please do not reply to this email.
      </p>
    </div>
  `;

    // Handle attachment if filled_form_path exists
    let attachments = [];
    if (submissionData.filled_form_path) {
      try {
        const cloudName = process.env.CLOUDINARY_CLOUD_NAME || 'apelng';
        
        // Generate the direct download URL
        const directDownloadUrl = `https://res.cloudinary.com/${cloudName}/image/upload/${submissionData.filled_form_path}`;
        
        console.log('📥 Attempting to download PDF from:', directDownloadUrl);
        
        const response = await fetch(directDownloadUrl);
        
        if (response.ok) {
          const fileBuffer = await response.arrayBuffer();
          
          // For Mailgun, attachments need to be in a specific format
          attachments.push({
            filename: `Rights_Issue_Form_${submissionData.reg_account_number || submissionData.id}.pdf`,
            data: Buffer.from(fileBuffer),
          });
          
          console.log('✅ PDF attachment added to email');
        } else {
          console.warn('⚠️ Could not download PDF file, status:', response.status);
        }
      } catch (attachmentError) {
        console.warn('⚠️ Could not attach PDF file, sending email without attachment:', attachmentError.message);
      }
    } else {
      console.warn('⚠️ No filled_form_path found in submission data');
    }

    try {
      const result = await this.sendEmail(to, subject, html, attachments);
      console.log('✅ Shareholder confirmation email sent');
      return result;
    } catch (error) {
      console.error('❌ Failed to send shareholder confirmation:', error);
      return { success: false, error: error.message };
    }
  }

  // Test connection
  async testConnection() {
    try {
      // Test by sending a simple verification request
      const domains = await this.client.domains.list();
      console.log('✅ Mailgun API connection established');
      return { 
        success: true, 
        message: 'Mailgun API connection established',
        domain: this.domain 
      };
    } catch (error) {
      console.error('❌ Mailgun API connection failed:', error.message);
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
