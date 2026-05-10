require('dotenv').config();
const { Resend } = require('resend');

const resend = new Resend('re_2wgxkjTz_NUSov56aF47XHKHnZ5edZww3');

resend.emails.send({
    from: 'onboarding@resend.dev',
    to: 'info.remnantexchange@gmail.com',
    subject: 'Test from Remnant Exchange',
    html: '<p>This is a test email.</p>',
}).then(result => {
    console.log('Result:', JSON.stringify(result, null, 2));
}).catch(err => {
    console.error('Error:', err.message);
});
