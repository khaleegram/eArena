import nodemailer from 'nodemailer';

const { SMTP_HOST, SMTP_PORT, SMTP_SECURE, SMTP_USERNAME, SMTP_PASSWORD } = process.env;

const hasSmtpConfig = SMTP_HOST && SMTP_PORT && SMTP_USERNAME && SMTP_PASSWORD;

let transporter: nodemailer.Transporter;

if (hasSmtpConfig) {
    const smtpConfig = {
        host: SMTP_HOST,
        port: Number(SMTP_PORT),
        secure: SMTP_SECURE === 'true', // true for 465, false for other ports
        auth: {
            user: SMTP_USERNAME,
            pass: SMTP_PASSWORD,
        },
    };
    transporter = nodemailer.createTransport(smtpConfig);
} else {
    console.warn(
        '***************************************************************************************************\n' +
        '* WARNING: SMTP email settings are not configured in your .env file.                          *\n' +
        '* Email functionality (password resets, verifications) will be disabled until they are set.   *\n' +
        '***************************************************************************************************'
    );
}

interface SendEmailParams {
    to: string;
    subject: string;
    body: string;
}

export async function sendEmail({ to, subject, body }: SendEmailParams) {
    if (!hasSmtpConfig) {
        console.error(`Email not sent to ${to}: SMTP credentials are not configured in the .env file.`);
        // To avoid breaking the user flow, we don't throw an error to the client,
        // but the links will not be sent. The console warning provides the necessary info.
        return;
    }

    const mailOptions = {
        from: `"eArena" <${SMTP_USERNAME}>`,
        to: to,
        subject: subject,
        text: body,
        html: `<p>${body.replace(/\n/g, '<br>')}</p>`,
    };

    try {
        await transporter.sendMail(mailOptions);
        console.log(`Email sent successfully to ${to}`);
    } catch (error) {
        console.error('Failed to send email. Please check your SMTP credentials and server settings in the .env file. Error:', error);
        throw new Error('Could not send email due to a server configuration issue. Please contact support or check server logs.');
    }
}
