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
        subject: `Welcome to Remnant Exchange — Your Login & Quick Start Guide`,
        html: `
            <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#1a1a1a;line-height:1.6;">

                <h2 style="color:#2563eb;margin-bottom:4px;">Welcome to Remnant Exchange, ${firstName}!</h2>
                <p style="color:#64748b;margin-top:0;">Your free account is ready. Here is everything you need to get started.</p>

                <!-- LOGIN BOX -->
                <div style="background:#f0f7ff;border:2px solid #2563eb;border-radius:12px;padding:24px;margin:24px 0;">
                    <p style="margin:0 0 4px 0;font-weight:700;font-size:1rem;color:#1e3a8a;">Step 1 — Log In</p>
                    <p style="margin:0 0 16px 0;font-size:0.85rem;color:#64748b;">Click the button below — it will log you in automatically and prompt you to set your own password.</p>
                    <p style="margin:0 0 16px 0;">
                        <a href="${loginUrl}" style="background:#2563eb;color:white;padding:12px 28px;text-decoration:none;border-radius:6px;display:inline-block;font-weight:bold;font-size:1rem;">Log In to Your Account →</a>
                    </p>
                    <p style="margin:0 0 6px 0;font-size:0.85rem;color:#64748b;">Or log in manually at <a href="https://remnantexchange.org/login.html" style="color:#2563eb;">remnantexchange.org</a>:</p>
                    <p style="margin:0 0 4px 0;"><strong>Email:</strong> <span style="font-weight:700;">${email}</span></p>
                    <p style="margin:0;"><strong>Temporary Password:</strong> <span style="font-size:1.3rem;font-weight:700;letter-spacing:3px;color:#1e293b;">${tempPassword}</span></p>
                </div>

                <!-- HOW TO USE -->
                <h3 style="color:#1e293b;border-bottom:2px solid #e2e8f0;padding-bottom:8px;">How to Use Remnant Exchange</h3>

                <!-- POST LISTING -->
                <div style="margin:20px 0;">
                    <p style="margin:0 0 6px 0;font-size:1rem;font-weight:700;">📋 Post Your Remnants</p>
                    <p style="margin:0 0 8px 0;color:#475569;font-size:0.9rem;">List your leftover stone slabs so other shops and buyers can find them.</p>
                    <ol style="margin:0;padding-left:20px;color:#475569;font-size:0.9rem;line-height:2;">
                        <li>Log in and go to your <strong>Dashboard</strong></li>
                        <li>Click <strong>"Post a Remnant"</strong></li>
                        <li>Fill in: material type, stone name, dimensions (length × width × thickness), and your location</li>
                        <li>Upload photos — clear photos get more inquiries</li>
                        <li>Click <strong>Post</strong> — your listing goes live immediately</li>
                    </ol>
                    <p style="margin:8px 0 0 0;font-size:0.85rem;color:#64748b;">💡 <em>Tip: You can also mark a listing as <strong>Private</strong> to track it in your own inventory without it showing publicly.</em></p>
                </div>

                <hr style="border:none;border-top:1px solid #f1f5f9;margin:16px 0;">

                <!-- BROWSE -->
                <div style="margin:20px 0;">
                    <p style="margin:0 0 6px 0;font-size:1rem;font-weight:700;">🔍 Find Remnants From Other Shops</p>
                    <p style="margin:0 0 8px 0;color:#475569;font-size:0.9rem;">Need a specific stone for a smaller job? Browse remnants near you instead of buying a full slab.</p>
                    <ol style="margin:0;padding-left:20px;color:#475569;font-size:0.9rem;line-height:2;">
                        <li>Go to <a href="https://remnantexchange.org" style="color:#2563eb;">remnantexchange.org</a></li>
                        <li>Filter by material, state, and metro area</li>
                        <li>Click on a listing to see photos and details</li>
                        <li>Contact the seller directly through the listing</li>
                    </ol>
                </div>

                <hr style="border:none;border-top:1px solid #f1f5f9;margin:16px 0;">

                <!-- BUYER REQUEST -->
                <div style="background:#fffbeb;border:1.5px solid #fcd34d;border-radius:10px;padding:20px;margin:20px 0;">
                    <p style="margin:0 0 6px 0;font-size:1rem;font-weight:700;color:#92400e;">🎯 Can't Find What You Need?</p>
                    <p style="margin:0 0 10px 0;color:#78350f;font-size:0.9rem;">Submit a remnant request and we will search our fabricator network for you — for free.</p>
                    <ol style="margin:0 0 12px 0;padding-left:20px;color:#78350f;font-size:0.9rem;line-height:2;">
                        <li>Visit <a href="https://remnantexchange.org/request.html" style="color:#d97706;font-weight:600;">remnantexchange.org/request.html</a></li>
                        <li>Describe what you need — material, size, and your location</li>
                        <li>Submit the form — we will reach out to fabricators in your area</li>
                        <li>We will contact you within 1 business day</li>
                    </ol>
                    <p style="margin:0;">
                        <a href="https://remnantexchange.org/request.html" style="background:#d97706;color:white;padding:10px 20px;text-decoration:none;border-radius:6px;display:inline-block;font-weight:bold;font-size:0.9rem;">Submit a Remnant Request →</a>
                    </p>
                </div>

                <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0;">

                <!-- HELP -->
                <p style="margin:0 0 8px 0;font-weight:700;">Need Help Getting Started?</p>
                <p style="margin:0 0 8px 0;color:#475569;font-size:0.9rem;">If posting feels like too many steps, just email me your remnant details — material, stone name, dimensions, thickness, and a photo — and <strong>I will post the listings for you</strong>.</p>
                <p style="margin:0;color:#475569;font-size:0.9rem;">You can also call or text me directly at <strong>(617) 606-5840</strong> anytime.</p>

                <br>
                <p style="margin:0;">— Jianming Yan<br>
                <span style="color:#64748b;font-size:0.9rem;">Founder, Remnant Exchange<br>
                <a href="https://remnantexchange.org" style="color:#2563eb;">RemnantExchange.org</a> · (617) 606-5840</span></p>

                <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0;">
                <p style="color:#94a3b8;font-size:0.75rem;margin:0;">Remnant Exchange · 105 Chapman Street, Canton, MA 02021<br>
                If you'd rather not be listed, simply ignore this email and no action is needed.</p>
            </div>
        `,
    });
}

