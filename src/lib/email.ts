import { APP_NAME } from '../config';
import { Resend } from 'resend'

const resend = new Resend(process.env.RESEND_API_KEY);

export const LANG = {
    EN: {
        // Welcome Email
        welcomeSubject: `Welcome to ${APP_NAME}!`,
        welcomeEmail: `
            <p class="card-text">Dear 0%,</p>
            <p class="card-text">Welcome to the family! We are thrilled to have you and your child join ${APP_NAME}.</p>
            <p class="card-text">Your account is now active. You can log in to track daily updates, activities, and communication.</p>
        `,

        // Email Verification
        emailVerificationSubject: "Verify Your Account",
        emailVerificationEmailOtp: `<p>Hello 0%,</p>
            <p>Your verification code is:</p>
            <div style="background: #f5f5f5; padding: 15px; text-align: center; margin: 20px 0; border-radius: 5px;">
                <p style="font-size: 32px; font-weight: bold; margin: 0; letter-spacing: 3px;">1%</p>
            </div>
            
            <p><strong>Valid for 10 minutes</strong></p>            
            <p style="color: #666; font-size: 13px;">
                Do not share this code with anyone. ${APP_NAME} will never ask for your OTP.
            </p>
        `,
        // emailVerificationEmail: `
        //     <p style="font-size: 18px;">Hello 0%,</p>
        //     <p style="margin-bottom: 25px;">Please click the button below to verify your email address and complete your registration at ${APP_NAME}.</p>

        //     <div style="text-align: center; margin: 30px 0;">
        //         <a href="1%" style="background-color: #138e00f7; color: #fff; padding: 12px 25px; text-decoration: none; border-radius: 20px; font-weight: bold; font-size: 14px;">Verify Email Address</a>
        //     </div>

        //     <p style="font-size: 16px; color: #666;">If you didn't create an account, you can safely ignore this email.</p>
        // `,
        emailVerificationEmailLink: `
            <p>Hello 0%,</p>
            <p>Please click the link below to verify your email address and complete your registration at ${APP_NAME}:</p>
            <p><a href="1%" style="color: #555; text-decoration: none; text-transform: capitalize; background-color: #e8eaed; padding: 8px 20px; border-radius: 0; display: inline-block; font-family: Arial, sans-serif;">verify</a></p>
            <p>If you didn't create an account, you can safely ignore this email.</p>
        `,

        // Forgot/Recover Password
        forgotPasswordSubject: "Recover Your Password",
        forgotPasswordEmail: `
            <p>Hi <strong>0%</strong>,</p>
            <p>We received a request to recover your password for ${APP_NAME}.</p>
            <p>Click the button below to reset your password. This link will expire in 1 hour.</p>
            <div style="margin: 30px 0;">
                <a href="1%" style="color: #555; text-decoration: none; text-transform: capitalize; background-color: #e8eaed; padding: 8px 20px; border-radius: 0; display: inline-block; font-family: Arial, sans-serif;">
                    Reset Password
                </a>
            </div>
            <p style="color: #666; font-size: 12px;">If you did not request this, you can safely ignore this email.</p>
        `,


        contactNotificationSubject: "New Contact Message Received",
        contactNotificationEmail: `
            <p>Hello Admin,</p>
            <p>You have received a new inquiry from the contact form.</p>
            
            <div style="margin: 20px 0;">
                <p style="margin: 5px 0;"><strong>Name:</strong> 0%</p>
                <p style="margin: 5px 0;"><strong>Email:</strong> 1%</p>
            </div>
            
            <div style="margin: 20px 0;">
                <p><strong>Message:</strong></p>
                <p style="color: #555; line-height: 1.6;">2%</p>
            </div>
            
            <p style="color: #666; font-size: 12px; border-top: 1px solid #eee; padding-top: 10px;">
                This is an automated notification from your website's contact form.
            </p>
        `,
    },
}.EN;


export const composeEmail = (
    template: string,
    ...args: (string | number)[]
) => {

    let content = template;
    args.forEach((val, index) => {
        content = content.replace(new RegExp(`${index}%`, 'g'), String(val));
    });
    
        return `
        <div style="font-family: Arial, sans-serif; color: #333;">
                ${content}
                <p>Best regards,</p>
                <p>${APP_NAME}</p>
            </div>
        `
}
export const sendEmail = async ({
    to,
    subject,
    html,
}: {
    to: string;
    subject: string;
    html: string;
}) => {
    try {
        const response = await resend.emails.send({
            from: process.env.MAIL_FROM!,
            to,
            subject,
            html,
        });

        if (response.error) {
            console.error("Email Error:", response.error);
            throw new Error(response.error.message);
        }

        return response;
    } catch (error) {
        console.error("Email Sending Failed:", error);
        throw error;
    }
};

// import nodemailer from 'nodemailer';
// const transporter = nodemailer.createTransport({
//     host: process.env.MAIL_HOST,
//     port: parseInt(process.env.MAIL_PORT || '465'),
//     secure: process.env.MAIL_SECURE === 'true',
//     family: 4,
//     auth: {
//         user: process.env.MAIL_USER,
//         pass: process.env.MAIL_PASS,
//     },
// } as any);

// export const sendEmail = async ({
//     to,
//     subject,
//     html,
// }: {
//     to: string;
//     subject: string;
//     html: string;
// }) => {
//     try {
//         const response = await transporter.sendMail({
//             from: `"${APP_NAME}" <${process.env.MAIL_USER}>`,
//             to,
//             subject,
//             html,
//         });

//         console.log("Email sent successfully:", response.messageId);
//         return response;
//     } catch (error) {
//         console.error("Email Sending Failed:", error);
//         throw error;
//     }
// };