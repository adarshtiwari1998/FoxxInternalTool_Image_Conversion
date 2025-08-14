import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { shopifyService } from "./services/shopify";
import { imageProcessor } from "./services/imageProcessor";
import { pdfProcessor } from "./services/pdfProcessor";
import { queueProcessor } from "./services/queueProcessor";
import { 
  insertProcessingJobSchema, 
  bulkProcessingRequestSchema,
  bulkMixedProcessingRequestSchema,
  pdfProcessingRequestSchema,
  urlProcessingRequestSchema
} from "@shared/schema";
import JSZip from 'jszip';

// Helper function to extract meaningful filename from URL
async function extractFilenameFromUrl(url: string): Promise<string | null> {
  try {
    const urlObj = new URL(url);
    const pathname = urlObj.pathname;
    
    console.log(`🔍 Extracting filename from URL: ${url}`);
    console.log(`📂 Pathname: ${pathname}`);
    
    // Try reverse SKU lookup first for Shopify URLs
    if (pathname.includes('/files/') || pathname.includes('/cdn/shop/')) {
      console.log(`🔍 Attempting reverse SKU lookup for Shopify image...`);
      const foundSku = await shopifyService.getSkuByImageUrl(url);
      if (foundSku) {
        console.log(`🎯 Using SKU from reverse lookup: ${foundSku}`);
        return foundSku;
      }
    }
    
    // Handle Shopify CDN URLs - extract product info if possible  
    if (pathname.includes('/files/') || pathname.includes('/cdn/shop/')) {
      // Extract product name from Shopify CDN URLs like:
      // /cdn/shop/files/Vactraps_S_2L-800x800-foxxlifesciences_6fbb6068-bbb8-4fb8-81a4-3c14cab08830_1024x1024.png
      let filenamePart = '';
      
      if (pathname.includes('/files/')) {
        filenamePart = pathname.split('/files/')[1];
      }
      
      console.log(`📄 Filename part: ${filenamePart}`);
      
      if (filenamePart) {
        // Step by step cleaning
        let cleanName = filenamePart;
        
        // Remove file extension first
        cleanName = cleanName.replace(/\.[^.]*$/, '');
        console.log(`🧹 After extension removal: ${cleanName}`);
        
        // Remove dimensions pattern (like -800x800)
        cleanName = cleanName.replace(/-\d+x\d+/g, '');
        console.log(`📏 After dimensions removal: ${cleanName}`);
        
        // Remove foxxlifesciences and UUID parts
        cleanName = cleanName.replace(/-foxxlifesciences_[a-f0-9-_]+/g, '');
        console.log(`🏷️  After foxxlifesciences removal: ${cleanName}`);
        
        // Remove UUID patterns
        cleanName = cleanName.replace(/_[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/g, '');
        cleanName = cleanName.replace(/_\d+x\d+$/g, ''); // Remove trailing dimensions like _1024x1024
        console.log(`🆔 After UUID removal: ${cleanName}`);
        
        // Clean up remaining artifacts
        cleanName = cleanName.replace(/[-_]+$/, '').replace(/^[-_]+/, ''); // Remove trailing/leading separators
        cleanName = cleanName.replace(/[-_]+/g, '-'); // Normalize separators
        
        console.log(`✨ Final clean name: ${cleanName}`);
        
        if (cleanName && cleanName.length > 2) {
          return cleanName;
        }
      }
    }
    
    // For other URLs, extract filename from path
    const segments = pathname.split('/');
    const lastSegment = segments[segments.length - 1];
    
    if (lastSegment && lastSegment.length > 0) {
      // Remove file extension for cleaner name
      const nameWithoutExt = lastSegment.replace(/\.[^.]*$/, '');
      console.log(`📁 Extracted from path: ${nameWithoutExt}`);
      if (nameWithoutExt && nameWithoutExt.length > 0) {
        return nameWithoutExt;
      }
    }
    
    // Fallback to domain name if no good filename found
    const fallback = urlObj.hostname.replace(/^www\./, '').replace(/\./g, '-');
    console.log(`🔄 Using fallback: ${fallback}`);
    return fallback;
    
  } catch (error) {
    console.warn('❌ Failed to extract filename from URL:', url, error);
    return null;
  }
}

export async function registerRoutes(app: Express): Promise<Server> {
  
  // Health check endpoint
  app.get("/api/health", async (req, res) => {
    try {
      const shopifyConnected = await shopifyService.testConnection();
      res.json({
        status: "ok",
        services: {
          shopify: shopifyConnected ? "connected" : "disconnected",
          imageProcessing: "online",
          pdfConverter: "ready"
        }
      });
    } catch (error) {
      res.status(500).json({ error: "Health check failed" });
    }
  });

  // Get product by SKU
  app.get("/api/product/:sku", async (req, res) => {
    try {
      const { sku } = req.params;
      const product = await shopifyService.getProductBySku(sku);
      
      if (!product) {
        return res.status(404).json({ error: "Product not found" });
      }

      res.json(product);
    } catch (error) {
      console.error("Error fetching product:", error);
      res.status(500).json({ error: "Failed to fetch product" });
    }
  });

  // Process single SKU
  app.post("/api/process-sku", async (req, res) => {
    try {
      const { sku, dimensions, dpi } = req.body;
      
      // Validate input
      if (!sku || !dimensions || !dpi) {
        return res.status(400).json({ error: "Missing required fields" });
      }

      // Get product from Shopify
      const product = await shopifyService.getProductBySku(sku);
      if (!product || !product.images.length) {
        return res.status(404).json({ error: "Product or image not found" });
      }

      // Create processing job
      const job = await storage.createProcessingJob({
        type: 'sku',
        input: sku,
        dimensions,
        dpi: Number(dpi)
      });

      // Update job with product info
      await storage.updateProcessingJob(job.id, {
        productTitle: product.title,
        productImage: product.images[0].src,
        status: 'processing'
      });

      // Process image
      const { width, height } = imageProcessor.parseDimensions(dimensions);
      const processedImage = await imageProcessor.processImage(product.images[0].src, {
        width,
        height,
        dpi: Number(dpi),
        filename: sku
      });

      // Update job as completed
      await storage.updateProcessingJob(job.id, {
        status: 'completed'
      });

      // Return processed image
      res.setHeader('Content-Type', 'image/jpeg');
      res.setHeader('Content-Disposition', `attachment; filename="${sku}.jpg"`);
      res.send(processedImage);

    } catch (error) {
      console.error("Error processing SKU:", error);
      res.status(500).json({ error: "Failed to process image" });
    }
  });

  // Process single URL
  app.post("/api/process-url", async (req, res) => {
    try {
      const validatedData = urlProcessingRequestSchema.parse(req.body);
      const { url, dimensions, dpi } = validatedData;

      // Create processing job
      const job = await storage.createProcessingJob({
        type: 'url',
        input: url,
        dimensions,
        dpi: Number(dpi)
      });

      await storage.updateProcessingJob(job.id, {
        status: 'processing'
      });

      // Process image
      const { width, height } = imageProcessor.parseDimensions(dimensions);
      const filename = await extractFilenameFromUrl(url) || `converted-image-${Date.now()}`;
      
      const processedImage = await imageProcessor.processImage(url, {
        width,
        height,
        dpi: Number(dpi),
        filename
      });

      // Update job as completed
      await storage.updateProcessingJob(job.id, {
        status: 'completed'
      });

      // Return processed image
      console.log(`📁 Setting download filename: ${filename}.jpg`);
      res.setHeader('Content-Type', 'image/jpeg');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}.jpg"`);
      res.send(processedImage);

    } catch (error) {
      console.error("Error processing URL:", error);
      res.status(500).json({ error: "Failed to process image" });
    }
  });

  // Process bulk SKUs
  app.post("/api/process-bulk", async (req, res) => {
    try {
      const validatedData = bulkProcessingRequestSchema.parse(req.body);
      const { skus, dimensions, dpi } = validatedData;

      // Get all products
      const products = await shopifyService.getMultipleProductsBySkus(skus);
      
      // Prepare images for processing
      const imagesToProcess: Array<{ url: string; options: any }> = [];
      
      for (const [sku, product] of Object.entries(products)) {
        if (product && product.images.length > 0) {
          const { width, height } = imageProcessor.parseDimensions(dimensions);
          imagesToProcess.push({
            url: product.images[0].src,
            options: {
              width,
              height,
              dpi,
              filename: sku
            }
          });
        }
      }

      // Process all images
      const processedImages = await imageProcessor.processMultipleImages(imagesToProcess);

      // Create ZIP file
      const zip = new JSZip();
      processedImages.forEach(({ filename, buffer }) => {
        zip.file(filename, buffer);
      });

      const zipBuffer = await zip.generateAsync({ type: 'nodebuffer' });

      // Send ZIP file
      res.setHeader('Content-Type', 'application/zip');
      res.setHeader('Content-Disposition', 'attachment; filename="processed-images.zip"');
      res.send(zipBuffer);

    } catch (error) {
      console.error("Error processing bulk SKUs:", error);
      res.status(500).json({ error: "Failed to process bulk images" });
    }
  });

  // Start batch processing job (queue-based)
  app.post("/api/start-batch-job", async (req, res) => {
    try {
      const validatedData = bulkMixedProcessingRequestSchema.parse(req.body);
      const { skus = [], urls = [], dimensions, dpi } = validatedData;

      console.log(`🚀 Starting batch job: ${skus.length} SKUs + ${urls.length} URLs (optimized for up to 30 items)`);

      // Prepare items for queue
      const items: Array<{ type: 'sku' | 'url'; input: string }> = [];
      
      skus.forEach(sku => items.push({ type: 'sku', input: sku }));
      urls.forEach(url => items.push({ type: 'url', input: url }));

      if (items.length === 0) {
        return res.status(400).json({ error: "No valid items to process" });
      }

      if (items.length > 30) {
        return res.status(400).json({ error: "Maximum 30 items allowed per batch for optimal performance" });
      }

      // Add to queue
      const jobId = await queueProcessor.addBatchJob(items, { dimensions, dpi });

      console.log(`✅ Created batch job: ${jobId}`);
      res.json({ jobId, message: "Batch job started" });

    } catch (error) {
      console.error("Error starting batch job:", error);
      res.status(500).json({ error: "Failed to start batch job" });
    }
  });

  // Get batch job status
  app.get("/api/batch-job/:jobId", async (req, res) => {
    try {
      const { jobId } = req.params;
      const job = queueProcessor.getJob(jobId);
      
      if (!job) {
        return res.status(404).json({ error: "Job not found" });
      }

      res.json({
        id: job.id,
        status: job.status,
        progress: job.progress,
        items: job.items.map(item => ({
          id: item.id,
          type: item.type,
          input: item.input,
          status: item.status,
          result: item.result ? {
            filename: item.result.filename,
            previewUrl: item.result.previewUrl
          } : undefined,
          error: item.error
        })),
        startedAt: job.startedAt,
        completedAt: job.completedAt
      });

    } catch (error) {
      console.error("Error getting batch job:", error);
      res.status(500).json({ error: "Failed to get batch job" });
    }
  });

  // Download batch job results as ZIP
  app.get("/api/batch-job/:jobId/download", async (req, res) => {
    try {
      const { jobId } = req.params;
      const job = queueProcessor.getJob(jobId);
      
      if (!job) {
        return res.status(404).json({ error: "Job not found" });
      }

      if (job.progress.completed === 0) {
        return res.status(400).json({ error: "No completed items to download" });
      }

      const zipBuffer = await queueProcessor.generateZipForJob(jobId);

      res.setHeader('Content-Type', 'application/zip');
      res.setHeader('Content-Disposition', `attachment; filename="batch-${jobId}.zip"`);
      res.send(zipBuffer);

    } catch (error) {
      console.error("Error downloading batch job:", error);
      res.status(500).json({ error: "Failed to download batch job" });
    }
  });

  // Process PDF
  app.post("/api/process-pdf", async (req, res) => {
    try {
      const validatedData = pdfProcessingRequestSchema.parse(req.body);
      const { url, dimensions } = validatedData;

      // Create processing job
      const job = await storage.createProcessingJob({
        type: 'pdf',
        input: url,
        dimensions,
        dpi: 150 // Default for PDF
      });

      await storage.updateProcessingJob(job.id, { status: 'processing' });

      // Process PDF
      let processOptions;
      if (dimensions === 'original') {
        processOptions = {
          filename: 'document'
        };
      } else {
        const { width, height } = imageProcessor.parseDimensions(dimensions);
        processOptions = {
          width,
          height,
          filename: 'document'
        };
      }
      
      const processedPages = await pdfProcessor.processPdf(url, processOptions);

      // Create ZIP file
      console.log(`📦 Creating ZIP with ${processedPages.length} pages...`);
      const zip = new JSZip();
      processedPages.forEach(({ filename, buffer }) => {
        console.log(`📄 Adding to ZIP: ${filename} (${buffer.length} bytes)`);
        zip.file(filename, buffer);
      });

      console.log(`🗜️ Generating ZIP buffer...`);
      const zipBuffer = await zip.generateAsync({ 
        type: 'nodebuffer',
        compression: 'DEFLATE',
        compressionOptions: {
          level: 6
        }
      });

      console.log(`✅ ZIP created: ${zipBuffer.length} bytes`);

      await storage.updateProcessingJob(job.id, { status: 'completed' });

      // Send ZIP file
      res.setHeader('Content-Type', 'application/zip');
      res.setHeader('Content-Disposition', 'attachment; filename="pdf-pages.zip"');
      res.send(zipBuffer);

    } catch (error) {
      console.error("Error processing PDF:", error);
      res.status(500).json({ error: "Failed to process PDF" });
    }
  });

  // Get processing job status
  app.get("/api/job/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const job = await storage.getProcessingJob(id);
      
      if (!job) {
        return res.status(404).json({ error: "Job not found" });
      }

      res.json(job);
    } catch (error) {
      console.error("Error getting job:", error);
      res.status(500).json({ error: "Failed to get job status" });
    }
  });

  const httpServer = createServer(app);
  
  // Setup Server-Sent Events for real-time updates (avoids WebSocket conflicts)
  const clients = new Map<string, Set<any>>(); // jobId -> Set of SSE connections
  
  // SSE endpoint for job progress
  app.get('/api/events/:jobId', (req, res) => {
    const { jobId } = req.params;
    
    // Set SSE headers
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Cache-Control'
    });
    
    // Add client to job subscription
    if (!clients.has(jobId)) {
      clients.set(jobId, new Set());
    }
    clients.get(jobId)!.add(res);
    
    console.log(`📡 SSE client subscribed to job: ${jobId} (${clients.get(jobId)!.size} total clients)`);
    
    // Send initial heartbeat
    res.write('data: {"type":"connected"}\n\n');
    
    // Send current job status if available
    const job = queueProcessor.getJob(jobId);
    if (job) {
      console.log(`📤 Sending initial job status to new client`);
      const data = JSON.stringify({
        type: 'jobProgress',
        job: {
          id: job.id,
          status: job.status,
          progress: job.progress
        }
      });
      res.write(`data: ${data}\n\n`);
    }
    
    // Clean up on client disconnect
    req.on('close', () => {
      const jobClients = clients.get(jobId);
      if (jobClients) {
        jobClients.delete(res);
        if (jobClients.size === 0) {
          clients.delete(jobId);
        }
      }
      console.log(`🔌 SSE client disconnected from job: ${jobId}`);
    });
  });
  
  // Listen to queue processor events and broadcast to SSE clients
  queueProcessor.on('jobProgress', (job) => {
    console.log(`📡 Broadcasting job progress for ${job.id}: ${job.progress.completed}/${job.progress.total}`);
    const jobClients = clients.get(job.id);
    if (jobClients && jobClients.size > 0) {
      const data = JSON.stringify({
        type: 'jobProgress',
        job: {
          id: job.id,
          status: job.status,
          progress: job.progress
        }
      });
      
      console.log(`📤 Sending to ${jobClients.size} clients:`, data);
      jobClients.forEach(client => {
        try {
          client.write(`data: ${data}\n\n`);
        } catch (error) {
          console.error('❌ Error sending SSE:', error);
          jobClients.delete(client);
        }
      });
    } else {
      console.log('⚠️  No clients connected for job:', job.id);
    }
  });
  
  queueProcessor.on('itemProgress', ({ jobId, item }) => {
    console.log(`📡 Broadcasting item progress for ${jobId}: ${item.input} -> ${item.status}`);
    const jobClients = clients.get(jobId);
    if (jobClients && jobClients.size > 0) {
      const data = JSON.stringify({
        type: 'itemProgress',
        jobId,
        item: {
          id: item.id,
          type: item.type,
          input: item.input,
          status: item.status,
          result: item.result ? {
            filename: item.result.filename,
            previewUrl: item.result.previewUrl
          } : undefined,
          error: item.error
        }
      });
      
      console.log(`📤 Sending item update to ${jobClients.size} clients`);
      jobClients.forEach(client => {
        try {
          client.write(`data: ${data}\n\n`);
        } catch (error) {
          console.error('❌ Error sending SSE item update:', error);
          jobClients.delete(client);
        }
      });
    } else {
      console.log('⚠️  No clients connected for item update:', jobId);
    }
  });
  
  return httpServer;
}
