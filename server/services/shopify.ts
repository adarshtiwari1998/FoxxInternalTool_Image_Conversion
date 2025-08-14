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
      // Search for products with the specific SKU
      const response = await fetch(
        `${this.baseUrl}/products.json?limit=250`,
        { headers: this.headers }
      );

      if (!response.ok) {
        throw new Error(`Shopify API error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      
      // Find product with matching SKU in variants
      const product = data.products.find((p: any) => 
        p.variants.some((v: any) => v.sku === sku)
      );

      if (!product) {
        return null;
      }

      return shopifyProductSchema.parse(product);
    } catch (error) {
      console.error('Error fetching product by SKU:', error);
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