async function sendIntroductionEmail(email, businessName, unsubscribeToken) {
    const resend = getResend();
    const unsubscribeUrl = `${process.env.BASE_URL}/unsubscribe.html?token=${unsubscribeToken}`;

    await resend.emails.send({
        from: FROM,
        replyTo: 'jianming@remnantexchange.org',
        to: email,
        subject: 'Hello from Jianming — Remnant Exchange',
        html: `
            <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#1a1a1a;">
                <p>Hi,</p>

                <p>I tried to reach you by phone but missed you. My name is Jianming Yan — I am the founder of <strong><a href="https://remnantexchange.org" style="color:#2563eb;">RemnantExchange.org</a></strong>, a free platform built for stone fabricators.</p>

                <p>Here is what it does:</p>

                <ol style="line-height:2.2;margin:16px 0 16px 20px;">
                    <li><strong>List your remnants</strong> — post leftover slabs so other fabricators can find and buy them</li>
                    <li><strong>Search for remnants</strong> — find the exact size and material you need from other shops instead of buying a full slab</li>
                    <li><strong>Track your inventory</strong> — manage your internal remnant inventory privately for your own records</li>
                </ol>

                <p>It is completely free — no software fees, no commissions.</p>

                <p>I would love to set up a free account for <strong>${businessName}</strong> and walk you through it. Feel free to call or text me anytime at <strong>(617) 606-5840</strong>, or simply reply to this email.</p>

                <p>— Jianming Yan<br>
                <span style="color:#64748b;font-size:0.9rem;">Founder, Remnant Exchange<br>
                RemnantExchange.org | (617) 606-5840</span></p>

                <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0;">
                <p style="color:#94a3b8;font-size:0.75rem;margin:0;">Remnant Exchange · 105 Chapman Street, Canton, MA 02021<br>
                You received this because we thought you might benefit from our platform.<br>
                <a href="${unsubscribeUrl}" style="color:#94a3b8;">Unsubscribe</a></p>
            </div>
        `,
    });
}

