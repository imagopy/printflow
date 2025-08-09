/**
 * Storage Service
 * 
 * Handles file storage with support for AWS S3 and CloudFlare R2.
 * Provides unified interface for file operations.
 */

import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  CopyObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import * as crypto from 'crypto';
import * as path from 'path';
import { Readable } from 'stream';
import { logger } from '../utils/logger';
import { AppError } from '../utils/errors';
import { env } from '../config/env';

export interface StorageFile {
  key: string;
  size: number;
  lastModified: Date;
  etag?: string;
  contentType?: string;
}

export interface UploadOptions {
  contentType?: string;
  metadata?: Record<string, string>;
  acl?: 'private' | 'public-read';
  cacheControl?: string;
  contentDisposition?: string;
}

export interface SignedUrlOptions {
  expiresIn?: number; // seconds
  responseContentDisposition?: string;
  responseContentType?: string;
}

type StorageProvider = 's3' | 'r2';

class StorageService {
  private client: S3Client;
  private bucket: string;
  private provider: StorageProvider;
  private publicBaseUrl?: string;

  constructor() {
    // Determine provider and configure client
    if (env.R2_ACCESS_KEY_ID && env.R2_SECRET_ACCESS_KEY && env.R2_ENDPOINT) {
      // CloudFlare R2 configuration
      this.provider = 'r2';
      this.client = new S3Client({
        region: 'auto',
        endpoint: env.R2_ENDPOINT,
        credentials: {
          accessKeyId: env.R2_ACCESS_KEY_ID,
          secretAccessKey: env.R2_SECRET_ACCESS_KEY,
        },
      });
      this.bucket = env.R2_BUCKET || 'printflow-files';
      logger.info('Storage service initialized with CloudFlare R2');
    } else if (env.AWS_ACCESS_KEY_ID && env.AWS_SECRET_ACCESS_KEY) {
      // AWS S3 configuration
      this.provider = 's3';
      this.client = new S3Client({
        region: env.AWS_S3_REGION || 'us-east-1',
        credentials: {
          accessKeyId: env.AWS_ACCESS_KEY_ID,
          secretAccessKey: env.AWS_SECRET_ACCESS_KEY,
        },
      });
      this.bucket = env.AWS_S3_BUCKET || 'printflow-files';
      this.publicBaseUrl = env.AWS_S3_PUBLIC_URL;
      logger.info('Storage service initialized with AWS S3');
    } else {
      throw new Error('No storage provider configured. Please set up S3 or R2 credentials.');
    }
  }

  /**
   * Generate a unique file key
   */
  generateFileKey(
    category: string,
    filename: string,
    shopId: string
  ): string {
    const ext = path.extname(filename);
    const name = path.basename(filename, ext);
    const timestamp = Date.now();
    const hash = crypto.randomBytes(8).toString('hex');
    
    // Organize files by shop and category
    return `shops/${shopId}/${category}/${timestamp}-${hash}-${name}${ext}`;
  }

  /**
   * Upload a file to storage
   */
  async upload(
    key: string,
    body: Buffer | Uint8Array | Blob | string | Readable,
    options: UploadOptions = {}
  ): Promise<StorageFile> {
    try {
      const command = new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: body,
        ContentType: options.contentType || 'application/octet-stream',
        Metadata: options.metadata,
        ACL: options.acl,
        CacheControl: options.cacheControl,
        ContentDisposition: options.contentDisposition,
      });

      await this.client.send(command);

      logger.info(`File uploaded successfully: ${key}`);

      // Get file info
      const headCommand = new HeadObjectCommand({
        Bucket: this.bucket,
        Key: key,
      });

      const headResponse = await this.client.send(headCommand);

