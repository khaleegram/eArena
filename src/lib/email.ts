
'use server';

import nodemailer from 'nodemailer';
import type { TransportOptions } from 'nodemailer';

// --- 1. Create a singleton transporter ---
let transporter: nodemailer.Transporter | null = null;

function getTransporter() {
    if (transporter) {
        return transporter;
    }

    const { SMTP_HOST, SMTP_PORT, SMTP_USERNAME, SMTP_PASSWORD } = process.env;
    
    if (!SMTP_HOST || !SMTP_PORT || !SMTP_USERNAME || !SMTP_PASSWORD) {
        console.error(`[Email] Email sending failed: SMTP credentials are not fully configured.`);
        // Returning null will cause sendEmail to throw.
        return null;
    }

    const port = Number(SMTP_PORT);
    if (isNaN(port)) {
        console.error('[Email] Invalid SMTP_PORT provided.');
        return null;
    }

    const smtpConfig: TransportOptions = {
        host: SMTP_HOST,
        port: port,
        secure: port === 465, // Use TLS for 465, STARTTLS for others.
        auth: {
            user: SMTP_USERNAME,
            pass: SMTP_PASSWORD,
        },
        connectionTimeout: 10000,
        socketTimeout: 10000,
    };
    
    transporter = nodemailer.createTransport(smtpConfig);
    if (process.env.NODE_ENV !== 'production') {
        console.log(`[Email] Nodemailer transporter created for ${SMTP_HOST}`);
    }
    return transporter;
}

interface SendEmailParams {
    to: string;
    subject: string;
    body: string;
}

function escapeHtml(text: string) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}


export async function sendEmail({ to, subject, body }: SendEmailParams) {
    const mailer = getTransporter();

    if (!mailer) {
        throw new Error('The email service is not configured correctly on the server. Please contact support.');
    }
    
    const fromAddress = process.env.EMAIL_FROM || `"eArena" <${process.env.SMTP_USERNAME}>`;
    const sanitizedHtmlBody = `<p>${escapeHtml(body).replace(/\n/g, '<br>')}</p>`;

    const mailOptions = {
        from: fromAddress,
        to: to,
        subject: subject,
        text: body,
        html: sanitizedHtmlBody,
    };

    try {
        await mailer.sendMail(mailOptions);
        if (process.env.NODE_ENV !== 'production') {
            console.log(`[Email] Email sent successfully to ${to}`);
        }
    } catch (error: any) {
        console.error("[Email] Nodemailer error:", error);
        console.error("[Email] Details:", {
            name: error?.name,
            code: error?.code,
            command: error?.command,
            response: error?.response,
            responseCode: error?.responseCode,
            message: error?.message,
        });
        
        // Invalidate the transporter only for specific authentication errors.
        if (error.code === 'EAUTH' || error.code === 'EENVELOPE') {
            transporter = null;
        }
        
        throw error; // Re-throw original error for full stack trace in dev console
    }
}
