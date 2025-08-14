import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Loader2, Download, Image as ImageIcon } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

interface Product {
  id: number;
  title: string;
  images: Array<{ src: string; alt: string | null }>;
}

export default function SkuConverter() {
  const [mode, setMode] = useState<"single" | "bulk">("single");
  const [singleSku, setSingleSku] = useState("");
  const [bulkSkus, setBulkSkus] = useState("");
  const [dimensions, setDimensions] = useState("342x427");
  const [dpi, setDpi] = useState("300");
  const [currentProduct, setCurrentProduct] = useState<Product | null>(null);
  const { toast } = useToast();

  // Fetch product by SKU
  const { data: product, isLoading: fetchingProduct, refetch: fetchProduct } = useQuery({
    queryKey: ['/api/product', singleSku],
    enabled: false,
  });

  // Process single SKU mutation
  const processSingleMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest('POST', '/api/process-sku', {
        sku: singleSku,
        dimensions,
        dpi: Number(dpi)
      });
      return response;
    },
    onSuccess: async (response) => {
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${singleSku}.jpg`;
      a.click();
      window.URL.revokeObjectURL(url);
      
      toast({
        title: "Success!",
        description: "Image processed and downloaded successfully",
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: "Failed to process image",
        variant: "destructive",
      });
    }
  });

  // Process bulk SKUs mutation
  const processBulkMutation = useMutation({
    mutationFn: async () => {
      const skus = bulkSkus.split('\n').filter(sku => sku.trim()).slice(0, 10);
      const response = await apiRequest('POST', '/api/process-bulk', {
        skus,
        dimensions,
        dpi: Number(dpi)
      });
      return response;
    },
    onSuccess: async (response) => {
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'processed-images.zip';
      a.click();
      window.URL.revokeObjectURL(url);
      
      toast({
        title: "Success!",
        description: "Images processed and downloaded as ZIP",
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: "Failed to process bulk images",
        variant: "destructive",
      });
    }
  });

  const handleFetchProduct = async () => {
    if (!singleSku.trim()) {
      toast({
        title: "Error",
        description: "Please enter a SKU",
        variant: "destructive",
      });
      return;
    }
    
    try {
      const result = await fetchProduct();
      if (result.data) {
        setCurrentProduct(result.data);
        toast({
          title: "Product found!",
          description: `Loaded ${result.data.title}`,
        });
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Product not found or failed to fetch",
        variant: "destructive",
      });
      setCurrentProduct(null);
    }
  };

  const handleProcess = () => {
    if (mode === "single") {
      if (!singleSku.trim()) {
        toast({
          title: "Error",
          description: "Please enter a SKU",
          variant: "destructive",
        });
        return;
      }
      processSingleMutation.mutate();
    } else {
      const skus = bulkSkus.split('\n').filter(sku => sku.trim());
      if (skus.length === 0) {
        toast({
          title: "Error", 
          description: "Please enter at least one SKU",
          variant: "destructive",
        });
        return;
      }
      if (skus.length > 10) {
        toast({
          title: "Error",
          description: "Maximum 10 SKUs allowed for bulk processing",
          variant: "destructive",
        });
        return;
      }
      processBulkMutation.mutate();
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
      {/* Configuration Panel */}
      <Card>
        <CardHeader>
          <CardTitle>Configuration</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Processing Mode */}
          <div>
            <Label className="text-sm font-medium">Processing Mode</Label>
            <RadioGroup 
              value={mode} 
              onValueChange={(value: "single" | "bulk") => setMode(value)}
              className="flex items-center space-x-4 mt-2"
            >
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="single" id="single" />
                <Label htmlFor="single">Single SKU</Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="bulk" id="bulk" />
                <Label htmlFor="bulk">Bulk (up to 10)</Label>
              </div>
            </RadioGroup>
          </div>

          {/* Single SKU Input */}
          {mode === "single" && (
            <div>
              <Label htmlFor="single-sku">Product SKU</Label>
              <div className="flex space-x-2 mt-2">
                <Input
                  id="single-sku"
                  placeholder="e.g., 66P-00022N-FLS"
                  value={singleSku}
                  onChange={(e) => setSingleSku(e.target.value)}
                />
                <Button onClick={handleFetchProduct} disabled={fetchingProduct}>
                  {fetchingProduct ? <Loader2 className="h-4 w-4 animate-spin" /> : "Fetch"}
                </Button>
              </div>
            </div>
          )}

          {/* Bulk SKU Input */}
          {mode === "bulk" && (
            <div>
              <Label htmlFor="bulk-skus">Product SKUs (one per line, max 10)</Label>
              <Textarea
                id="bulk-skus"
                placeholder="66P-00022N-FLS&#10;66P-00023N-FLS&#10;..."
                rows={6}
                value={bulkSkus}
                onChange={(e) => setBulkSkus(e.target.value)}
                className="mt-2"
              />
              <p className="text-xs text-gray-500 mt-1">Enter one SKU per line</p>
            </div>
          )}

          {/* Dimensions */}
          <div>
            <Label className="text-sm font-medium mb-3 block">Output Dimensions</Label>
            <RadioGroup value={dimensions} onValueChange={setDimensions}>
              <div className="flex items-center space-x-3 p-3 border rounded-lg hover:bg-gray-50">
                <RadioGroupItem value="342x427" id="dim1" />
                <Label htmlFor="dim1" className="cursor-pointer flex-1">
                  <div className="font-medium">Standard (342 × 427)</div>
                  <div className="text-xs text-gray-500">Portrait format for product displays</div>
                </Label>
              </div>
              <div className="flex items-center space-x-3 p-3 border rounded-lg hover:bg-gray-50">
                <RadioGroupItem value="600x600" id="dim2" />
                <Label htmlFor="dim2" className="cursor-pointer flex-1">
                  <div className="font-medium">Square (600 × 600)</div>
                  <div className="text-xs text-gray-500">Square format for social media</div>
                </Label>
              </div>
            </RadioGroup>
          </div>

          {/* DPI Selection */}
          <div>
            <Label htmlFor="dpi-select">DPI Quality</Label>
            <Select value={dpi} onValueChange={setDpi}>
              <SelectTrigger className="mt-2">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="300">300 DPI (Standard Print)</SelectItem>
                <SelectItem value="600">600 DPI (High Quality)</SelectItem>
                <SelectItem value="1200">1200 DPI (Premium Print)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Process Button */}
          <Button 
            onClick={handleProcess} 
            className="w-full bg-foxx-blue hover:bg-blue-600"
            disabled={processSingleMutation.isPending || processBulkMutation.isPending}
          >
            {(processSingleMutation.isPending || processBulkMutation.isPending) ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                Processing...
              </>
            ) : (
              "Process & Download"
            )}
          </Button>
        </CardContent>
      </Card>

      {/* Preview & Results Panel */}
      <Card>
        <CardHeader>
          <CardTitle>Preview & Results</CardTitle>
        </CardHeader>
        <CardContent>
          {currentProduct ? (
            <div className="border border-gray-200 rounded-lg p-4">
              <img 
                src={currentProduct.images[0]?.src} 
                alt={currentProduct.title}
                className="w-full h-48 object-cover rounded-md mb-3"
              />
              <h4 className="font-medium text-gray-900">{currentProduct.title}</h4>
              <p className="text-sm text-gray-500">SKU: {singleSku}</p>
            </div>
          ) : mode === "single" ? (
            <div className="text-center py-12">
              <div className="mx-auto w-12 h-12 bg-gray-100 rounded-lg flex items-center justify-center mb-4">
                <ImageIcon className="w-6 h-6 text-gray-400" />
              </div>
              <h3 className="text-sm font-medium text-gray-900 mb-1">No products loaded</h3>
              <p className="text-sm text-gray-500">Enter a SKU and click fetch to preview</p>
            </div>
          ) : (
            <div className="text-center py-12">
              <div className="mx-auto w-12 h-12 bg-gray-100 rounded-lg flex items-center justify-center mb-4">
                <ImageIcon className="w-6 h-6 text-gray-400" />
              </div>
              <h3 className="text-sm font-medium text-gray-900 mb-1">Bulk Processing Mode</h3>
              <p className="text-sm text-gray-500">Enter SKUs and click process to download ZIP</p>
            </div>
          )}

          {/* Processing Status */}
          {(processSingleMutation.isPending || processBulkMutation.isPending) && (
            <div className="mt-4 bg-blue-50 border border-blue-200 rounded-md p-4">
              <div className="flex items-center">
                <Loader2 className="h-5 w-5 text-blue-600 animate-spin mr-3" />
                <div>
                  <h4 className="text-sm font-medium text-blue-800">Processing image...</h4>
                  <p className="text-sm text-blue-600">Converting to specified dimensions and DPI</p>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
