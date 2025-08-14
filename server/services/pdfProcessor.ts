import { spawn } from 'child_process';
import { promises as fs } from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import fetch from 'node-fetch';
import sharp from 'sharp';

export interface PdfProcessingOptions {
  width: number;
  height: number;
  filename: string;
}

export class PdfProcessor {
  private tempDir: string;

  constructor() {
    this.tempDir = '/tmp';
  }

  async processPdf(pdfUrl: string, options: PdfProcessingOptions): Promise<Array<{ filename: string; buffer: Buffer }>> {
    const jobId = randomUUID();
    const pdfPath = path.join(this.tempDir, `${jobId}.pdf`);
    const outputDir = path.join(this.tempDir, jobId);

    try {
      // Download PDF
      await this.downloadPdf(pdfUrl, pdfPath);

      // Create output directory
      await fs.mkdir(outputDir, { recursive: true });

      // Convert PDF to images using pdftoppm
      await this.convertPdfToImages(pdfPath, outputDir);

      // Get all generated image files
      const files = await fs.readdir(outputDir);
      const imageFiles = files.filter(f => f.endsWith('.ppm')).sort();

      const results: Array<{ filename: string; buffer: Buffer }> = [];

      // Process each page image
      for (let i = 0; i < imageFiles.length; i++) {
        const imagePath = path.join(outputDir, imageFiles[i]);
        const pageNumber = i + 1;
        const filename = `${options.filename}-page-${pageNumber}`;

        try {
          // Read and process the image
          const buffer = await sharp(imagePath)
            .resize(options.width, options.height, {
              fit: 'contain',
              background: { r: 255, g: 255, b: 255, alpha: 1 }
            })
            .jpeg({
              quality: 90,
              progressive: true
            })
            .toBuffer();

          results.push({
            filename: `${filename}.jpg`,
            buffer
          });
        } catch (error) {
          console.error(`Error processing page ${pageNumber}:`, error);
        }
      }

      return results;
    } catch (error) {
      console.error('Error processing PDF:', error);
      throw error;
    } finally {
      // Cleanup temp files
      await this.cleanup([pdfPath, outputDir]);
    }
  }

  private async downloadPdf(url: string, outputPath: string): Promise<void> {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to download PDF: ${response.status} ${response.statusText}`);
    }

    const buffer = await response.buffer();
    await fs.writeFile(outputPath, buffer);
  }

  private async convertPdfToImages(pdfPath: string, outputDir: string): Promise<void> {
    return new Promise((resolve, reject) => {
      // Use pdftoppm to convert PDF to images
      // Format: pdftoppm -jpeg -r 150 input.pdf output_prefix
      const outputPrefix = path.join(outputDir, 'page');
      
      const process = spawn('pdftoppm', [
        '-jpeg',
        '-r', '150', // 150 DPI for good quality
        pdfPath,
        outputPrefix
      ]);

      let stderr = '';

      process.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      process.on('close', (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`pdftoppm failed with code ${code}: ${stderr}`));
        }
      });

      process.on('error', (error) => {
        reject(new Error(`Failed to start pdftoppm: ${error.message}`));
      });
    });
  }

  private async cleanup(paths: string[]): Promise<void> {
    for (const p of paths) {
      try {
        const stat = await fs.stat(p);
        if (stat.isDirectory()) {
          await fs.rmdir(p, { recursive: true });
        } else {
          await fs.unlink(p);
        }
      } catch (error) {
        // Ignore cleanup errors
        console.warn(`Cleanup warning for ${p}:`, error);
      }
    }
  }
}

export const pdfProcessor = new PdfProcessor();
