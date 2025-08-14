import { ShopifyProduct, shopifyProductSchema } from "@shared/schema";

const SHOPIFY_STORE = process.env.SHOPIFY_STORE_URL || process.env.STORE_URL || process.env.SHOPIFY_STORE;
const SHOPIFY_ACCESS_TOKEN = process.env.STORE_ACCESS_TOKEN || process.env.SHOPIFY_ACCESS_TOKEN;

export class ShopifyService {
  private baseUrl: string;
  private headers: Record<string, string>;
  private isConfigured: boolean;

  constructor() {
    this.isConfigured = !!(SHOPIFY_STORE && SHOPIFY_ACCESS_TOKEN);
    
    if (this.isConfigured && SHOPIFY_STORE && SHOPIFY_ACCESS_TOKEN) {
      this.baseUrl = `https://${SHOPIFY_STORE}/admin/api/2023-10`;
      this.headers = {
        'X-Shopify-Access-Token': SHOPIFY_ACCESS_TOKEN,
        'Content-Type': 'application/json',
      };
    } else {
      console.warn('⚠️  Shopify API not configured - missing SHOPIFY_STORE and/or SHOPIFY_ACCESS_TOKEN');
      this.baseUrl = '';
      this.headers = {};
    }
  }

  async getProductBySku(sku: string): Promise<ShopifyProduct | null> {
    if (!this.isConfigured) {
      throw new Error('Shopify API not configured. Please set SHOPIFY_STORE and SHOPIFY_ACCESS_TOKEN environment variables.');
    }
    
    try {
      console.log(`🔍 Searching for product with variant SKU: ${sku}`);
      
      // Try GraphQL first (more efficient)
      const graphqlResult = await this.searchProductBySkuGraphQL(sku);
      if (graphqlResult) {
        console.log(`✅ Found product via GraphQL: ${graphqlResult.title}`);
        return graphqlResult;
      }
      
      // Fallback to REST API with improved search
      console.log(`⚠️ GraphQL search failed, trying REST API fallback...`);
      return await this.searchProductBySkuRestImproved(sku);
    } catch (error) {
      console.error('Error fetching product by SKU:', error);
      throw error;
    }
  }

  private async searchProductBySkuGraphQL(sku: string): Promise<ShopifyProduct | null> {
    try {
      const query = `
        query productVariantsBySku($query: String!) {
          productVariants(first: 10, query: $query) {
            edges {
              node {
                id
                title
                sku
                price
                product {
                  id
                  title
                  handle
                  variants(first: 250) {
                    edges {
                      node {
                        id
                        title
                        sku
                      }
                    }
                  }
                  images(first: 10) {
                    edges {
                      node {
                        id
                        url
                        altText
                      }
                    }
                  }
                }
              }
            }
          }
        }
      `;

      const variables = {
        query: `sku:"${sku}"`
      };

      console.log(`📡 GraphQL query for SKU: ${sku}`);
      
      const response = await fetch(`${this.baseUrl}/graphql.json`, {
        method: 'POST',
        headers: this.headers,
        body: JSON.stringify({ query, variables })
      });

      if (!response.ok) {
        console.error(`❌ GraphQL API Error: ${response.status} ${response.statusText}`);
        return null;
      }

      const result = await response.json();
      
      if (result.errors) {
        console.error('❌ GraphQL errors:', result.errors);
        return null;
      }

      const variants = result.data?.productVariants?.edges || [];
      
      if (variants.length === 0) {
        console.log(`📭 No variants found with SKU: ${sku}`);
        return null;
      }

      // Get the first matching variant's product
      const variantNode = variants[0].node;
      const product = variantNode.product;
      
      console.log(`🎯 Found matching variant: ${variantNode.sku} in product: ${product.title}`);

      // Transform GraphQL response to match our schema
      const transformedProduct = {
        id: parseInt(product.id.replace('gid://shopify/Product/', '')),
        title: product.title,
        handle: product.handle,
        variants: product.variants.edges.map((v: any) => ({
          id: parseInt(v.node.id.replace('gid://shopify/ProductVariant/', '')),
          sku: v.node.sku,
          title: v.node.title,
        })),
        images: product.images.edges.map((img: any) => ({
          id: parseInt(img.node.id.replace('gid://shopify/ProductImage/', '')),
          src: img.node.url,
          alt: img.node.altText,
        })),
      };

      return shopifyProductSchema.parse(transformedProduct);
    } catch (error) {
      console.error('❌ GraphQL search error:', error);
      return null;
    }
  }