async function sendUnsubscribeConfirmationEmail(email, businessName) {
    const resend = getResend();

    await resend.emails.send({
        from: FROM,
        replyTo: 'jianming@remnantexchange.org',
        to: email,
        subject: 'You have been unsubscribed — Remnant Exchange',
        html: `
            <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#1a1a1a;">
                <p>Hi,</p>

                <p>You have been successfully unsubscribed from Remnant Exchange. Your account for <strong>${businessName}</strong> has been disabled and you will not receive any further emails from us.</p>

                <p>If you change your mind in the future, you can always create a new account for free at <a href="https://remnantexchange.org/register.html" style="color:#2563eb;">remnantexchange.org</a>.</p>

                <p>Thank you for your time, and we wish you all the best.</p>

                <p>— Jianming Yan<br>
                <span style="color:#64748b;font-size:0.9rem;">Founder, Remnant Exchange<br>
                RemnantExchange.org | (617) 606-5840</span></p>

                <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0;">
                <p style="color:#94a3b8;font-size:0.75rem;">Remnant Exchange · 105 Chapman Street, Canton, MA 02021</p>
            </div>
        `,
    });
}

async function sendReactivationWelcomeEmail(email, name) {
    const resend = getResend();
    const firstName = name.split(' ')[0];

    await resend.emails.send({
        from: FROM,
        replyTo: 'jianming@remnantexchange.org',
        to: email,
        subject: `Welcome back to Remnant Exchange, ${firstName}!`,
        html: `
            <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#1a1a1a;">
                <h2 style="color:#2563eb;">Welcome back, ${firstName}!</h2>

                <p>Your Remnant Exchange account has been reactivated. You can now log in and start listing your stone remnants.</p>

                <p><a href="${process.env.BASE_URL}/login.html" style="background:#2563eb;color:white;padding:12px 28px;text-decoration:none;border-radius:6px;display:inline-block;font-weight:bold;">Log In Now</a></p>

                <p>Feel free to call or text me anytime at <strong>(617) 606-5840</strong> if you need help getting started.</p>

                <p>— Jianming Yan<br>
                <span style="color:#64748b;font-size:0.9rem;">Founder, Remnant Exchange<br>
                RemnantExchange.org | (617) 606-5840</span></p>
            </div>
        `,
    });
}

async function sendFabricatorBroadcastEmail(fabricatorEmail, fabricatorName, request, stateName, metroName) {
    const resend = getResend();
    const firstName = fabricatorName.split(' ')[0];

    await resend.emails.send({
        from: FROM,
        replyTo: 'jianming@remnantexchange.org',
        to: fabricatorEmail,
        subject: `Customer Looking for ${request.material} Remnant in ${metroName}`,
        html: `
            <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#1a1a1a;">
                <p>Hi ${firstName},</p>

                <p>We have a customer in the <strong>${metroName}, ${stateName}</strong> area looking for a stone remnant. I thought you might be able to help.</p>

                <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:20px;margin:20px 0;">
                    <p style="margin:0 0 8px 0;font-size:1.1rem;font-weight:700;">What They Need:</p>
                    <p style="margin:0 0 6px 0;"><strong>Material:</strong> ${request.material}</p>
                    ${request.color ? `<p style="margin:0 0 6px 0;"><strong>Color / Stone:</strong> ${request.color}</p>` : ''}
                    <p style="margin:0 0 6px 0;"><strong>Size:</strong> <span style="font-size:1.2rem;font-weight:700;">${request.length}" x ${request.width}"</span></p>
                    ${request.notes ? `<p style="margin:0;"><strong>Notes:</strong> ${request.notes}</p>` : ''}
                </div>

                <p>If you have something that matches or comes close, please reply to this email or call me at <strong>(617) 606-5840</strong> and I will connect you with the customer directly.</p>

                <p>If you are not yet listed on <a href="https://remnantexchange.org" style="color:#2563eb;">RemnantExchange.org</a>, this is a great time to join — it is completely free and puts your remnants in front of buyers like this one.</p>

                <p>— Jianming Yan<br>
                <span style="color:#64748b;font-size:0.9rem;">Founder, Remnant Exchange<br>
                RemnantExchange.org | (617) 606-5840</span></p>

                <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0;">
                <p style="color:#94a3b8;font-size:0.75rem;margin:0;">Remnant Exchange · 105 Chapman Street, Canton, MA 02021</p>
            </div>
        `,
    });
}

