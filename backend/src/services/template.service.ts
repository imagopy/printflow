/**
 * Template Service
 * 
 * Renders HTML templates for quotes and other documents.
 * Uses Handlebars for template processing.
 */

import * as handlebars from 'handlebars';
import * as fs from 'fs/promises';
import * as path from 'path';
import { logger } from '../utils/logger';

import { env } from '../config/env';
import { Quote, Customer, Product } from '@prisma/client';

export interface QuoteTemplateData {
  quote: Quote & {
    customer: Customer;
    product: Product;
  };
  specifications: any;
  pricing: {
    materialCost: number;
    setupCost: number;
    laborCost: number;
    totalCost: number;
    sellingPrice: number;
    marginPercent: number;
    unitPrice: number;
  };
  company: {
    name: string;
    address: string;
    phone: string;
    email: string;
    website: string;
    logo?: string;
  };
  validUntil: Date;
  notes?: string;
}

class TemplateService {
  private templates: Map<string, handlebars.TemplateDelegate> = new Map();
  private partialsLoaded = false;

  constructor() {
    this.registerHelpers();
  }

  /**
   * Register Handlebars helpers
   */
  private registerHelpers(): void {
    // Currency formatting
    handlebars.registerHelper('currency', (amount: number) => {
      return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(amount || 0);
    });

    // Date formatting
    handlebars.registerHelper('date', (date: Date | string, format?: string) => {
      const d = new Date(date);
      if (format === 'short') {
        return d.toLocaleDateString('en-US');
      } else if (format === 'long') {
        return d.toLocaleDateString('en-US', {
          weekday: 'long',
          year: 'numeric',
          month: 'long',
          day: 'numeric',
        });
      }
      return d.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      });
    });

    // Number formatting
    handlebars.registerHelper('number', (num: number) => {
      return new Intl.NumberFormat('en-US').format(num || 0);
    });

    // Percentage formatting
    handlebars.registerHelper('percent', (num: number) => {
      return `${(num || 0).toFixed(1)}%`;
    });

    // Math helpers
    handlebars.registerHelper('subtract', (a: number, b: number) => {
      return a - b;
    });

    handlebars.registerHelper('add', (a: number, b: number) => {
      return a + b;
    });

    handlebars.registerHelper('multiply', (a: number, b: number) => {
      return a * b;
    });

    handlebars.registerHelper('divide', (a: number, b: number) => {
      return b !== 0 ? a / b : 0;
    });

    // Conditional helpers
    handlebars.registerHelper('ifEquals', function(this: any, arg1: any, arg2: any, options: any) {
      return arg1 === arg2 ? options.fn(this) : options.inverse(this);
    });

    handlebars.registerHelper('ifGreaterThan', function(this: any, arg1: number, arg2: number, options: any) {
      return arg1 > arg2 ? options.fn(this) : options.inverse(this);
    });

    handlebars.registerHelper('unless', function(this: any, conditional: any, options: any) {
      return !conditional ? options.fn(this) : options.inverse(this);
    });

    handlebars.registerHelper('eq', (a: any, b: any) => a === b);

    // Format specification key
    handlebars.registerHelper('formatSpecKey', (key: string) => {
      return key
        .replace(/_/g, ' ')
        .replace(/\b\w/g, (l) => l.toUpperCase());
    });

    // Format specification value
    handlebars.registerHelper('formatSpecValue', (value: any) => {
      if (Array.isArray(value)) {
        return value.join(', ');
      }
      if (typeof value === 'boolean') {
        return value ? 'Yes' : 'No';
      }
      return value;
    });
  }

  /**
   * Load template partials
   */
  private async loadPartials(): Promise<void> {
    if (this.partialsLoaded) return;

    try {
      const partialsDir = path.join(__dirname, '..', 'templates', 'partials');
      const files = await fs.readdir(partialsDir);

      for (const file of files) {
        if (file.endsWith('.hbs')) {
          const name = path.basename(file, '.hbs');
          const content = await fs.readFile(path.join(partialsDir, file), 'utf-8');
          handlebars.registerPartial(name, content);
        }
      }

      this.partialsLoaded = true;
    } catch (error) {
      logger.error('Failed to load template partials', error as Error);
      // Non-critical error, continue without partials
    }
  }

  /**
   * Load and compile a template
   */
  async loadTemplate(templateName: string): Promise<handlebars.TemplateDelegate> {
    if (this.templates.has(templateName)) {
      return this.templates.get(templateName)!;
    }

    await this.loadPartials();

    try {
      const templatePath = path.join(
        __dirname,
        '..',
        'templates',
        `${templateName}.hbs`
      );
      const templateContent = await fs.readFile(templatePath, 'utf-8');
      const compiled = handlebars.compile(templateContent);
      this.templates.set(templateName, compiled);
      return compiled;
    } catch (error) {
      logger.error(`Failed to load template: ${templateName}`, error as Error);
      throw new Error(`Template not found: ${templateName}`);
    }
  }

  /**
   * Render quote PDF template
   */
  async renderQuotePDF(data: QuoteTemplateData): Promise<string> {
    const template = await this.loadTemplate('quote-pdf');
    
    // Add company info from environment
    const templateData = {
      ...data,
      company: {
        name: env.COMPANY_NAME || 'PrintFlow',
        address: env.COMPANY_ADDRESS || '',
        phone: env.COMPANY_PHONE || '',
        email: env.COMPANY_EMAIL || '',
        website: env.COMPANY_WEBSITE || '',
        logo: data.company?.logo,
      },
      currentDate: new Date(),
      quoteNumber: `Q-${data.quote.id.slice(-8).toUpperCase()}`,
    };

    return template(templateData);
  }

  /**
   * Render quote email template
   */
  async renderQuoteEmail(data: {
    customerName: string;
    quoteNumber: string;
    quotePdfUrl: string;
    message?: string;
    validUntil: Date;
  }): Promise<string> {
    const template = await this.loadTemplate('emails/quote');
    
    return template({
      ...data,
      companyName: env.COMPANY_NAME || 'PrintFlow',
      companyWebsite: env.COMPANY_WEBSITE || '',
      companyPhone: env.COMPANY_PHONE || '',
      year: new Date().getFullYear(),
    });
  }

  /**
   * Get inline CSS for PDF generation
   */
  async getPDFStyles(): Promise<string> {
    try {
      const stylesPath = path.join(
        __dirname,
        '..',
        'templates',
        'styles',
        'pdf.css'
      );
      const content = await fs.readFile(stylesPath, 'utf-8');
      return content;
    } catch (error) {
      logger.error('Failed to load PDF styles', error as Error);
      // Return default styles if file not found
      return this.getDefaultPDFStyles();
    }
  }

  /**
   * Get default PDF styles
   */
  private getDefaultPDFStyles(): string {
    return `
      @page {
        size: A4;
        margin: 20mm;
      }

      body {
        font-family: Arial, sans-serif;
        font-size: 12pt;
        line-height: 1.6;
        color: #333;
      }

      h1, h2, h3 {
        color: #2c3e50;
      }

      table {
        width: 100%;
        border-collapse: collapse;
        margin: 20px 0;
      }

      th, td {
        padding: 10px;
        text-align: left;
        border-bottom: 1px solid #ddd;
      }

      th {
        background-color: #f4f4f4;
        font-weight: bold;
      }

      .header {
        text-align: center;
        margin-bottom: 30px;
      }

      .footer {
        text-align: center;
        margin-top: 30px;
        font-size: 10pt;
        color: #666;
      }

      .total {
        font-size: 16pt;
        font-weight: bold;
        color: #2c3e50;
      }
    `;
  }

  /**
   * Generate complete HTML for PDF
   */
  async generateQuotePDFHTML(data: QuoteTemplateData): Promise<string> {
    const content = await this.renderQuotePDF(data);
    const styles = await this.getPDFStyles();

    return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Quote ${data.quote.id}</title>
    <style>${styles}</style>
</head>
<body>
    ${content}
</body>
</html>
    `;
  }
}

// Export singleton instance
export const templateService = new TemplateService();