const { Resend } = require('resend');

function getResend() {
    return new Resend(process.env.RESEND_API_KEY);
}

const FROM = 'Remnant Exchange <info@remnantexchange.org>';

async function sendVerificationEmail(email, name, token) {
    const verifyUrl = `${process.env.BASE_URL}/api/auth/verify-email?token=${token}`;
    const resend = getResend();

    await resend.emails.send({
        from: FROM,
        to: email,
        subject: 'Verify your Remnant Exchange account',
        html: `
            <h2>Welcome to Remnant Exchange, ${name}!</h2>
            <p>Thank you for registering. Please verify your email address to continue.</p>
            <p><a href="${verifyUrl}" style="background:#2563eb;color:white;padding:12px 24px;text-decoration:none;border-radius:6px;display:inline-block;">Verify Email</a></p>
            <p>This link expires in 24 hours.</p>
            <p>If you did not register, please ignore this email.</p>
        `,
    });
}

async function sendAdminNotification(user) {
    const resend = getResend();
    const adminUrl = `${process.env.BASE_URL}/admin.html`;

    await resend.emails.send({
        from: FROM,
        to: process.env.ADMIN_EMAIL,
        subject: 'New fabricator registration pending approval',
        html: `
            <h2>New Fabricator Registration</h2>
            <p>A new fabricator has verified their email and is awaiting approval:</p>
            <ul>
                <li><strong>Name:</strong> ${user.name}</li>
                <li><strong>Business:</strong> ${user.business_name}</li>
                <li><strong>Email:</strong> ${user.email}</li>
                <li><strong>Phone:</strong> ${user.phone || 'Not provided'}</li>
            </ul>
            <p><a href="${adminUrl}" style="background:#2563eb;color:white;padding:12px 24px;text-decoration:none;border-radius:6px;display:inline-block;">Review in Admin Panel</a></p>
        `,
    });
}

async function sendApprovalEmail(email, name) {
    const resend = getResend();

    await resend.emails.send({
        from: FROM,
        to: email,
        subject: 'Your Remnant Exchange account has been approved!',
        html: `
            <h2>Congratulations, ${name}!</h2>
            <p>Your fabricator account on Remnant Exchange has been approved.</p>
            <p>You can now log in and start posting your stone remnants.</p>
            <p><a href="${process.env.BASE_URL}/login.html" style="background:#2563eb;color:white;padding:12px 24px;text-decoration:none;border-radius:6px;display:inline-block;">Log In Now</a></p>
        `,
    });
}

async function sendRejectionEmail(email, name, reason) {
    const resend = getResend();

    await resend.emails.send({
        from: FROM,
        to: email,
        subject: 'Update on your Remnant Exchange application',
        html: `
            <h2>Hello ${name},</h2>
            <p>We were unable to approve your fabricator account at this time.</p>
            ${reason ? `<p><strong>Reason:</strong> ${reason}</p>` : ''}
            <p>If you believe this is an error, please contact us at ${process.env.ADMIN_EMAIL}.</p>
        `,
    });
}

async function sendContactMessage(sellerEmail, sellerName, listingTitle, senderName, senderEmail, message) {
    const resend = getResend();

    await resend.emails.send({
        from: FROM,
        to: sellerEmail,
        replyTo: senderEmail,
        subject: `Message about your listing: ${listingTitle}`,
        html: `
            <h2>Someone is interested in your listing</h2>
            <p><strong>Listing:</strong> ${listingTitle}</p>
            <hr>
            <p><strong>From:</strong> ${senderName}</p>
            <p><strong>Email:</strong> ${senderEmail}</p>
            <p><strong>Message:</strong></p>
            <blockquote style="border-left:4px solid #2563eb;margin:0;padding:12px 16px;background:#f0f7ff;">${message.replace(/\n/g, '<br>')}</blockquote>
            <hr>
            <p style="color:#64748b;font-size:0.85rem;">Reply directly to this email to respond to ${senderName}. This message was sent via Remnant Exchange.</p>
        `,
    });
}

module.exports = { sendVerificationEmail, sendAdminNotification, sendApprovalEmail, sendRejectionEmail, sendContactMessage };