async function sendContractorBroadcastEmail(email, businessName, unsubscribeToken) {
    const resend = getResend();
    const unsubscribeUrl = `${process.env.BASE_URL}/api/contractor/unsubscribe?token=${unsubscribeToken}`;

    await resend.emails.send({
        from: FROM,
        replyTo: 'jianming@remnantexchange.org',
        to: email,
        subject: 'A free way to source stone remnants for your projects',
        html: `
            <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#1a1a1a;line-height:1.6;">
                <p>Hi,</p>

                <p>My name is Jianming Yan — I'm a stone fabricator and founder of <strong><a href="https://remnantexchange.org" style="color:#2563eb;">RemnantExchange.org</a></strong>, a free marketplace where fabricators list their leftover stone remnants.</p>

                <p>If you work on kitchen or bathroom projects, you can browse hundreds of discounted granite, marble, quartz, and quartzite remnants near you — full slabs at a fraction of the cost.</p>

                <div style="background:#f0f7ff;border-left:4px solid #2563eb;padding:16px 20px;margin:24px 0;border-radius:0 8px 8px 0;">
                    <p style="margin:0 0 10px 0;font-weight:700;color:#1e3a8a;">Why contractors use Remnant Exchange:</p>
                    <p style="margin:0 0 6px 0;">✓ <strong>Save 40–70%</strong> vs. buying full slabs</p>
                    <p style="margin:0 0 6px 0;">✓ <strong>Filter by material, size, and location</strong> — find exactly what you need</p>
                    <p style="margin:0 0 6px 0;">✓ <strong>Contact fabricators directly</strong> — no middleman</p>
                    <p style="margin:0;">✓ <strong>Free to browse</strong> — no account needed</p>
                </div>

                <p>
                    <a href="https://remnantexchange.org" style="background:#2563eb;color:white;padding:12px 28px;text-decoration:none;border-radius:6px;display:inline-block;font-weight:bold;">Browse Remnants Near You →</a>
                </p>

                <p>If you ever have a specific material or size in mind and can't find it, you can also <a href="https://remnantexchange.org/request.html" style="color:#2563eb;">submit a request</a> and we'll reach out to fabricators in your area on your behalf — for free.</p>

                <p>Feel free to reply or call me anytime at <strong>(617) 606-5840</strong>.</p>

                <p>— Jianming Yan<br>
                <span style="color:#64748b;font-size:0.9rem;">Founder, Remnant Exchange<br>
                RemnantExchange.org · (617) 606-5840</span></p>

                <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0;">
                <p style="color:#94a3b8;font-size:0.75rem;margin:0;">Remnant Exchange · 105 Chapman Street, Canton, MA 02021<br>
                You received this because you are a contractor in our service area.<br>
                <a href="${unsubscribeUrl}" style="color:#94a3b8;">Unsubscribe</a></p>
            </div>
        `,
    });
}

async function sendFabLeadIntroEmail(email, businessName, unsubToken, opts = {}) {
    const resend = getResend();
    const baseUrl = opts.baseUrl || process.env.BASE_URL;
    const from = opts.from || 'Ming Yan <jianming@remnantexchange.org>';
    const replyTo = opts.replyTo || 'jianming@remnantexchange.org';
    const brand = opts.brand || 'Remnant Exchange';
    const activateUrl = `${baseUrl}/api/fab-leads/activate?token=${unsubToken}`;
    const unsubUrl = `${baseUrl}/api/fab-leads/unsubscribe?token=${unsubToken}`;

    const text = `Hi,

I'm Ming — I used to run a stone fabrication shop here in Massachusetts, so I know firsthand what a pain it is to deal with leftover remnants.

That's why I built ${brand}: a free platform where fabricators can list their leftover slabs so buyers nearby can find them, find remnants from other shops instead of buying a whole new slab, and keep track of their own inventory.

It's free and simple — just one click to enroll. No personal information, no credit card required:
${activateUrl}

If you have any questions, please reply or call me at (617) 606-5840 — happy to help.

Ming Yan
${brand} · (617) 606-5840

105 Chapman Street, Canton, MA 02021. Not interested? Unsubscribe: ${unsubUrl}`;

    await resend.emails.send({
        from,
        replyTo,
        to: email,
        subject: 'do you have remnants?',
        text,
        html: `
            <div style="font-family:Arial,sans-serif;font-size:15px;color:#1a1a1a;line-height:1.6;max-width:560px;">
                <p>Hi,</p>
                <p>I'm Ming — I used to run a stone fabrication shop here in Massachusetts, so I know firsthand what a pain it is to deal with leftover remnants.</p>
                <p>That's why I built ${brand}: a free platform where fabricators can list their leftover slabs so buyers nearby can find them, find remnants from other shops instead of buying a whole new slab, and keep track of their own inventory.</p>
                <p>It's free and simple — just one click to enroll. No personal information, no credit card required: <a href="${activateUrl}" style="color:#2563eb;">create my free account</a>.</p>
                <p>If you have any questions, please reply or call me at (617) 606-5840 — happy to help.</p>
                <p>Ming Yan<br>${brand} · (617) 606-5840</p>
                <p style="color:#94a3b8;font-size:12px;margin-top:20px;">105 Chapman Street, Canton, MA 02021. Not interested? <a href="${unsubUrl}" style="color:#94a3b8;">Unsubscribe</a>.</p>
            </div>
        `,
    });
}

