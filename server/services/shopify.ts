import { ShopifyProduct, shopifyProductSchema } from "@shared/schema";

const SHOPIFY_STORE = process.env.STORE_URL || process.env.SHOPIFY_STORE;
const SHOPIFY_ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;

export class ShopifyService {
  private baseUrl: string;
  private headers: Record<string, string>;

  constructor() {
    if (!SHOPIFY_STORE || !SHOPIFY_ACCESS_TOKEN) {
      throw new Error('Missing required Shopify environment variables: SHOPIFY_STORE and SHOPIFY_ACCESS_TOKEN');
    }
    
    this.baseUrl = `https://${SHOPIFY_STORE}/admin/api/2023-10`;
    this.headers = {
      'X-Shopify-Access-Token': SHOPIFY_ACCESS_TOKEN,
      'Content-Type': 'application/json',
    };
  }

  async getProductBySku(sku: string): Promise<ShopifyProduct | null> {
    try {
      console.log(`Searching for product with variant SKU: ${sku}`);
      return await this.searchProductBySkuRest(sku);
    } catch (error) {
      console.error('Error fetching product by SKU:', error);
      throw error;
    }
  }

  private async searchProductBySkuRest(sku: string): Promise<ShopifyProduct | null> {
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
