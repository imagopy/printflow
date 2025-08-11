/**
 * PDF Generation Service
 * 
 * Generates PDF documents using Puppeteer with custom templates.
 * Supports quote generation with professional formatting.
 */

import puppeteer, { Browser, PDFOptions } from 'puppeteer';
import * as fs from 'fs/promises';
import * as path from 'path';
import { logger } from '../utils/logger';
import { AppError } from '../utils/errors';

export interface PDFGenerationOptions {
  format?: 'A4' | 'Letter' | 'Legal';
  margin?: {
    top?: string;
    right?: string;
    bottom?: string;
    left?: string;
  };
  displayHeaderFooter?: boolean;
  headerTemplate?: string;
  footerTemplate?: string;
  printBackground?: boolean;
  landscape?: boolean;
}

class PDFService {
  private browser: Browser | null = null;
  private isInitialized = false;

  /**
   * Initialize the Puppeteer browser instance
   */
  private async initialize(): Promise<void> {
    if (this.isInitialized && this.browser) {
      return;
    }

    try {
      const puppeteerOptions: any = {
        headless: 'new',
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-accelerated-2d-canvas',
          '--disable-gpu',
          '--window-size=1920,1080',
        ],
      };

      // Use custom executable path if provided (for production)
      if (process.env.PUPPETEER_EXECUTABLE_PATH) {
        puppeteerOptions.executablePath = process.env.PUPPETEER_EXECUTABLE_PATH;
      }

      this.browser = await puppeteer.launch(puppeteerOptions);
      this.isInitialized = true;
      logger.info('PDF service initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize PDF service', error as Error);
      throw new Error(`PDF service initialization failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Generate PDF from HTML content
   */
  async generatePDF(
    html: string,
    options: PDFGenerationOptions = {}
  ): Promise<Buffer> {
    await this.initialize();

    if (!this.browser) {
      throw new AppError('PDF service not initialized', 500);
    }

    const page = await this.browser.newPage();

    try {
      // Set viewport for consistent rendering
      await page.setViewport({ width: 1920, height: 1080 });

      // Set content with proper encoding
      await page.setContent(html, {
        waitUntil: ['networkidle0', 'domcontentloaded'],
      });

      // Default PDF options
      const pdfOptions: PDFOptions = {
        format: options.format || 'A4',
        margin: options.margin || {
          top: '20mm',
          right: '20mm',
          bottom: '20mm',
          left: '20mm',
        },
        displayHeaderFooter: options.displayHeaderFooter || false,
        headerTemplate: options.headerTemplate || '',
        footerTemplate: options.footerTemplate || '',
        printBackground: options.printBackground !== false,
        landscape: options.landscape || false,
      };

      // Generate PDF
      const pdfBuffer = await page.pdf(pdfOptions);

      return pdfBuffer;
    } catch (error) {
      logger.error('Failed to generate PDF', error as Error);
      throw new Error(`PDF generation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      await page.close();
    }
  }

  /**
   * Generate PDF from URL
   */
  async generatePDFFromURL(
    url: string,
    options: PDFGenerationOptions = {}
  ): Promise<Buffer> {
    await this.initialize();

    if (!this.browser) {
      throw new AppError('PDF service not initialized', 500);
    }

    const page = await this.browser.newPage();

    try {
      // Navigate to URL
      await page.goto(url, {
        waitUntil: ['networkidle0', 'domcontentloaded'],
        timeout: 30000,
      });

      // Generate PDF with same options
      const pdfBuffer = await page.pdf({
        format: options.format || 'A4',
        margin: options.margin || {
          top: '20mm',
          right: '20mm',
          bottom: '20mm',
          left: '20mm',
        },
        displayHeaderFooter: options.displayHeaderFooter || false,
        headerTemplate: options.headerTemplate || '',
        footerTemplate: options.footerTemplate || '',
        printBackground: options.printBackground !== false,
        landscape: options.landscape || false,
      });

      return pdfBuffer;
    } catch (error) {
      logger.error('Failed to generate PDF from URL', error as Error);
      throw new Error(`PDF generation from URL failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      await page.close();
    }
  }

  /**
   * Save PDF to local file system (temporary)
   */
  async savePDFToFile(
    pdfBuffer: Buffer,
    filename: string
  ): Promise<string> {
    try {
      const tempDir = process.env.PDF_STORAGE_PATH || '/tmp/pdfs';
      
      // Ensure directory exists
      await fs.mkdir(tempDir, { recursive: true });

      const filePath = path.join(tempDir, filename);
      await fs.writeFile(filePath, pdfBuffer);

      logger.info('PDF saved to file', { path: filePath });
      return filePath;
    } catch (error) {
      logger.error('Failed to save PDF to file', error as Error);
      throw new Error(`Failed to save PDF: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Clean up temporary PDF files older than specified hours
   */
  async cleanupTempFiles(hoursOld: number = 24): Promise<void> {
    try {
      const tempDir = process.env.PDF_STORAGE_PATH || '/tmp/pdfs';
      const files = await fs.readdir(tempDir);
      const now = Date.now();
      const maxAge = hoursOld * 60 * 60 * 1000;

      for (const file of files) {
        const filePath = path.join(tempDir, file);
        const stats = await fs.stat(filePath);
        
        if (now - stats.mtime.getTime() > maxAge) {
          await fs.unlink(filePath);
          logger.info(`Cleaned up old PDF: ${file}`);
        }
      }
      logger.info('Cleaned up temp files', { count: files.length });
    } catch (error) {
      logger.error('Failed to cleanup temp files', error as Error);
      // Don't throw, just log the error
    }
  }

  /**
   * Generate quote PDF with custom styling
   */
  async generateQuotePDF(
    html: string,
    quoteNumber: string
  ): Promise<Buffer> {
    const headerTemplate = `
      <div style="font-size: 10px; width: 100%; text-align: center; color: #666;">
        <span>Quote #${quoteNumber}</span>
      </div>
    `;

    const footerTemplate = `
      <div style="font-size: 10px; width: 100%; text-align: center; color: #666;">
        <span>Page <span class="pageNumber"></span> of <span class="totalPages"></span></span>
      </div>
    `;

    return this.generatePDF(html, {
      format: 'A4',
      displayHeaderFooter: true,
      headerTemplate,
      footerTemplate,
      margin: {
        top: '25mm',
        right: '20mm',
        bottom: '25mm',
        left: '20mm',
      },
    });
  }

  /**
   * Close the browser instance
   */
  async close(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
      this.isInitialized = false;
      logger.info('PDF service closed');
    }
  }
}

// Export singleton instance
export const pdfService = new PDFService();

// Cleanup on process termination
process.on('SIGINT', async () => {
  await pdfService.close();
});

process.on('SIGTERM', async () => {
  await pdfService.close();
});