async function sendFabLeadFollowUp1Email(email, businessName, unsubToken, opts = {}) {
    const resend = getResend();
    const baseUrl = opts.baseUrl || process.env.BASE_URL;
    const from = opts.from || 'Ming Yan <jianming@remnantexchange.org>';
    const replyTo = opts.replyTo || 'jianming@remnantexchange.org';
    const brand = opts.brand || 'Remnant Exchange';
    const activateUrl = `${baseUrl}/api/fab-leads/activate?token=${unsubToken}`;
    const unsubUrl = `${baseUrl}/api/fab-leads/unsubscribe?token=${unsubToken}`;

    const text = `Hi,

I reached out a few days ago — wanted to follow up with a real question: what do you currently do with your leftover slabs?

When I ran my own shop, mine just piled up in the yard until I sold them cheap or threw them out. That's the whole reason I built ${brand} — a free way to list your remnants so buyers nearby can find exactly what you have.

It's free and simple — just one click to enroll. No personal information, no credit card required:
${activateUrl}

Or just reply and tell me how you handle remnants now — I'm curious.

Ming Yan
${brand} · (617) 606-5840

105 Chapman Street, Canton, MA 02021. Not interested? Unsubscribe: ${unsubUrl}`;

    await resend.emails.send({
        from,
        replyTo,
        to: email,
        subject: 'what do you do with your leftover slabs?',
        text,
        html: `
            <div style="font-family:Arial,sans-serif;font-size:15px;color:#1a1a1a;line-height:1.6;max-width:560px;">
                <p>Hi,</p>
                <p>I reached out a few days ago — wanted to follow up with a real question: what do you currently do with your leftover slabs?</p>
                <p>When I ran my own shop, mine just piled up in the yard until I sold them cheap or threw them out. That's the whole reason I built ${brand} — a free way to list your remnants so buyers nearby can find exactly what you have.</p>
                <p>It's free and simple — just one click to enroll. No personal information, no credit card required: <a href="${activateUrl}" style="color:#2563eb;">create my free account</a>.</p>
                <p>Or just reply and tell me how you handle remnants now — I'm curious.</p>
                <p>Ming Yan<br>${brand} · (617) 606-5840</p>
                <p style="color:#94a3b8;font-size:12px;margin-top:20px;">105 Chapman Street, Canton, MA 02021. Not interested? <a href="${unsubUrl}" style="color:#94a3b8;">Unsubscribe</a>.</p>
            </div>
        `,
    });
}

async function sendFabLeadFollowUp2Email(email, businessName, unsubToken, opts = {}) {
    const resend = getResend();
    const baseUrl = opts.baseUrl || process.env.BASE_URL;
    const from = opts.from || 'Ming Yan <jianming@remnantexchange.org>';
    const replyTo = opts.replyTo || 'jianming@remnantexchange.org';
    const brand = opts.brand || 'Remnant Exchange';
    const activateUrl = `${baseUrl}/api/fab-leads/activate?token=${unsubToken}`;
    const unsubUrl = `${baseUrl}/api/fab-leads/unsubscribe?token=${unsubToken}`;

    const text = `Hi,

This is my last note — I know you're busy.

I built ${brand} because I ran a fab shop myself and got tired of remnants piling up with no good way to move them. It's free, and it stays free on the base plan.

If the timing isn't right, no problem — whenever it makes sense, it's one click to enroll. No personal information, no credit card required:
${activateUrl}

Either way, if you ever want to talk shop about remnants, call or text me at (617) 606-5840.

Ming Yan
${brand} · (617) 606-5840

105 Chapman Street, Canton, MA 02021. Not interested? Unsubscribe: ${unsubUrl}`;

    await resend.emails.send({
        from,
        replyTo,
        to: email,
        subject: 'last note',
        text,
        html: `
            <div style="font-family:Arial,sans-serif;font-size:15px;color:#1a1a1a;line-height:1.6;max-width:560px;">
                <p>Hi,</p>
                <p>This is my last note — I know you're busy.</p>
                <p>I built ${brand} because I ran a fab shop myself and got tired of remnants piling up with no good way to move them. It's free, and it stays free on the base plan.</p>
                <p>If the timing isn't right, no problem — whenever it makes sense, it's one click to <a href="${activateUrl}" style="color:#2563eb;">create my free account</a> — no personal information, no credit card required.</p>
                <p>Either way, if you ever want to talk shop about remnants, call or text me at (617) 606-5840.</p>
                <p>Ming Yan<br>${brand} · (617) 606-5840</p>
                <p style="color:#94a3b8;font-size:12px;margin-top:20px;">105 Chapman Street, Canton, MA 02021. Not interested? <a href="${unsubUrl}" style="color:#94a3b8;">Unsubscribe</a>.</p>
            </div>
        `,
    });
}

