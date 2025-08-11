/**
 * Email Service
 * 
 * Handles email sending with support for multiple providers (SendGrid, AWS SES).
 * Includes templates for quotes, notifications, and other transactional emails.
 */

import * as sgMail from '@sendgrid/mail';
import * as AWS from 'aws-sdk';
import * as handlebars from 'handlebars';
import * as fs from 'fs/promises';
import * as path from 'path';
import { logger } from '../utils/logger';
import { AppError } from '../utils/errors';
import { env } from '../config/env';


export interface EmailOptions {
  to: string | string[];
  cc?: string | string[];
  bcc?: string | string[];
  subject: string;
  html?: string;
  text?: string;
  attachments?: EmailAttachment[];
  replyTo?: string;
  templateId?: string;
  templateData?: Record<string, any>;
}

export interface EmailAttachment {
  filename: string;
  content: Buffer | string;
  type?: string;
  disposition?: 'attachment' | 'inline';
  contentId?: string;
}

export interface EmailTemplate {
  subject: string;
  html: string;
  text?: string;
}

type EmailProvider = 'sendgrid' | 'ses';

class EmailService {
  private provider: EmailProvider;
  private sesClient?: AWS.SES;
  private templates: Map<string, handlebars.TemplateDelegate> = new Map();
  private fromEmail: string;
  private fromName: string;

  constructor() {
    // Determine which provider to use based on environment variables
    if (env.SENDGRID_API_KEY) {
      this.provider = 'sendgrid';
      sgMail.setApiKey(env.SENDGRID_API_KEY);
      this.fromEmail = env.SENDGRID_FROM_EMAIL || 'noreply@printflow.com';
      this.fromName = env.SENDGRID_FROM_NAME || 'PrintFlow';
      logger.info('Email service initialized with SendGrid');
    } else if (env.AWS_ACCESS_KEY_ID && env.AWS_SECRET_ACCESS_KEY) {
      this.provider = 'ses';
      this.sesClient = new AWS.SES({
        region: env.AWS_SES_REGION || 'us-east-1',
        accessKeyId: env.AWS_ACCESS_KEY_ID,
        secretAccessKey: env.AWS_SECRET_ACCESS_KEY,
      });
      this.fromEmail = env.AWS_SES_FROM_EMAIL || 'noreply@printflow.com';
      this.fromName = 'PrintFlow';
      logger.info('Email service initialized with AWS SES');
    } else {
      logger.warn('No email provider configured. Emails will be logged only.');
      this.provider = 'sendgrid'; // Default, but won't actually send
      this.fromEmail = 'noreply@printflow.com';
      this.fromName = 'PrintFlow';
    }

    // Register Handlebars helpers
    this.registerHandlebarsHelpers();
  }