  async getSkuByImageUrl(imageUrl: string): Promise<string | null> {
    if (!this.isConfigured) {
      console.warn('⚠️ Shopify API not configured for image URL lookup');
      return null;
    }
    
    try {
      console.log(`🔍 Reverse lookup: Finding SKU for image URL: ${imageUrl}`);
      
      // Extract the core image identifier from URL for searching
      const imageIdentifier = this.extractImageIdentifier(imageUrl);
      if (!imageIdentifier) {
        console.log(`📭 Could not extract image identifier from URL`);
        return null;
      }
      
      console.log(`🏷️ Looking for products with image: ${imageIdentifier}`);
      
      const query = `
        query findProductByImage($query: String!) {
          products(first: 50, query: $query) {
            edges {
              node {
                id
                title
                handle
                variants(first: 10) {
                  edges {
                    node {
                      id
                      sku
                      title
                    }
                  }
                }
                images(first: 20) {
                  edges {
                    node {
                      id
                      url
                      altText
                    }
                  }
                }
              }
            }
          }
        }
      `;

      // Search by various patterns - try broader searches for Shopify products
      const searchQueries = [
        `title:*${imageIdentifier}*`,
        `product_type:*${imageIdentifier}*`,
        imageIdentifier,
        `"${imageIdentifier}"`,
        // Try searching for common product patterns
        `title:*Vactrap*`,
        `title:*EZBio*`
      ];

      for (const searchQuery of searchQueries) {
        console.log(`🔎 Trying search query: ${searchQuery}`);
        
        const variables = { query: searchQuery };
        
        const response = await fetch(`${this.baseUrl}/graphql.json`, {
          method: 'POST',
          headers: this.headers,
          body: JSON.stringify({ query, variables })
        });

        if (!response.ok) {
          console.error(`❌ GraphQL API Error: ${response.status}`);
          continue;
        }

        const result = await response.json();
        
        if (result.errors) {
          console.error('❌ GraphQL errors:', result.errors);
          continue;
        }

        const products = result.data?.products?.edges || [];
        console.log(`📦 Found ${products.length} products to check`);
        
        // Look through products to find one with matching image
        for (const productEdge of products) {
          const product = productEdge.node;
          console.log(`🔍 Checking product: ${product.title}`);
          
          // Check if any product image matches our URL
          for (const imageEdge of product.images.edges) {
            const productImage = imageEdge.node;
            console.log(`🖼️ Comparing with product image: ${productImage.url}`);
            
            // Compare image URLs (handle different CDN formats)
            if (this.imagesMatch(imageUrl, productImage.url)) {
              console.log(`✅ Found matching product: ${product.title}`);
              
              // Get the first variant with a SKU
              const firstVariantWithSku = product.variants.edges.find((v: any) => v.node.sku);
              if (firstVariantWithSku) {
                const foundSku = firstVariantWithSku.node.sku;
                console.log(`🎯 Found SKU: ${foundSku}`);
                return foundSku;
              }
            }
          }
        }
      }
      
      console.log(`📭 No SKU found for image URL`);
      return null;
      
    } catch (error) {
      console.error('❌ Error in reverse SKU lookup:', error);
      return null;
    }
  }