async function sendFirstListingCongratulationEmail(email, name, businessName) {
    const resend = getResend();
    const firstName = name.split(' ')[0];

    await resend.emails.send({
        from: FROM,
        replyTo: 'jianming@remnantexchange.org',
        to: email,
        subject: `Your first listing is live — Remnant Exchange`,
        html: `
            <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#1a1a1a;line-height:1.6;">
                <h2 style="color:#16a34a;">Your listing is live, ${firstName}!</h2>

                <p>Your first remnant is now visible to buyers on <a href="https://remnantexchange.org" style="color:#2563eb;">RemnantExchange.org</a>. Nice work getting it posted.</p>

                <p><strong>A few tips to get more inquiries:</strong></p>
                <ul style="line-height:2;margin:12px 0 12px 20px;">
                    <li>Upload clear photos — listings with photos get significantly more views</li>
                    <li>Post all your remnants — more listings means more chances buyers find you</li>
                    <li>Keep your listings updated — mark sold ones as sold so buyers stay engaged</li>
                </ul>

                <p>
                    <a href="${process.env.BASE_URL}/dashboard.html" style="background:#2563eb;color:white;padding:12px 28px;text-decoration:none;border-radius:6px;display:inline-block;font-weight:bold;">Post More Remnants →</a>
                </p>

                <p>If you need any help or want me to post listings for you, just reply to this email or call me at <strong>(617) 606-5840</strong>.</p>

                <p>— Jianming Yan<br>
                <span style="color:#64748b;font-size:0.9rem;">Founder, Remnant Exchange<br>
                RemnantExchange.org | (617) 606-5840</span></p>
            </div>
        `,
    });
}

async function sendActivationNudgeEmail(email, name, businessName) {
    const resend = getResend();
    const firstName = name.split(' ')[0];

    await resend.emails.send({
        from: FROM,
        replyTo: 'jianming@remnantexchange.org',
        to: email,
        subject: 'Need help posting your first remnant?',
        html: `
            <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#1a1a1a;line-height:1.6;">
                <p>Hi ${firstName},</p>

                <p>You registered on Remnant Exchange a few days ago — thank you! I noticed you have not posted a listing yet, so I wanted to check in.</p>

                <p><strong>Posting your first remnant takes about 2 minutes:</strong></p>
                <ol style="line-height:2;margin:12px 0 12px 20px;">
                    <li>Log in at <a href="${process.env.BASE_URL}/login.html" style="color:#2563eb;">remnantexchange.org</a></li>
                    <li>Click <strong>"Post a Remnant"</strong> on your dashboard</li>
                    <li>Fill in material, dimensions, and your location</li>
                    <li>Add a photo and click <strong>Post</strong> — you are done</li>
                </ol>

                <p>If posting feels like too many steps, just reply to this email with your remnant details — material, stone name, dimensions, thickness, and a photo — and <strong>I will post it for you</strong>.</p>

                <p>
                    <a href="${process.env.BASE_URL}/dashboard.html" style="background:#2563eb;color:white;padding:12px 28px;text-decoration:none;border-radius:6px;display:inline-block;font-weight:bold;">Go to My Dashboard →</a>
                </p>

                <p>— Jianming Yan<br>
                <span style="color:#64748b;font-size:0.9rem;">Founder, Remnant Exchange<br>
                RemnantExchange.org | (617) 606-5840</span></p>

                <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0;">
                <p style="color:#94a3b8;font-size:0.75rem;">Remnant Exchange · 105 Chapman Street, Canton, MA 02021</p>
            </div>
        `,
    });
}

