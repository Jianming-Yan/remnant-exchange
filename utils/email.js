const { Resend } = require('resend');

function getResend() {
    return new Resend(process.env.RESEND_API_KEY);
}

const FROM = 'Remnant Exchange <info@remnantexchange.org>';

async function sendVerificationEmail(email, name, token) {
    const verifyUrl = `${process.env.BASE_URL}/api/auth/verify-email?token=${token}`;
    const firstName = name.split(' ')[0];
    const resend = getResend();

    await resend.emails.send({
        from: FROM,
        replyTo: 'info@remnantexchange.org',
        to: email,
        subject: `Welcome to Remnant Exchange, ${firstName}!`,
        html: `
            <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#1a1a1a;">
                <h2 style="color:#2563eb;">Welcome, ${firstName}!</h2>

                <p>Thank you for registering with Remnant Exchange. Please verify your email address to activate your account.</p>

                <p><a href="${verifyUrl}" style="background:#2563eb;color:white;padding:12px 28px;text-decoration:none;border-radius:6px;display:inline-block;font-weight:bold;">Verify My Email</a></p>

                <p style="color:#64748b;font-size:0.85rem;">This link expires in 24 hours.</p>

                <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0;">

                <p>Remnant Exchange is a free online platform for stone fabricators to buy, sell, and manage leftover stone remnants. Here is what it does for you:</p>

                <ol style="line-height:2.2;margin:16px 0 16px 20px;">
                    <li><strong>Post your remnants</strong> — list your leftover slabs so other shops and buyers can find and purchase them</li>
                    <li><strong>Search posted remnants</strong> — find the exact size and material you need from other fabricators, instead of buying a whole slab</li>
                    <li><strong>Track your inventory privately</strong> — manage your internal remnant inventory for your own records, invisible to others</li>
                </ol>

                <p>It's completely free — no software fees, no service charges.</p>

                <p>— Jianming Yan<br>
                <span style="color:#64748b;font-size:0.9rem;">Founder, Remnant Exchange</span></p>

                <p style="color:#94a3b8;font-size:0.8rem;margin-top:24px;">If you did not register, please ignore this email.</p>
            </div>
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

async function sendTempPasswordEmail(email, name, tempPassword, magicToken) {
    const resend = getResend();
    const firstName = name.split(' ')[0];
    const loginUrl = magicToken
        ? `${process.env.BASE_URL}/login.html?magic=${magicToken}`
        : `${process.env.BASE_URL}/login.html`;

    await resend.emails.send({
        from: FROM,
        replyTo: 'info@remnantexchange.org',
        to: email,
        subject: `Welcome to Remnant Exchange, ${firstName}!`,
        html: `
            <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#1a1a1a;">
                <h2 style="color:#2563eb;">Welcome, ${firstName}!</h2>

                <p>My name is Jianming, and I'm excited to welcome you to <strong>Remnant Exchange</strong>.</p>

                <p>Remnant Exchange is a free online platform for stone fabricators to buy, sell, and manage leftover stone remnants. Here is what it does for you:</p>

                <ol style="line-height:2.2;margin:16px 0 16px 20px;">
                    <li><strong>Post your remnants</strong> — list your leftover slabs so other shops and buyers can find and purchase them</li>
                    <li><strong>Search posted remnants</strong> — find the exact size and material you need from other fabricators, instead of buying a whole slab</li>
                    <li><strong>Track your inventory privately</strong> — manage your internal remnant inventory for your own records, invisible to others</li>
                </ol>

                <p>It's completely free — no software fees, no service charges.</p>

                <p>Click below to log in and set your password:</p>

                <p><a href="${loginUrl}" style="background:#2563eb;color:white;padding:12px 28px;text-decoration:none;border-radius:6px;display:inline-block;font-weight:bold;">Log In to Your Account</a></p>

                <p style="color:#64748b;font-size:0.9rem;">Or log in manually:<br>
                <strong>Email:</strong> ${email}<br>
                <strong>Temporary Password:</strong> <code style="background:#f1f5f9;padding:4px 8px;border-radius:4px;">${tempPassword}</code></p>

                <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0;">

                <p><strong>Need help getting started?</strong> Simply reply to this email with your remnant details — material type, stone name, dimensions, thickness, and a photo — and we'll post the listings for you.</p>

                <p>Looking forward to having you on the platform!</p>

                <p>— Jianming Yan<br>
                <span style="color:#64748b;font-size:0.9rem;">Founder, Remnant Exchange</span></p>

                <p style="color:#94a3b8;font-size:0.8rem;margin-top:24px;">If you'd rather not be listed, simply ignore this email and no action is needed.</p>
            </div>
        `,
    });
}

async function sendIntroductionEmail(email, businessName) {
    const resend = getResend();

    await resend.emails.send({
        from: FROM,
        replyTo: 'jianming@remnantexchange.org',
        to: email,
        subject: 'Hello from Jianming — Remnant Exchange',
        html: `
            <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#1a1a1a;">
                <p>Hi,</p>

                <p>I tried to reach you by phone but missed you. My name is Jianming Yan — I am a stone fabricator based in Canton, MA, and I recently built <strong><a href="https://remnantexchange.org" style="color:#2563eb;">RemnantExchange.org</a></strong>.</p>

                <p>It is a free platform for stone fabricators to buy, sell, and track stone remnants. Here is what it does:</p>

                <ol style="line-height:2.2;margin:16px 0 16px 20px;">
                    <li><strong>List your remnants</strong> — post leftover slabs so other fabricators can find and buy them</li>
                    <li><strong>Search for remnants</strong> — find the exact size and material you need from other shops instead of buying a full slab</li>
                    <li><strong>Track your inventory</strong> — manage your internal remnant inventory privately for your own records</li>
                </ol>

                <p>It is completely free — no software fees, no commissions.</p>

                <p>I would love to set up a free account for ${businessName} and walk you through it. Feel free to call or text me anytime at <strong>(617) 606-5840</strong>, or simply reply to this email.</p>

                <p>— Jianming Yan<br>
                <span style="color:#64748b;font-size:0.9rem;">Founder, Remnant Exchange<br>
                RemnantExchange.org | (617) 606-5840</span></p>
            </div>
        `,
    });
}

async function sendResetPasswordEmail(email, name, tempPassword) {
    const resend = getResend();

    await resend.emails.send({
        from: FROM,
        to: email,
        subject: 'Your Remnant Exchange password has been reset',
        html: `
            <h2>Password Reset — Remnant Exchange</h2>
            <p>Hi ${name}, here are your login credentials:</p>
            <p><strong>Login Email:</strong> ${email}<br>
            <strong>Temporary Password:</strong> <code style="background:#f1f5f9;padding:4px 8px;border-radius:4px;font-size:1.1em;">${tempPassword}</code></p>
            <p>You will be asked to set a new password after logging in.</p>
            <p><a href="${process.env.BASE_URL}/login.html" style="background:#2563eb;color:white;padding:12px 24px;text-decoration:none;border-radius:6px;display:inline-block;">Log In Now</a></p>
            <p style="color:#94a3b8;font-size:0.85rem;">If you did not request this, please contact us immediately.</p>
        `,
    });
}

module.exports = { sendVerificationEmail, sendAdminNotification, sendApprovalEmail, sendRejectionEmail, sendContactMessage, sendTempPasswordEmail, sendResetPasswordEmail, sendIntroductionEmail };