  private extractImageIdentifier(url: string): string | null {
    try {
      // Extract meaningful parts from Shopify URLs
      if (url.includes('/files/')) {
        const filenamePart = url.split('/files/')[1];
        if (filenamePart) {
          // Get the base name before dimensions and UUIDs
          return filenamePart
            .replace(/\.[^.]*$/, '') // Remove extension
            .replace(/-\d+x\d+.*$/, '') // Remove dimensions
            .replace(/-foxxlifesciences.*$/, '') // Remove store-specific parts
            .split('_')[0]; // Take first part before underscores
        }
      }
      
      // Fallback: extract filename from URL
      const pathname = new URL(url).pathname;
      const segments = pathname.split('/');
      const filename = segments[segments.length - 1];
      return filename.replace(/\.[^.]*$/, '').split('-')[0].split('_')[0];
      
    } catch (error) {
      return null;
    }
  }

  private imagesMatch(url1: string, url2: string): boolean {
    // Handle different CDN formats and compare core identifiers
    try {
      console.log(`🔗 Comparing URLs:`);
      console.log(`   Input: ${url1}`);
      console.log(`   Product: ${url2}`);
      
      // Direct URL comparison for exact matches (ignoring query parameters)
      const cleanUrl1 = url1.split('?')[0];
      const cleanUrl2 = url2.split('?')[0];
      
      if (cleanUrl1 === cleanUrl2) {
        console.log(`✅ Direct URL match (ignoring query params)`);
        return true;
      }
      
      // Compare core identifiers
      const id1 = this.extractImageIdentifier(url1);
      const id2 = this.extractImageIdentifier(url2);
      
      console.log(`   ID1: ${id1}`);
      console.log(`   ID2: ${id2}`);
      
      if (id1 && id2 && id1 === id2) {
        console.log(`✅ Image identifier match`);
        return true;
      }
      
      // Compare pathnames
      const path1 = new URL(url1).pathname;
      const path2 = new URL(url2).pathname;
      
      console.log(`   Path1: ${path1}`);
      console.log(`   Path2: ${path2}`);
      
      if (path1 === path2) {
        console.log(`✅ Pathname match`);
        return true;
      }
      
      // Look for filename matches in paths
      const filename1 = path1.split('/').pop()?.split('?')[0];
      const filename2 = path2.split('/').pop()?.split('?')[0];
      
      if (filename1 && filename2 && filename1 === filename2) {
        console.log(`✅ Filename match: ${filename1}`);
        return true;
      }
      
      console.log(`❌ No match found`);
      return false;
      
    } catch (error) {
      console.warn(`⚠️ Error comparing URLs:`, error);
      return false;
    }
  }

