import nodemailer from 'nodemailer';

const smtpConfig = {
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT),
    secure: process.env.SMTP_SECURE === 'true', // true for 465, false for other ports
    auth: {
        user: process.env.SMTP_USERNAME,
        pass: process.env.SMTP_PASSWORD,
    },
};

const transporter = nodemailer.createTransport(smtpConfig);

interface SendEmailParams {
    to: string;
    subject: string;
    body: string;
}

export async function sendEmail({ to, subject, body }: SendEmailParams) {
    const mailOptions = {
        from: `"eArena" <${process.env.SMTP_USERNAME}>`,
        to: to,
        subject: subject,
        text: body,
        html: `<p>${body.replace(/\n/g, '<br>')}</p>`, // Simple conversion of newlines to <br> for HTML emails
    };

    try {
        await transporter.sendMail(mailOptions);
    } catch (error) {
        console.error('Failed to send email:', error);
        // In a real production app, you might want to throw the error
        // or have a more robust error handling/reporting mechanism.
        throw new Error('Could not send email. Please try again later.');
    }
}