  /**
   * Register custom Handlebars helpers
   */
  private registerHandlebarsHelpers(): void {
    handlebars.registerHelper('currency', (amount: number) => {
      return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
      }).format(amount);
    });

    handlebars.registerHelper('date', (date: Date | string, format?: string) => {
      const d = new Date(date);
      if (format === 'short') {
        return d.toLocaleDateString('en-US');
      }
      return d.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      });
    });

    handlebars.registerHelper('number', (num: number) => {
      return new Intl.NumberFormat('en-US').format(num);
    });
  }

  /**
   * Load and cache email template
   */
  private async loadTemplate(templateName: string): Promise<handlebars.TemplateDelegate> {
    if (this.templates.has(templateName)) {
      return this.templates.get(templateName)!;
    }

    try {
      const templatePath = path.join(
        __dirname,
        '..',
        'templates',
        'emails',
        `${templateName}.hbs`
      );
      const html = await fs.readFile(templatePath, 'utf-8');
      const compiled = handlebars.compile(html);
      this.templates.set(templateName, compiled);
      return compiled;
    } catch (error) {
      logger.error(`Failed to load email template: ${templateName}`, error as Error);
      throw new Error(`Failed to load email template: ${templateName}`);
    }
  }

  /**
   * Send email using configured provider
   */
  async send(options: EmailOptions): Promise<void> {
    try {
      // If no provider is configured, just log
      if (!env.SENDGRID_API_KEY && !env.AWS_ACCESS_KEY_ID) {
        logger.info('Email would be sent (no provider configured):', {
          to: options.to,
          subject: options.subject,
        });
        return;
      }

      if (this.provider === 'sendgrid') {
        await this.sendWithSendGrid(options);
      } else {
        await this.sendWithSES(options);
      }

      logger.info('Email sent successfully', {
        to: options.to,
        subject: options.subject,
      });
    } catch (error) {
      logger.error('Failed to send email', error as Error);
      throw new Error(`Failed to send email: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Send email using SendGrid
   */
  private async sendWithSendGrid(options: EmailOptions): Promise<void> {
    const msg: sgMail.MailDataRequired = {
      to: options.to,
      from: {
        email: this.fromEmail,
        name: this.fromName,
      },
      subject: options.subject,
      text: options.text || '',
      html: options.html || '',
    };

    if (options.cc) msg.cc = options.cc;
    if (options.bcc) msg.bcc = options.bcc;
    if (options.replyTo) msg.replyTo = options.replyTo;

    if (options.attachments) {
      msg.attachments = options.attachments.map((att) => ({
        content: typeof att.content === 'string' ? att.content : att.content.toString('base64'),
        filename: att.filename,
        type: att.type,
        disposition: att.disposition || 'attachment',
        contentId: att.contentId,
      }));
    }

    await sgMail.send(msg);
  }

  /**
   * Send email using AWS SES
   */
  private async sendWithSES(options: EmailOptions): Promise<void> {
    if (!this.sesClient) {
      throw new AppError('SES client not initialized', 500);
    }

    const params: AWS.SES.SendEmailRequest = {
      Source: `${this.fromName} <${this.fromEmail}>`,
      Destination: {
        ToAddresses: Array.isArray(options.to) ? options.to : [options.to],
      },
      Message: {
        Subject: {
          Data: options.subject,
          Charset: 'UTF-8',
        },
        Body: {
          Text: {
            Data: options.text || '',
            Charset: 'UTF-8',
          },
          Html: {
            Data: options.html || '',
            Charset: 'UTF-8',
          },
        },
      },
    };

    if (options.cc) {
      params.Destination!.CcAddresses = Array.isArray(options.cc) ? options.cc : [options.cc];
    }

    if (options.bcc) {
      params.Destination!.BccAddresses = Array.isArray(options.bcc) ? options.bcc : [options.bcc];
    }

    if (options.replyTo) {
      params.ReplyToAddresses = [options.replyTo];
    }

    // Note: SES requires separate handling for attachments using raw email
    if (options.attachments && options.attachments.length > 0) {
      await this.sendRawEmailWithSES();
    } else {
      await this.sesClient.sendEmail(params).promise();
    }
  }

  /**
   * Send raw email using AWS SES
   */
  private async sendRawEmailWithSES(): Promise<void> {
    // Implementation would go here
    // For now, throw error as SES is not configured
    throw new Error('AWS SES not configured');
  }

  /**
   * Send quote email
   */
  async sendQuoteEmail(data: {
    to: string;
    customerName: string;
    quoteNumber: string;
    quotePdfUrl: string;
    message?: string;
  }): Promise<void> {
    const template = await this.loadTemplate('quote');
    const html = template({
      customerName: data.customerName,
      quoteNumber: data.quoteNumber,
      quotePdfUrl: data.quotePdfUrl,
      message: data.message,
      companyName: env.COMPANY_NAME,
      companyWebsite: env.COMPANY_WEBSITE,
      year: new Date().getFullYear(),
    });

    await this.send({
      to: data.to,
      subject: `Quote #${data.quoteNumber} from ${env.COMPANY_NAME}`,
      html,
      text: `Dear ${data.customerName},\n\nPlease find attached your quote #${data.quoteNumber}.\n\nView quote: ${data.quotePdfUrl}\n\nBest regards,\n${env.COMPANY_NAME}`,
    });
  }

  /**
   * Send quote accepted notification
   */
  async sendQuoteAcceptedNotification(data: {
    to: string | string[];
    customerName: string;
    quoteNumber: string;
    workOrderNumber: string;
  }): Promise<void> {
    const template = await this.loadTemplate('quote-accepted');
    const html = template({
      customerName: data.customerName,
      quoteNumber: data.quoteNumber,
      workOrderNumber: data.workOrderNumber,
      companyName: env.COMPANY_NAME,
      year: new Date().getFullYear(),
    });

    await this.send({
      to: data.to,
      subject: `Quote #${data.quoteNumber} Accepted - Work Order Created`,
      html,
      text: `Quote #${data.quoteNumber} has been accepted by ${data.customerName}. Work order #${data.workOrderNumber} has been created.`,
    });
  }

  /**
   * Send work order status update
   */
  async sendWorkOrderStatusUpdate(data: {
    to: string;
    customerName: string;
    workOrderNumber: string;
    oldStatus: string;
    newStatus: string;
    estimatedCompletion?: Date;
  }): Promise<void> {
    const template = await this.loadTemplate('work-order-status');
    const html = template({
      customerName: data.customerName,
      workOrderNumber: data.workOrderNumber,
      oldStatus: data.oldStatus,
      newStatus: data.newStatus,
      estimatedCompletion: data.estimatedCompletion,
      companyName: env.COMPANY_NAME,
      companyPhone: env.COMPANY_PHONE,
      year: new Date().getFullYear(),
    });

    await this.send({
      to: data.to,
      subject: `Work Order #${data.workOrderNumber} - Status Update`,
      html,
      text: `Dear ${data.customerName},\n\nYour work order #${data.workOrderNumber} status has been updated from ${data.oldStatus} to ${data.newStatus}.\n\nFor questions, please contact us at ${env.COMPANY_PHONE}.\n\nBest regards,\n${env.COMPANY_NAME}`,
    });
  }

  /**
   * Send test email
   */
  async sendTestEmail(to: string): Promise<void> {
    await this.send({
      to,
      subject: 'PrintFlow Email Test',
      html: `
        <h1>Email Configuration Test</h1>
        <p>This is a test email from PrintFlow.</p>
        <p>Provider: ${this.provider}</p>
        <p>Time: ${new Date().toISOString()}</p>
      `,
      text: `Email Configuration Test\n\nThis is a test email from PrintFlow.\nProvider: ${this.provider}\nTime: ${new Date().toISOString()}`,
    });
  }
}

// Export singleton instance
export const emailService = new EmailService();