'use server';

import nodemailer from 'nodemailer';

interface SendEmailParams {
    to: string;
    subject: string;
    body: string;
}

export async function sendEmail({ to, subject, body }: SendEmailParams) {
    const { SMTP_HOST, SMTP_PORT, SMTP_SECURE, SMTP_USERNAME, SMTP_PASSWORD } = process.env;

    const hasSmtpConfig = SMTP_HOST && SMTP_PORT && SMTP_USERNAME && SMTP_PASSWORD;

    if (!hasSmtpConfig) {
        console.error(`[Email] Email not sent to ${to}: SMTP credentials are not fully configured in the .env file.`);
        // To avoid breaking the user flow, we don't throw an error to the client,
        // but the links will not be sent. The console warning provides the necessary info.
        return;
    }

    // Log the configuration to help with debugging, but NEVER log the password.
    console.log(`[Email] Attempting to send email via ${SMTP_HOST}:${SMTP_PORT} as user ${SMTP_USERNAME}`);

    try {
        const smtpConfig = {
            host: SMTP_HOST,
            port: Number(SMTP_PORT),
            secure: SMTP_SECURE === 'true', // true for 465, false for other ports
            auth: {
                user: SMTP_USERNAME,
                pass: SMTP_PASSWORD,
            },
        };
        
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
