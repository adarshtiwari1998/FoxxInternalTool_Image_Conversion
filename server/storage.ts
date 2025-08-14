import { type ProcessingJob, type InsertProcessingJob } from "@shared/schema";
import { randomUUID } from "crypto";

export interface IStorage {
  createProcessingJob(job: InsertProcessingJob): Promise<ProcessingJob>;
  getProcessingJob(id: string): Promise<ProcessingJob | undefined>;
  updateProcessingJob(id: string, updates: Partial<ProcessingJob>): Promise<ProcessingJob | undefined>;
  getProcessingJobsByStatus(status: string): Promise<ProcessingJob[]>;
  deleteProcessingJob(id: string): Promise<boolean>;
}

export class MemStorage implements IStorage {
  private jobs: Map<string, ProcessingJob>;

  constructor() {
    this.jobs = new Map();
  }

  async createProcessingJob(insertJob: InsertProcessingJob): Promise<ProcessingJob> {
    const id = randomUUID();
    const job: ProcessingJob = {
      ...insertJob,
      dpi: insertJob.dpi || 300,
      id,
      status: 'pending',
      resultUrl: null,
      errorMessage: null,
      productTitle: null,
      productImage: null,
    };
    this.jobs.set(id, job);
    return job;
  }

  async getProcessingJob(id: string): Promise<ProcessingJob | undefined> {
    return this.jobs.get(id);
  }

  async updateProcessingJob(id: string, updates: Partial<ProcessingJob>): Promise<ProcessingJob | undefined> {
    const job = this.jobs.get(id);
    if (!job) return undefined;
    
    const updatedJob = { ...job, ...updates };
    this.jobs.set(id, updatedJob);
    return updatedJob;
  }

  async getProcessingJobsByStatus(status: string): Promise<ProcessingJob[]> {
    return Array.from(this.jobs.values()).filter(job => job.status === status);
  }

  async deleteProcessingJob(id: string): Promise<boolean> {
    return this.jobs.delete(id);
  }
}

export const storage = new MemStorage();
