const nodemailer = require('nodemailer');
const path = require('path');
const fs = require('fs').promises;

// Create transporter
const createTransporter = () => {
  return nodemailer.createTransport({
    service: 'gmail', // or your email service
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    }
  });
};

// Send rights submission notification
const sendRightsSubmissionNotification = async (submissionData) => {
  try {
    const transporter = createTransporter();
    
    const mailOptions = {
      from: process.env.EMAIL_USER || 'your-email@gmail.com',
      to: process.env.ADMIN_EMAIL || 'admin@company.com',
      subject: 'New Rights Issue Form Submission',
      html: `
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
      `
    };

    const info = await transporter.sendMail(mailOptions);
    console.log('Email notification sent:', info.messageId);
    return true;
  } catch (error) {
    console.error('Error sending email notification:', error);
    return false;
  }
};

//Send regular form submission notification
const sendFormSubmissionNotification = async (submissionData) => {
  try {
    const transporter = createTransporter();
    
    const mailOptions = {
      from: process.env.EMAIL_USER || 'your-email@gmail.com',
      to: process.env.ADMIN_EMAIL || 'admin@company.com',
      subject: 'New Form Submission',
      html: `
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
      `
    };

    const info = await transporter.sendMail(mailOptions);
    console.log('Email notification sent:', info.messageId);
    return true;
  } catch (error) {
    console.error('Error sending email notification:', error);
    return false;
  }
};

// Send submission confirmation to shareholder with filled form
const sendShareholderConfirmation = async (submissionData) => {
  try {
    const transporter = createTransporter();
    
    // Get the absolute path to the filled form
    const filledFormPath = path.join(__dirname, '../uploads', submissionData.filled_form_path);
    
    // Read the file as buffer for attachment
    const filledFormBuffer = await fs.readFile(filledFormPath);
    
    const mailOptions = {
      from: `"${process.env.EMAIL_FROM_NAME || 'Rights Issue System'}" <${process.env.EMAIL_USER}>`,
      to: submissionData.email,
      subject: 'Your Rights Issue Form Submission Confirmation',
      html: `
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
          
          <p>If you have any questions about your submission, please contact our support team at ${process.env.SUPPORT_EMAIL }.</p>
          
          <p>Best regards,<br>The ${process.env.COMPANY_NAME || 'Rights Issue'} Team</p>
          
          <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 30px 0;">
          <p style="color: #6b7280; font-size: 12px; text-align: center;">
            This is an automated message. Please do not reply to this email.
          </p>
        </div>
      `,
      attachments: [
        {
          filename: `Rights_Issue_Form_${submissionData.reg_account_number || 'submission'}.pdf`,
          content: filledFormBuffer,
          contentType: 'application/pdf'
        }
      ]
    };

    const info = await transporter.sendMail(mailOptions);
    console.log('Shareholder confirmation email sent:', info.messageId);
    return true;
  } catch (error) {
    console.error('Error sending shareholder confirmation email:', error);
    return false;
  }
};

module.exports = {
  sendRightsSubmissionNotification,
  sendFormSubmissionNotification,
  sendShareholderConfirmation
};
