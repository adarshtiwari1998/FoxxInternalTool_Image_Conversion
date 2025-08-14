# Overview

This is an image processing and conversion application that provides internal tooling for Foxx Life Sciences. The system allows users to convert product images from Shopify SKUs and extract pages from PDF documents, transforming them into specific image formats and dimensions for business use. The application features a React frontend with a clean, professional interface and an Express.js backend that handles image processing workflows.

## Current Status
- ✅ Complete application built with SKU and PDF processing
- ✅ Shopify API integration implemented  
- ✅ Image processing with Sharp library
- ✅ PDF to image conversion with poppler
- ⚠️ **Requires SHOPIFY_STORE environment variable to be set to "shopfls.myshopify.com"**
- ✅ SHOPIFY_ACCESS_TOKEN configured

# User Preferences

Preferred communication style: Simple, everyday language.

# System Architecture

## Frontend Architecture
- **React with TypeScript**: Modern React application using functional components and hooks
- **Vite Build System**: Fast development server and build tool with hot module replacement
- **Wouter Routing**: Lightweight client-side routing library for navigation
- **Tailwind CSS + shadcn/ui**: Utility-first CSS framework with pre-built component library
- **TanStack Query**: Powerful data fetching and state management for API interactions
- **Component Structure**: Modular design with separate components for SKU conversion, PDF processing, and system status

## Backend Architecture
- **Express.js Server**: RESTful API server handling image processing requests
- **Service Layer Pattern**: Separated business logic into dedicated services (Shopify, ImageProcessor, PdfProcessor)
- **In-Memory Storage**: Simple storage implementation for job tracking (designed to be easily replaceable with persistent storage)
- **Error Handling**: Centralized error handling middleware with structured error responses
- **Request Logging**: Custom middleware for API request/response logging and performance monitoring

## Data Storage Solutions
- **Database Schema**: Drizzle ORM with PostgreSQL schema for processing job tracking
- **Job Management**: Processing jobs table with status tracking, error handling, and result storage
- **In-Memory Fallback**: Memory-based storage implementation for development and testing

## Authentication and Authorization
- **No Authentication**: Currently operates as an internal tool without user authentication
- **Environment-Based Security**: Shopify API credentials managed through environment variables
- **CORS Configuration**: Basic cross-origin request handling for development

## Image Processing Pipeline
- **Sharp Library**: High-performance image processing for resizing, format conversion, and quality optimization
- **PDF Conversion**: Uses pdftoppm system utility to convert PDF pages to images
- **Batch Processing**: Support for bulk SKU processing with ZIP file downloads
- **Quality Control**: DPI-based quality settings and dimension-specific optimization

## External Dependencies

### Third-Party Services
- **Shopify Admin API**: Integration for product catalog access and SKU-based image retrieval
- **Neon Database**: PostgreSQL hosting service for production data storage

### System Dependencies
- **pdftoppm**: System utility for PDF to image conversion (requires poppler-utils installation)
- **Sharp**: Native image processing library with optimized performance
- **Node.js Runtime**: ESM module support with TypeScript compilation

### Development Tools
- **Drizzle Kit**: Database schema management and migration tools
- **ESBuild**: Fast JavaScript bundler for production builds
- **TSX**: TypeScript execution for development server

### UI Component Libraries
- **Radix UI**: Accessible, unstyled UI primitives for complex components
- **Lucide React**: Icon library with consistent styling
- **Class Variance Authority**: Utility for managing component variants and styling