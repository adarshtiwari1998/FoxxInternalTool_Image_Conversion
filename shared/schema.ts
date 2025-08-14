import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Job tracking for image processing
export const processingJobs = pgTable("processing_jobs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  type: text("type").notNull(), // 'sku' | 'pdf'
  status: text("status").notNull().default('pending'), // 'pending' | 'processing' | 'completed' | 'failed'
  input: text("input").notNull(), // SKU or PDF URL
  dimensions: text("dimensions").notNull(), // '342x427' | '600x600'
  dpi: integer("dpi").notNull().default(300),
  resultUrl: text("result_url"),
  errorMessage: text("error_message"),
  productTitle: text("product_title"),
  productImage: text("product_image"),
});

export const insertProcessingJobSchema = createInsertSchema(processingJobs).pick({
  type: true,
  input: true,
  dimensions: true,
  dpi: true,
});

// URL processing request
export const urlProcessingRequestSchema = z.object({
  url: z.string().url(),
  dimensions: z.enum(['342x427', '600x600']),
  dpi: z.number().min(72).max(1200),
});

export type UrlProcessingRequest = z.infer<typeof urlProcessingRequestSchema>;

export type InsertProcessingJob = z.infer<typeof insertProcessingJobSchema>;
export type ProcessingJob = typeof processingJobs.$inferSelect;

// Shopify product schema for API responses
export const shopifyProductSchema = z.object({
  id: z.number(),
  title: z.string(),
  handle: z.string(),
  variants: z.array(z.object({
    id: z.number(),
    sku: z.string(),
    title: z.string(),
  })),
  images: z.array(z.object({
    id: z.number(),
    src: z.string(),
    alt: z.string().nullable(),
  })),
});

export type ShopifyProduct = z.infer<typeof shopifyProductSchema>;

// Bulk processing request
export const bulkProcessingRequestSchema = z.object({
  skus: z.array(z.string()).min(1),
  dimensions: z.enum(['342x427', '600x600']),
  dpi: z.number().min(72).max(1200),
});

export type BulkProcessingRequest = z.infer<typeof bulkProcessingRequestSchema>;

// Mixed bulk processing request (SKUs + URLs)
export const bulkMixedProcessingRequestSchema = z.object({
  skus: z.array(z.string()).optional().default([]),
  urls: z.array(z.string().url()).optional().default([]),
  dimensions: z.enum(['342x427', '600x600']),
  dpi: z.number().min(72).max(1200),
}).refine(data => data.skus.length + data.urls.length >= 1, {
  message: "At least one SKU or URL is required"
});

export type BulkMixedProcessingRequest = z.infer<typeof bulkMixedProcessingRequestSchema>;

// PDF processing request  
export const pdfProcessingRequestSchema = z.object({
  url: z.string().url(),
  dimensions: z.enum(['original', '342x427', '600x600']),
});

export type PdfProcessingRequest = z.infer<typeof pdfProcessingRequestSchema>;
