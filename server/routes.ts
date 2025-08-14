import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { shopifyService } from "./services/shopify";
import { imageProcessor } from "./services/imageProcessor";
import { pdfProcessor } from "./services/pdfProcessor";
import { 
  insertProcessingJobSchema, 
  bulkProcessingRequestSchema,
  pdfProcessingRequestSchema
} from "@shared/schema";
import JSZip from 'jszip';

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
      const { width, height } = imageProcessor.parseDimensions(dimensions);
      const filename = 'document'; // Base filename for PDF pages
      
      const processedPages = await pdfProcessor.processPdf(url, {
        width,
        height,
        filename
      });

      // Create ZIP file
      const zip = new JSZip();
      processedPages.forEach(({ filename, buffer }) => {
        zip.file(filename, buffer);
      });

      const zipBuffer = await zip.generateAsync({ type: 'nodebuffer' });

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
  return httpServer;
}
