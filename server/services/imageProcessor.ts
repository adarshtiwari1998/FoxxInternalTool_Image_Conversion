import sharp from 'sharp';
import fetch from 'node-fetch';

export interface ImageProcessingOptions {
  width: number;
  height: number;
  dpi: number;
  filename: string;
}

export class ImageProcessor {
  async processImage(imageUrl: string, options: ImageProcessingOptions): Promise<Buffer> {
    try {
      // Fetch the image
      const response = await fetch(imageUrl);
      if (!response.ok) {
        throw new Error(`Failed to fetch image: ${response.status} ${response.statusText}`);
      }

      const imageBuffer = await response.buffer();

      // Process with Sharp
      const processedBuffer = await sharp(imageBuffer)
        .resize(options.width, options.height, {
          fit: 'cover',
          position: 'center'
        })
        .jpeg({
          quality: this.getDpiQuality(options.dpi),
          progressive: true
        })
        .withMetadata({
          density: options.dpi
        })
        .toBuffer();

      return processedBuffer;
    } catch (error) {
      console.error('Error processing image:', error);
      throw error;
    }
  }

  async processMultipleImages(
    images: Array<{ url: string; options: ImageProcessingOptions }>
  ): Promise<Array<{ filename: string; buffer: Buffer }>> {
    const results: Array<{ filename: string; buffer: Buffer }> = [];

    for (const { url, options } of images) {
      try {
        const buffer = await this.processImage(url, options);
        results.push({
          filename: `${options.filename}.jpg`,
          buffer
        });
      } catch (error) {
        console.error(`Error processing image ${options.filename}:`, error);
        // Continue with other images even if one fails
      }
    }

    return results;
  }

  private getDpiQuality(dpi: number): number {
    if (dpi >= 1200) return 95;
    if (dpi >= 600) return 90;
    if (dpi >= 300) return 85;
    return 80;
  }

  parseDimensions(dimensionString: string): { width: number; height: number } {
    const [width, height] = dimensionString.split('x').map(Number);
    return { width, height };
  }
}

export const imageProcessor = new ImageProcessor();
