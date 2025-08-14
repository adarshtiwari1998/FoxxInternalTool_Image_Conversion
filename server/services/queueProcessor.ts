import { EventEmitter } from 'events';
import { shopifyService } from './shopify';
import { imageProcessor } from './imageProcessor';
import JSZip from 'jszip';

export interface ProcessingItem {
  id: string;
  type: 'sku' | 'url';
  input: string; // SKU or URL
  status: 'pending' | 'processing' | 'completed' | 'failed';
  result?: {
    filename: string;
    buffer: Buffer;
    previewUrl?: string;
  };
  error?: string;
}

export interface BatchJob {
  id: string;
  items: ProcessingItem[];
  options: {
    dimensions: string;
    dpi: number;
  };
  status: 'pending' | 'processing' | 'completed' | 'failed';
  progress: {
    total: number;
    completed: number;
    failed: number;
  };
  startedAt?: Date;
  completedAt?: Date;
}

class QueueProcessor extends EventEmitter {
  private jobs = new Map<string, BatchJob>();
  private processingQueue: string[] = [];
  private isProcessing = false;
  private readonly BATCH_SIZE = 5; // Process 5 items at a time
  private readonly CONCURRENT_BATCHES = 2; // Process 2 batches simultaneously

  constructor() {
    super();
  }

  async addBatchJob(items: Array<{ type: 'sku' | 'url'; input: string }>, options: { dimensions: string; dpi: number }): Promise<string> {
    const jobId = `job_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    const processingItems: ProcessingItem[] = items.map((item, index) => ({
      id: `${jobId}_item_${index}`,
      type: item.type,
      input: item.input,
      status: 'pending'
    }));

    const job: BatchJob = {
      id: jobId,
      items: processingItems,
      options,
      status: 'pending',
      progress: {
        total: items.length,
        completed: 0,
        failed: 0
      }
    };

    this.jobs.set(jobId, job);
    this.processingQueue.push(jobId);
    
    console.log(`🚀 Added job ${jobId} with ${items.length} items to queue`);
    
    // Start processing if not already running
    if (!this.isProcessing) {
      this.startProcessing();
    }

    return jobId;
  }

  getJob(jobId: string): BatchJob | undefined {
    return this.jobs.get(jobId);
  }

  private async startProcessing() {
    if (this.isProcessing || this.processingQueue.length === 0) {
      return;
    }

    this.isProcessing = true;
    console.log(`🔄 Starting queue processor`);

    while (this.processingQueue.length > 0) {
      const jobId = this.processingQueue.shift()!;
      const job = this.jobs.get(jobId);
      
      if (!job) continue;

      await this.processJob(job);
    }

    this.isProcessing = false;
    console.log(`✅ Queue processing completed`);
  }

  private async processJob(job: BatchJob) {
    console.log(`📋 Processing job ${job.id} with ${job.items.length} items`);
    
    job.status = 'processing';
    job.startedAt = new Date();
    this.emit('jobProgress', job);

    // Split items into batches
    const batches = this.createBatches(job.items, this.BATCH_SIZE);
    console.log(`📦 Split into ${batches.length} batches of max ${this.BATCH_SIZE} items`);

    // Process batches concurrently
    const batchPromises = batches.map((batch, index) => 
      this.processBatch(job, batch, index)
    );

    try {
      await Promise.all(batchPromises);
      job.status = 'completed';
      job.completedAt = new Date();
      console.log(`✅ Job ${job.id} completed successfully`);
    } catch (error) {
      job.status = 'failed';
      console.error(`❌ Job ${job.id} failed:`, error);
    }

    this.emit('jobProgress', job);
  }

  private async processBatch(job: BatchJob, batch: ProcessingItem[], batchIndex: number) {
    console.log(`🔄 Processing batch ${batchIndex + 1} with ${batch.length} items`);

    const { width, height } = imageProcessor.parseDimensions(job.options.dimensions);

    // Process items in this batch concurrently
    const itemPromises = batch.map(item => this.processItem(job, item, width, height, job.options.dpi));
    await Promise.all(itemPromises);

    console.log(`✅ Completed batch ${batchIndex + 1}`);
  }

  private async processItem(job: BatchJob, item: ProcessingItem, width: number, height: number, dpi: number) {
    try {
      console.log(`🖼️ Processing ${item.type}: ${item.input}`);
      item.status = 'processing';
      this.emit('itemProgress', { jobId: job.id, item });

      let imageUrl: string;
      let filename: string;

      if (item.type === 'sku') {
        // Get product from Shopify
        const product = await shopifyService.getProductBySku(item.input);
        if (!product || !product.images.length) {
          throw new Error(`Product or image not found for SKU: ${item.input}`);
        }
        imageUrl = product.images[0].src;
        filename = item.input;
      } else {
        // Direct URL
        imageUrl = item.input;
        filename = this.extractFilenameFromUrl(item.input) || `url-image-${Date.now()}`;
      }

      // Process the image
      const processedBuffer = await imageProcessor.processImage(imageUrl, {
        width,
        height,
        dpi,
        filename
      });

      item.result = {
        filename: `${filename}.jpg`,
        buffer: processedBuffer,
        previewUrl: `data:image/jpeg;base64,${processedBuffer.toString('base64')}`
      };

      item.status = 'completed';
      job.progress.completed++;
      
      console.log(`✅ Completed ${item.type}: ${item.input}`);

    } catch (error) {
      console.error(`❌ Failed ${item.type}: ${item.input}`, error);
      item.status = 'failed';
      item.error = error instanceof Error ? error.message : 'Unknown error';
      job.progress.failed++;
    }

    this.emit('itemProgress', { jobId: job.id, item });
  }

  private createBatches<T>(array: T[], batchSize: number): T[][] {
    const batches: T[][] = [];
    for (let i = 0; i < array.length; i += batchSize) {
      batches.push(array.slice(i, i + batchSize));
    }
    return batches;
  }

  private extractFilenameFromUrl(url: string): string | null {
    try {
      const urlObj = new URL(url);
      const pathname = urlObj.pathname;
      const segments = pathname.split('/');
      const lastSegment = segments[segments.length - 1];
      
      if (lastSegment && lastSegment.length > 0) {
        return lastSegment.replace(/\.[^.]*$/, '');
      }
      
      return urlObj.hostname.replace(/^www\./, '').replace(/\./g, '-');
    } catch {
      return null;
    }
  }

  async generateZipForJob(jobId: string): Promise<Buffer> {
    const job = this.jobs.get(jobId);
    if (!job) {
      throw new Error('Job not found');
    }

    const completedItems = job.items.filter(item => 
      item.status === 'completed' && item.result
    );

    if (completedItems.length === 0) {
      throw new Error('No completed items found');
    }

    const zip = new JSZip();
    
    completedItems.forEach(item => {
      if (item.result) {
        zip.file(item.result.filename, item.result.buffer);
      }
    });

    console.log(`📦 Generating ZIP for job ${jobId} with ${completedItems.length} files`);
    return await zip.generateAsync({ type: 'nodebuffer' });
  }

  // Clean up old jobs (call periodically)
  cleanupOldJobs(maxAgeMs: number = 24 * 60 * 60 * 1000) { // 24 hours default
    const now = Date.now();
    Array.from(this.jobs.entries()).forEach(([jobId, job]) => {
      const jobAge = job.completedAt ? now - job.completedAt.getTime() : now - (job.startedAt?.getTime() || now);
      if (jobAge > maxAgeMs) {
        this.jobs.delete(jobId);
        console.log(`🗑️ Cleaned up old job: ${jobId}`);
      }
    });
  }
}

export const queueProcessor = new QueueProcessor();