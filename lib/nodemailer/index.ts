import nodemailer from 'nodemailer';
import { WELCOME_EMAIL_TEMPLATE, NEWS_SUMMARY_EMAIL_TEMPLATE } from '@/lib/nodemailer/templates';

export const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.NODEMAILER_EMAIL!,
        pass: process.env.NODEMAILER_PASSWORD!,
    }
})

export const sendWelcomeEmail = async ({ email, name, intro }: WelcomeEmailData) => {
    const htmlTemplate = WELCOME_EMAIL_TEMPLATE
        .replace('{{name}}', name)
        .replace('{{intro}}', intro);

    const mailOptions = {
        from: `"Signalist" <signalist@jsmastery.pro>`,
        to: email,
        subject: `Welcome to Signalist - your stock market toolkit is ready!`,
        text: 'Thanks for joining Signalist',
        html: htmlTemplate,
    }

    await transporter.sendMail(mailOptions);
}

type NewsSummaryEmailData = {
    email: string;
    date: string;
    newsContent: string;
};

export const sendNewsSummaryEmail = async ({ email, date, newsContent }: NewsSummaryEmailData) => {
    const htmlTemplate = NEWS_SUMMARY_EMAIL_TEMPLATE
        .replace('{{date}}', date)
        .replace('{{newsContent}}', newsContent);

    const mailOptions = {
        from: '"Signalist News" <signalist@jsmastery.pro>',
        to: email,
        subject: `📈 Market News Summary Today - ${date}`,
        text: "Today's market news summary from Signalist",
        html: htmlTemplate,
    };

    await transporter.sendMail(mailOptions);
}

type PriceAlertEmailData = {
        email: string;
        symbol: string;
        company: string;
        condition: 'gt' | 'lt';
        threshold: number;
        price: number;
};

export const sendPriceAlertEmail = async ({ email, symbol, company, condition, threshold, price }: PriceAlertEmailData) => {
        const subject = `Price alert: ${symbol} is ${condition === 'gt' ? 'above' : 'below'} ${threshold}`;
        const html = `
            <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; padding:16px; background:#0b0b0d; color:#f5f5f5;">
                <h2 style="margin:0 0 12px 0; color:#fdd458;">${company} (${symbol})</h2>
                <p style="margin:0 0 8px 0;">Current price: <strong>$${price.toFixed(2)}</strong></p>
                <p style="margin:0 0 8px 0;">Condition hit: <strong>${condition === 'gt' ? 'Greater than' : 'Less than'} $${threshold}</strong></p>
                <p style="margin:16px 0 0 0; color:#9ca3af; font-size:14px;">You received this alert from Signalist.</p>
            </div>
        `;

        const mailOptions = {
                from: '"Signalist Alerts" <signalist@jsmastery.pro>',
                to: email,
                subject,
                text: `${symbol} hit your alert: price ${price.toFixed(2)} (${condition} ${threshold})`,
                html,
        };

        await transporter.sendMail(mailOptions);
};