      return {
        key,
        size: headResponse.ContentLength || 0,
        lastModified: headResponse.LastModified || new Date(),
        etag: headResponse.ETag,
        contentType: headResponse.ContentType,
      };
    } catch (error) {
      logger.error('Failed to upload file', error);
      throw new AppError('Failed to upload file', 500);
    }
  }

  /**
   * Download a file from storage
   */
  async download(key: string): Promise<Buffer> {
    try {
      const command = new GetObjectCommand({
        Bucket: this.bucket,
        Key: key,
      });

      const response = await this.client.send(command);
      
      if (!response.Body) {
        throw new AppError('File not found', 404);
      }

      // Convert stream to buffer
      const chunks: Uint8Array[] = [];
      for await (const chunk of response.Body as any) {
        chunks.push(chunk);
      }
      
      return Buffer.concat(chunks);
    } catch (error: any) {
      if (error.name === 'NoSuchKey') {
        throw new AppError('File not found', 404);
      }
      logger.error('Failed to download file', error);
      throw new AppError('Failed to download file', 500);
    }
  }

  /**
   * Get a signed URL for temporary access
   */
  async getSignedUrl(
    key: string,
    operation: 'get' | 'put' = 'get',
    options: SignedUrlOptions = {}
  ): Promise<string> {
    try {
      let command;
      
      if (operation === 'get') {
        command = new GetObjectCommand({
          Bucket: this.bucket,
          Key: key,
          ResponseContentDisposition: options.responseContentDisposition,
          ResponseContentType: options.responseContentType,
        });
      } else {
        command = new PutObjectCommand({
          Bucket: this.bucket,
          Key: key,
        });
      }

      const url = await getSignedUrl(this.client, command, {
        expiresIn: options.expiresIn || 3600, // 1 hour default
      });

      return url;
    } catch (error) {
      logger.error('Failed to generate signed URL', error);
      throw new AppError('Failed to generate signed URL', 500);
    }
  }

  /**
   * Get public URL for a file (if bucket is public)
   */
  getPublicUrl(key: string): string {
    if (this.publicBaseUrl) {
      return `${this.publicBaseUrl}/${key}`;
    }

    if (this.provider === 's3') {
      return `https://${this.bucket}.s3.${env.AWS_S3_REGION || 'us-east-1'}.amazonaws.com/${key}`;
    }

    // For R2, you need to set up a custom domain or use the public bucket URL
    throw new AppError('Public URL not available for this storage configuration', 501);
  }

  /**
   * Delete a file from storage
   */
  async delete(key: string): Promise<void> {
    try {
      const command = new DeleteObjectCommand({
        Bucket: this.bucket,
        Key: key,
      });

      await this.client.send(command);
      logger.info(`File deleted successfully: ${key}`);
    } catch (error) {
      logger.error('Failed to delete file', error);
      throw new AppError('Failed to delete file', 500);
    }
  }

  /**
   * Delete multiple files
   */
  async deleteMany(keys: string[]): Promise<void> {
    // S3 supports batch delete, but for simplicity, delete one by one
    const promises = keys.map(key => this.delete(key));
    await Promise.all(promises);
  }

  /**
   * Copy a file within storage
   */
  async copy(sourceKey: string, destinationKey: string): Promise<void> {
    try {
      const command = new CopyObjectCommand({
        Bucket: this.bucket,
        CopySource: `${this.bucket}/${sourceKey}`,
        Key: destinationKey,
      });

      await this.client.send(command);
      logger.info(`File copied from ${sourceKey} to ${destinationKey}`);
    } catch (error) {
      logger.error('Failed to copy file', error);
      throw new AppError('Failed to copy file', 500);
    }
  }

  /**
   * Check if a file exists
   */
  async exists(key: string): Promise<boolean> {
    try {
      const command = new HeadObjectCommand({
        Bucket: this.bucket,
        Key: key,
      });

      await this.client.send(command);
      return true;
    } catch (error: any) {
      if (error.name === 'NotFound' || error.$metadata?.httpStatusCode === 404) {
        return false;
      }
      throw error;
    }
  }

  /**
   * List files with prefix
   */
  async list(prefix: string, maxKeys: number = 1000): Promise<StorageFile[]> {
    try {
      const command = new ListObjectsV2Command({
        Bucket: this.bucket,
        Prefix: prefix,
        MaxKeys: maxKeys,
      });

      const response = await this.client.send(command);
      
      if (!response.Contents) {
        return [];
      }

      return response.Contents.map(item => ({
        key: item.Key!,
        size: item.Size || 0,
        lastModified: item.LastModified || new Date(),
        etag: item.ETag,
      }));
    } catch (error) {
      logger.error('Failed to list files', error);
      throw new AppError('Failed to list files', 500);
    }
  }

  /**
   * Upload a PDF file for quotes
   */
  async uploadQuotePDF(
    pdfBuffer: Buffer,
    quoteId: string,
    shopId: string
  ): Promise<{ key: string; url: string }> {
    const key = this.generateFileKey('quotes', `quote-${quoteId}.pdf`, shopId);
    
    await this.upload(key, pdfBuffer, {
      contentType: 'application/pdf',
      contentDisposition: `inline; filename="quote-${quoteId}.pdf"`,
      metadata: {
        quoteId,
        shopId,
        uploadedAt: new Date().toISOString(),
      },
    });

    // Generate a signed URL valid for 7 days
    const url = await this.getSignedUrl(key, 'get', {
      expiresIn: 7 * 24 * 60 * 60, // 7 days
      responseContentDisposition: `inline; filename="quote-${quoteId}.pdf"`,
    });

    return { key, url };
  }

  /**
   * Get storage usage for a shop
   */
  async getShopStorageUsage(shopId: string): Promise<{ totalSize: number; fileCount: number }> {
    const files = await this.list(`shops/${shopId}/`);
    
    const totalSize = files.reduce((sum, file) => sum + file.size, 0);
    const fileCount = files.length;

    return { totalSize, fileCount };
  }
}

// Export singleton instance
export const storageService = new StorageService();