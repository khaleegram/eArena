
'use server';

import nodemailer from 'nodemailer';
import type { TransportOptions } from 'nodemailer';

interface SendEmailParams {
    to: string;
    subject: string;
    body: string;
}

export async function sendEmail({ to, subject, body }: SendEmailParams) {
    const { SMTP_HOST, SMTP_PORT, SMTP_USERNAME, SMTP_PASSWORD } = process.env;

    const hasSmtpConfig = SMTP_HOST && SMTP_PORT && SMTP_USERNAME && SMTP_PASSWORD;

    if (!hasSmtpConfig) {
        console.error(`[Email] Email sending failed: SMTP credentials are not fully configured in the .env file.`);
        // This makes the failure explicit to the calling function.
        throw new Error('The email service is not configured on the server. Please contact support.');
    }

    // Log the configuration to help with debugging, but NEVER log the password.
    console.log(`[Email] Attempting to send email via ${SMTP_HOST}:${SMTP_PORT} as user ${SMTP_USERNAME}`);

    try {
        const port = Number(SMTP_PORT);
        if (isNaN(port)) {
            throw new Error('Invalid SMTP_PORT provided.');
        }

        // Make the config more robust. Let nodemailer handle STARTTLS for port 587.
        const smtpConfig: TransportOptions = {
            host: SMTP_HOST,
            port: port,
            auth: {
                user: SMTP_USERNAME,
                pass: SMTP_PASSWORD,
            },
        };
        
        if (port === 465) {
            smtpConfig.secure = true;
        }
        
        const transporter = nodemailer.createTransport(smtpConfig);

        const mailOptions = {
            from: `"eArena" <${SMTP_USERNAME}>`,
            to: to,
            subject: subject,
            text: body,
            html: `<p>${body.replace(/\n/g, '<br>')}</p>`,
        };

        await transporter.sendMail(mailOptions);
        console.log(`[Email] Email sent successfully to ${to}`);
    } catch (error) {
        console.error('[Email] Failed to send email. Please check your SMTP credentials and server settings in the .env file. Error:', error);
        throw new Error('Could not send email due to a server configuration issue. Please contact support or check server logs.');
    }
}