  private async searchProductBySkuRestImproved(sku: string): Promise<ShopifyProduct | null> {
    try {
      console.log(`Searching variants with REST API for SKU: ${sku}`);
      
      // Start with a simple search through products (first page)
      const limit = 250;
      let totalVariantsChecked = 0;
      
      console.log(`Fetching products to search for SKU: ${sku}`);
      
      const productsResponse = await fetch(
        `${this.baseUrl}/products.json?limit=${limit}&published_status=any`,
        { headers: this.headers }
      );

      if (!productsResponse.ok) {
        console.error(`Shopify API Error: ${productsResponse.status} ${productsResponse.statusText}`);
        const errorText = await productsResponse.text();
        console.error('Response body:', errorText);
        throw new Error(`Shopify API error: ${productsResponse.status} ${productsResponse.statusText}`);
      }

      const productsData = await productsResponse.json();
      
      if (!productsData.products || productsData.products.length === 0) {
        console.log(`No products found in store`);
        return null;
      }
      
      console.log(`Found ${productsData.products.length} products to search through`);
      
      // Search through all variants in all products
      for (const product of productsData.products) {
        if (product.variants && product.variants.length > 0) {
          totalVariantsChecked += product.variants.length;
          
          for (const variant of product.variants) {
            const variantSku = variant.sku?.trim?.() || '';
            const targetSku = sku.trim();
            
            // Try both exact match and case-insensitive match
            if (variantSku === targetSku || variantSku.toLowerCase() === targetSku.toLowerCase()) {
              console.log(`✅ FOUND! Variant with SKU ${variantSku} (searching for ${targetSku}) in product: ${product.title}`);
              console.log(`Product ID: ${product.id}, Variant ID: ${variant.id}`);
              
              return shopifyProductSchema.parse(product);
            }
            
            // Log a sample of SKUs for debugging (only first few to avoid spam)
            if (totalVariantsChecked < 50) {
              console.log(`Checking variant SKU: "${variantSku}" against target: "${targetSku}"`);
            }
          }
        }
      }
      
      console.log(`❌ SKU ${sku} not found after checking ${totalVariantsChecked} variants`);
      
      // Try searching more variants directly
      console.log(`Trying direct variants endpoint search for more variants...`);
      
      // Search through multiple pages of variants
      for (let variantPage = 1; variantPage <= 10; variantPage++) {
        console.log(`Checking variants page ${variantPage}...`);
        
        const variantsResponse = await fetch(
          `${this.baseUrl}/variants.json?limit=250&page=${variantPage}`,
          { headers: this.headers }
        );

        if (!variantsResponse.ok) {
          console.log(`Variants page ${variantPage} returned error: ${variantsResponse.status}`);
          break;
        }
        
        const variantsData = await variantsResponse.json();
        console.log(`Variants page ${variantPage}: Found ${variantsData.variants?.length || 0} variants`);
        
        if (!variantsData.variants || variantsData.variants.length === 0) {
          console.log(`No more variants at page ${variantPage}`);
          break;
        }
        
        const targetVariant = variantsData.variants?.find((v: any) => v.sku === sku);
        if (targetVariant) {
          console.log(`✅ Found variant via variants endpoint page ${variantPage}! Product ID: ${targetVariant.product_id}`);
          
          // Get the product details
          const productResponse = await fetch(
            `${this.baseUrl}/products/${targetVariant.product_id}.json`,
            { headers: this.headers }
          );
          
          if (productResponse.ok) {
            const productData = await productResponse.json();
            return shopifyProductSchema.parse(productData.product);
          }
        }
      }
      
      console.log(`Checking more products beyond first batch...`);
      // Try fetching more products - expand search significantly
      for (let productPage = 2; productPage <= 20; productPage++) {
        console.log(`Checking products page ${productPage}...`);
        
        const moreProductsResponse = await fetch(
          `${this.baseUrl}/products.json?limit=250&page=${productPage}&published_status=any`,
          { headers: this.headers }
        );

        if (!moreProductsResponse.ok) {
          console.log(`Products page ${productPage} returned error: ${moreProductsResponse.status}`);
          break;
        }

        const moreProductsData = await moreProductsResponse.json();
        
        if (!moreProductsData.products || moreProductsData.products.length === 0) {
          console.log(`No more products at page ${productPage}`);
          break;
        }
        
        console.log(`Products page ${productPage}: Found ${moreProductsData.products.length} products`);
        
        // Search through all variants in products on this page
        for (const product of moreProductsData.products) {
          if (product.variants && product.variants.length > 0) {
            for (const variant of product.variants) {
              if (variant.sku === sku) {
                console.log(`✅ FOUND! Variant with SKU ${sku} in product: ${product.title} (page ${productPage})`);
                return shopifyProductSchema.parse(product);
              }
            }
          }
        }
      }
      
      return null;
    } catch (error) {
      console.error('Error in REST API search:', error);
      throw error;
    }
  }

  async getMultipleProductsBySkus(skus: string[]): Promise<Record<string, ShopifyProduct | null>> {
    const results: Record<string, ShopifyProduct | null> = {};
    
    // Process SKUs in batches to avoid rate limits
    for (const sku of skus) {
      try {
        const product = await this.getProductBySku(sku);
        results[sku] = product;
        
        // Small delay to respect rate limits
        await new Promise(resolve => setTimeout(resolve, 100));
      } catch (error) {
        console.error(`Error fetching product for SKU ${sku}:`, error);
        results[sku] = null;
      }
    }

    return results;
  }

  async testConnection(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/products/count.json`, {
        headers: this.headers
      });
      return response.ok;
    } catch {
      return false;
    }
  }
}

export const shopifyService = new ShopifyService();
