# Email Notification Setup

This application sends email notifications when forms are submitted. To enable email notifications, you need to configure the following environment variables:

## Required Environment Variables

Add these to your `.env` file:

```env
# Email Configuration
EMAIL_USER=your-email@gmail.com
EMAIL_PASS=your-app-password
ADMIN_EMAIL=admin@company.com
FRONTEND_URL=http://localhost:5001
```

## Gmail Setup Instructions

1. **Enable 2-Factor Authentication**
   - Go to your Google Account settings
   - Enable 2-factor authentication

2. **Generate App Password**
   - Go to Google Account settings
   - Navigate to Security > 2-Step Verification > App passwords
   - Generate a new app password for "Mail"
   - Use this password in `EMAIL_PASS`

3. **Configure Email Settings**
   - `EMAIL_USER`: Your Gmail address
   - `EMAIL_PASS`: The app password you generated
   - `ADMIN_EMAIL`: The email address where notifications should be sent
   - `FRONTEND_URL`: Your frontend URL (for admin dashboard links)

## Alternative Email Services

You can modify the email service in `server/services/emailService.js` to use other email providers like:
- Outlook/Hotmail
- Yahoo
- Custom SMTP server


## Testing Email Notifications

1. Start the server with email configuration
2. Submit a form through the application
3. Check the admin email for the notification
4. Check server logs for email status

## Troubleshooting

- If emails aren't sending, check the server logs for error messages
- Ensure your Gmail app password is correct
- Make sure 2-factor authentication is enabled
- Check that the admin email address is valid
