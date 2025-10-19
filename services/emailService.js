const nodemailer = require('nodemailer');
const path = require('path');
const fs = require('fs').promises;

// Main Zoho Mail Service Class
class ZohoMailService {
  constructor() {
    this.clientId = process.env.ZOHO_CLIENT_ID;
    this.clientSecret = process.env.ZOHO_CLIENT_SECRET;
    this.refreshToken = process.env.ZOHO_REFRESH_TOKEN;
    this.fromEmail = process.env.ZOHO_FROM_EMAIL;
    this.fromName = 'The Initiates E-rights';
    this.accessToken = null;
  }

  // Get access token using refresh token
  async getAccessToken() {
    try {
      const response = await fetch('https://accounts.zoho.com/oauth/v2/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          grant_type: 'refresh_token',
          client_id: this.clientId,
          client_secret: this.clientSecret,
          refresh_token: this.refreshToken
        })
      });

      const data = await response.json();
      
      if (data.error) {
        throw new Error(`Zoho API Error: ${data.error} - ${data.error_description}`);
      }

      this.accessToken = data.access_token;
      console.log('✅ Zoho access token obtained');
      return this.accessToken;
    } catch (error) {
      console.error('❌ Zoho token refresh failed:', error.message);
      throw error;
    }
  }

  // Send email via Zoho API
  async sendEmail(to, subject, html, attachments = []) {
    try {
      if (!this.accessToken) {
        await this.getAccessToken();
      }

      const emailData = {
        fromAddress: this.fromEmail,
        toAddress: to,
        subject: subject,
        content: html,
        mailFormat: 'html'
      };

      // Add attachments if any
      if (attachments.length > 0) {
        emailData.attachments = attachments;
      }

      const response = await fetch('https://mail.zoho.com/api/accounts/79419000000008002/messages', {
        method: 'POST',
        headers: {
          'Authorization': `Zoho-oauthtoken ${this.accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(emailData)
      });

      const result = await response.json();

      if (!response.ok) {
        // If token expired, refresh and retry once
        if (response.status === 401) {
          console.log('🔄 Token expired, refreshing...');
          await this.getAccessToken();
          return await this.sendEmail(to, subject, html, attachments);
        }
        throw new Error(`Zoho API Error: ${result.message || response.statusText}`);
      }

      console.log(`✅ Email sent via Zoho API to ${to}`);
      return { success: true, messageId: result.data?.messageId };
    } catch (error) {
      console.error('❌ Zoho API email failed:', error.message);
      throw error;
    }
  }

  // Send rights submission notification to admin
  async sendRightsSubmissionNotification(submissionData) {
    const subject = 'New Rights Issue Form Submission';
    const to = process.env.ADMIN_EMAIL;
    
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
              <td style="padding: 8px 0; font-weight: bold; color: #374151;">Acceptance Type:</td>
              <td style="padding: 8px 0; text-transform: capitalize;">${submissionData.acceptance_type}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; font-weight: bold; color: #374151;">Amount Due:</td>
              <td style="padding: 8px 0;">₦${submissionData.amount_due.toLocaleString()}</td>
            </tr>
          </table>
        </div>
        
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

  // Send regular form submission notification to admin
  async sendFormSubmissionNotification(submissionData) {
    const subject = 'New Form Submission';
    const to = process.env.ADMIN_EMAIL;
    
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #2563eb;">New Form Submission</h2>
        
        <div style="background-color: #f8fafc; padding: 20px; border-radius: 8px; margin: 20px 0;">
          <h3 style="color: #1e40af; margin-top: 0;">Shareholder Information</h3>
          <table style="width: 100%; border-collapse: collapse;">
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
              <td style="padding: 8px 0; font-weight: bold; color: #374151;">Acceptance Type:</td>
              <td style="padding: 8px 0; text-transform: capitalize;">${submissionData.acceptance_type}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; font-weight: bold; color: #374151;">Amount Payable:</td>
              <td style="padding: 8px 0;">₦${submissionData.amount_payable ? submissionData.amount_payable.toLocaleString() : '0'}</td>
            </tr>
          </table>
        </div>
        
        <div style="background-color: #f0fdf4; padding: 20px; border-radius: 8px; margin: 20px 0;">
          <h3 style="color: #166534; margin-top: 0;">Files Uploaded</h3>
          <ul style="margin: 0; padding-left: 20px;">
            <li style="margin: 8px 0;">Signature: ${submissionData.signature_file ? '✅ Uploaded' : '❌ Not uploaded'}</li>
            <li style="margin: 8px 0;">Receipt: ${submissionData.receipt_file ? '✅ Uploaded' : '❌ Not uploaded'}</li>
          </ul>
        </div>
        
        <div style="background-color: #fef3c7; padding: 20px; border-radius: 8px; margin: 20px 0;">
          <h3 style="color: #92400e; margin-top: 0;">Submission Details</h3>
          <p style="margin: 8px 0;"><strong>Submission ID:</strong> ${submissionData.id}</p>
          <p style="margin: 8px 0;"><strong>Submitted:</strong> ${new Date(submissionData.created_at).toLocaleString()}</p>
          <p style="margin: 8px 0;"><strong>Status:</strong> <span style="color: #059669; font-weight: bold;">${submissionData.status}</span></p>
        </div>
        
        <div style="text-align: center; margin: 30px 0;">
          <a href="${process.env.FRONTEND_URL || 'http://localhost:5001'}/admin" 
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
      console.log('✅ Form submission notification sent to admin');
      return result;
    } catch (error) {
      console.error('❌ Failed to send form submission notification:', error);
      return { success: false, error: error.message };
    }
  }

// Send submission confirmation to shareholder with filled form attachment
// Send submission confirmation to shareholder with filled form attachment
async sendShareholderConfirmation(submissionData) {
  const subject = 'Your Rights Issue Form Submission Confirmation';
  const to = submissionData.email;
  
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
            <td style="padding: 8px 0; font-weight: bold; color: #374151;">Acceptance Type:</td>
            <td style="padding: 8px 0; text-transform: capitalize;">
              ${submissionData.action_type ? submissionData.action_type.replace('_', ' ') : 'N/A'}
            </td>
          </tr>
          <tr>
            <td style="padding: 8px 0; font-weight: bold; color: #374151;">Shares Accepted:</td>
            <td style="padding: 8px 0;">${submissionData.shares_accepted ? submissionData.shares_accepted.toLocaleString() : '0'}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; font-weight: bold; color: #374151;">Total Amount Payable:</td>
            <td style="padding: 8px 0; font-weight: bold;">₦${submissionData.amount_payable ? submissionData.amount_payable.toLocaleString() : '0.00'}</td>
          </tr>
          <tr>
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
      const apiKey = process.env.CLOUDINARY_API_KEY;
      
      if (!apiKey) {
        console.warn('⚠️ Cloudinary API key not found, cannot download PDF');
      } else {
        // Generate the download URL using the API format
        const downloadUrl = `https://api.cloudinary.com/v1_1/${cloudName}/image/download?public_id=${encodeURIComponent(submissionData.filled_form_path)}&attachment=true`;
        
        console.log('📥 Attempting to download PDF from:', downloadUrl);
        
        // For API downloads, we might need to use signed URLs or different approach
        // Let's try the direct URL approach first
        const directDownloadUrl = `https://res.cloudinary.com/${cloudName}/image/upload/${submissionData.filled_form_path}`;
        
        console.log('📥 Trying direct download URL:', directDownloadUrl);
        
        const response = await fetch(directDownloadUrl);
        
        if (response.ok) {
          const fileBuffer = await response.arrayBuffer();
          
          attachments.push({
            filename: `Rights_Issue_Form_${submissionData.reg_account_number || submissionData.id}.pdf`,
            content: Buffer.from(fileBuffer),
            contentType: 'application/pdf'
          });
          
          console.log('✅ PDF attachment added to email');
        } else {
          console.warn('⚠️ Could not download PDF file, status:', response.status);
          
          // Fallback: Try to create a signed URL or use different method
          try {
            // If direct download fails, you might need to use Cloudinary SDK on server side
            const cloudinary = require('../config/cloudinary');
            const pdfBuffer = await new Promise((resolve, reject) => {
              cloudinary.api.resource(submissionData.filled_form_path, 
                { resource_type: 'image' }, 
                (error, result) => {
                  if (error) reject(error);
                  else resolve(result);
                }
              );
            });
            
            if (pdfBuffer) {
              // This approach might need adjustment based on Cloudinary SDK response
              console.log('✅ PDF retrieved via Cloudinary SDK');
            }
          } catch (sdkError) {
            console.warn('⚠️ Cloudinary SDK also failed:', sdkError.message);
          }
        }
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
      await this.getAccessToken();
      console.log('✅ Zoho Mail API connection established');
      return { success: true, message: 'Zoho Mail API connection established' };
    } catch (error) {
      console.error('❌ Zoho Mail API connection failed');
      return { success: false, error: error.message };
    }
  }

  // Generic email sending method for custom emails
  async sendCustomEmail(to, subject, html, attachments = []) {
    return await this.sendEmail(to, subject, html, attachments);
  }
}

// Initialize Zoho Mail Service
const zohoMailService = new ZohoMailService();

// Test connection on startup (optional)
zohoMailService.testConnection();

// Export the service instance and class
module.exports = {
  ZohoMailService,
  zohoMailService,
  
  // Legacy function exports for backward compatibility
  sendRightsSubmissionNotification: (submissionData) => 
    zohoMailService.sendRightsSubmissionNotification(submissionData),
  
  sendFormSubmissionNotification: (submissionData) => 
    zohoMailService.sendFormSubmissionNotification(submissionData),
  
  sendShareholderConfirmation: (submissionData) => 
    zohoMailService.sendShareholderConfirmation(submissionData)
};