async function sendBuyerRequestEmail(req) {
    const resend = getResend();
    const photosHtml = req.photos && req.photos.length > 0
        ? `<div style="margin-top:16px;">
               <p style="font-weight:600;margin:0 0 8px 0;">Photos (${req.photos.length}):</p>
               <div>${req.photos.map(url => `<a href="${url}" target="_blank"><img src="${url}" style="width:160px;height:120px;object-fit:cover;border-radius:6px;border:1px solid #e2e8f0;margin:0 8px 8px 0;" /></a>`).join('')}</div>
           </div>`
        : '';

    await resend.emails.send({
        from: FROM,
        replyTo: req.email,
        to: process.env.ADMIN_EMAIL,
        subject: `New Remnant Request — ${req.material} ${req.length}"x${req.width}"`,
        html: `
            <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#1a1a1a;">
                <h2 style="color:#2563eb;">New Remnant Request</h2>
                <table style="width:100%;border-collapse:collapse;margin-bottom:20px;">
                    <tr><td style="padding:8px;background:#f8fafc;font-weight:600;width:140px;">Name</td><td style="padding:8px;border-bottom:1px solid #e2e8f0;">${req.name}</td></tr>
                    <tr><td style="padding:8px;background:#f8fafc;font-weight:600;">Email</td><td style="padding:8px;border-bottom:1px solid #e2e8f0;"><a href="mailto:${req.email}">${req.email}</a></td></tr>
                    <tr><td style="padding:8px;background:#f8fafc;font-weight:600;">Phone</td><td style="padding:8px;border-bottom:1px solid #e2e8f0;">${req.phone || '—'}</td></tr>
                    <tr><td style="padding:8px;background:#f8fafc;font-weight:600;">Material</td><td style="padding:8px;border-bottom:1px solid #e2e8f0;">${req.material}</td></tr>
                    <tr><td style="padding:8px;background:#f8fafc;font-weight:600;">Color / Stone</td><td style="padding:8px;border-bottom:1px solid #e2e8f0;">${req.color || '—'}</td></tr>
                    <tr><td style="padding:8px;background:#f8fafc;font-weight:600;">Size</td><td style="padding:8px;border-bottom:1px solid #e2e8f0;font-size:1.1rem;font-weight:700;">${req.length}" x ${req.width}"</td></tr>
                    <tr><td style="padding:8px;background:#f8fafc;font-weight:600;">Notes</td><td style="padding:8px;">${req.notes || '—'}</td></tr>
                </table>
                ${photosHtml}
                <p style="color:#64748b;font-size:0.85rem;margin-top:16px;">Reply directly to this email to contact ${req.name}.</p>
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

async function sendThankYouActivationEmail(email, name) {
    const resend = getResend();
    const firstName = name.split(' ')[0];

    await resend.emails.send({
        from: FROM,
        replyTo: 'jianming@remnantexchange.org',
        to: email,
        subject: 'Thank you for trusting Remnant Exchange',
        html: `
            <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#1a1a1a;line-height:1.6;">
                <p>Hi ${firstName},</p>

                <p>I'm Jianming — a stone fabricator just like you, and the founder of Remnant Exchange.</p>

                <p>I built this platform because I believe hardworking fabricators deserve a better way to manage their remnants — without paying software fees or commissions. Seeing 200+ fabricators register and trust this idea means everything to me.</p>

                <p>But here's the honest truth: our success starts with registration, and the hardest part is posting your first remnant.</p>

                <p>Every listing you post makes the platform more valuable — for you, and for every other fabricator on here. More postings mean more buyers find what they need, more fabricators sell what's sitting in their yard, and the whole network grows stronger.</p>

                <p style="font-weight:700;">It takes 2 minutes to post your first remnant:</p>
                <ol style="line-height:2;margin:12px 0 12px 20px;">
                    <li>Log in at <a href="https://remnantexchange.org" style="color:#2563eb;">remnantexchange.org</a></li>
                    <li>Click <strong>"Post a Remnant"</strong> on your dashboard</li>
                    <li>Fill in material, size, and a photo — done</li>
                </ol>

                <p>If it feels like too many steps, just reply to this email with your remnant details and I'll post it for you.</p>

                <p>
                    <a href="https://remnantexchange.org/dashboard.html" style="background:#2563eb;color:white;padding:12px 28px;text-decoration:none;border-radius:6px;display:inline-block;font-weight:bold;">Post My First Remnant →</a>
                </p>

                <p>Thank you for being part of this.</p>

                <p>— Jianming Yan<br>
                <span style="color:#64748b;font-size:0.9rem;">Founder, Remnant Exchange<br>
                RemnantExchange.org · (617) 606-5840</span></p>

                <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0;">
                <p style="color:#94a3b8;font-size:0.75rem;">Remnant Exchange · 105 Chapman Street, Canton, MA 02021</p>
            </div>
        `,
    });
}

async function sendUserReminderEmail(email, name, tempPassword, magicToken, unsubToken) {
    const resend = getResend();
    const firstName = (name || 'there').split(' ')[0];
    const loginUrl = `${process.env.BASE_URL}/login.html?magic=${magicToken}`;
    const dashUrl = `${process.env.BASE_URL}/dashboard.html`;
    const unsubUrl = `${process.env.BASE_URL}/api/auth/unsubscribe?token=${unsubToken}`;

    await resend.emails.send({
        from: FROM,
        replyTo: 'jianming@remnantexchange.org',
        to: email,
        subject: 'Your Remnant Exchange account is ready — post your first remnant',
        html: `
            <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#1a1a1a;line-height:1.6;">
                <p>Hi ${firstName},</p>
                <p>Your free <strong>Remnant Exchange</strong> account is set up and ready to go — but you have not posted any remnants yet. Here is how to log in and get your first one listed in about 2 minutes.</p>

                <div style="background:#f0f7ff;border:2px solid #2563eb;border-radius:12px;padding:20px;margin:20px 0;">
                    <p style="margin:0 0 4px 0;font-weight:700;color:#1e3a8a;">Step 1 — Log in</p>
                    <p style="margin:0 0 14px 0;font-size:0.85rem;color:#64748b;">Click below to log in instantly (you will be prompted to set your own password):</p>
                    <p style="margin:0 0 14px 0;">
                        <a href="${loginUrl}" style="background:#2563eb;color:white;padding:12px 28px;text-decoration:none;border-radius:6px;display:inline-block;font-weight:bold;">Log In to My Account &rarr;</a>
                    </p>
                    <p style="margin:0 0 4px 0;font-size:0.85rem;color:#64748b;">Or log in manually at <a href="${process.env.BASE_URL}/login.html" style="color:#2563eb;">remnantexchange.org/login.html</a>:</p>
                    <p style="margin:0 0 2px 0;"><strong>Email:</strong> ${email}</p>
                    <p style="margin:0;"><strong>Temporary password:</strong> <span style="font-weight:700;letter-spacing:2px;">${tempPassword}</span></p>
                </div>

                <p style="font-weight:700;margin:0 0 6px 0;">Step 2 — Post your remnant (~2 minutes)</p>
                <ol style="margin:0 0 12px 20px;color:#475569;font-size:0.92rem;line-height:1.9;">
                    <li>Go to your <strong>Dashboard</strong></li>
                    <li>Click <strong>"Post a Remnant"</strong></li>
                    <li>Enter material, stone name, dimensions (L &times; W &times; thickness), and location</li>
                    <li>Add a photo — clear photos get more inquiries</li>
                    <li>Click <strong>Post</strong> — it goes live immediately</li>
                </ol>

                <p><strong>Too busy?</strong> Just reply to this email with your remnant details (material, stone name, dimensions, photo) and <strong>I will post it for you</strong>.</p>

                <p style="margin:18px 0;">
                    <a href="${dashUrl}" style="background:#2563eb;color:white;padding:12px 28px;text-decoration:none;border-radius:6px;display:inline-block;font-weight:bold;">Post My First Remnant &rarr;</a>
                </p>

                <p>— Jianming Yan<br>
                <span style="color:#64748b;font-size:0.9rem;">Founder, Remnant Exchange<br>
                RemnantExchange.org | (617) 606-5840</span></p>

                <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0;">
                <p style="color:#94a3b8;font-size:0.75rem;margin:0;">Remnant Exchange &middot; 105 Chapman Street, Canton, MA 02021<br>
                <a href="${unsubUrl}" style="color:#94a3b8;">Unsubscribe / not interested</a></p>
            </div>
        `,
    });
}

module.exports = { sendVerificationEmail, sendAdminNotification, sendApprovalEmail, sendRejectionEmail, sendContactMessage, sendTempPasswordEmail, sendResetPasswordEmail, sendIntroductionEmail, sendUnsubscribeConfirmationEmail, sendReactivationWelcomeEmail, sendBuyerRequestEmail, sendFabricatorBroadcastEmail, sendContractorBroadcastEmail, sendFabLeadIntroEmail, sendFabLeadFollowUp1Email, sendFabLeadFollowUp2Email, sendFirstListingCongratulationEmail, sendActivationNudgeEmail, sendThankYouActivationEmail, sendUserReminderEmail };
