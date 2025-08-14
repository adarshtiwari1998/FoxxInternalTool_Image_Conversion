import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2, Download, Image as ImageIcon, CheckCircle, XCircle, Clock } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

interface Product {
  id: number;
  title: string;
  images: Array<{ src: string; alt: string | null }>;
}

interface ProcessingItem {
  id: string;
  type: 'sku' | 'url';
  input: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  result?: {
    filename: string;
    previewUrl?: string;
  };
  error?: string;
}

interface BatchJob {
  id: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  progress: {
    total: number;
    completed: number;
    failed: number;
  };
  items: ProcessingItem[];
  startedAt?: string;
  completedAt?: string;
}

export default function SkuConverter() {
  const [mode, setMode] = useState<"single" | "bulk">("single");
  const [singleInput, setSingleInput] = useState("");
  const [bulkSkus, setBulkSkus] = useState("");
  const [dimensions, setDimensions] = useState("342x427");
  const [dpi, setDpi] = useState("300");
  const [currentProduct, setCurrentProduct] = useState<Product | null>(null);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [currentBatchJob, setCurrentBatchJob] = useState<BatchJob | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const { toast } = useToast();

  // WebSocket connection for real-time updates
  useEffect(() => {
    const connectWebSocket = () => {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${window.location.host}`;
      
      wsRef.current = new WebSocket(wsUrl);
      
      wsRef.current.onopen = () => {
        console.log('🔗 WebSocket connected');
        setIsConnected(true);
      };
      
      wsRef.current.onmessage = (event) => {
        const data = JSON.parse(event.data);
        
        if (data.type === 'jobProgress') {
          setCurrentBatchJob(prev => prev ? {
            ...prev,
            status: data.job.status,
            progress: data.job.progress
          } : null);
        } else if (data.type === 'itemProgress') {
          setCurrentBatchJob(prev => {
            if (!prev || prev.id !== data.jobId) return prev;
            
            const updatedItems = prev.items.map(item => 
              item.id === data.item.id ? { ...item, ...data.item } : item
            );
            
            return { ...prev, items: updatedItems };
          });
        }
      };
      
      wsRef.current.onclose = () => {
        console.log('🔌 WebSocket disconnected');
        setIsConnected(false);
        // Reconnect after 3 seconds
        setTimeout(connectWebSocket, 3000);
      };
      
      wsRef.current.onerror = (error) => {
        console.error('❌ WebSocket error:', error);
      };
    };
    
    connectWebSocket();
    
    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, []);

  // Clear preview when input is empty
  useEffect(() => {
    if (!singleInput.trim()) {
      setCurrentProduct(null);
      setPreviewImage(null);
    }
  }, [singleInput]);

  // Subscribe to job updates when batch job starts
  useEffect(() => {
    if (currentBatchJob && wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: 'subscribe',
        jobId: currentBatchJob.id
      }));
    }
  }, [currentBatchJob?.id]);

  // Helper function to detect if input is URL or SKU
  const isUrl = (input: string): boolean => {
    try {
      new URL(input);
      return true;
    } catch {
      return false;
    }
  };

  // Enhanced function to parse multiple SKUs/URLs from pasted content
  const parseInputs = (input: string): string[] => {
    if (!input.trim()) return [];
    
    // Split by multiple separators: newlines, tabs, commas, semicolons
    const rawInputs = input
      .split(/[\n\t,;]+/)
      .map(item => item.trim())
      .filter(item => item.length > 0);
    
    // Remove duplicates
    return Array.from(new Set(rawInputs));
  };

  // Fetch product by SKU
  const { data: product, isLoading: fetchingProduct, refetch: fetchProduct } = useQuery({
    queryKey: ['/api/product', singleInput],
    enabled: false,
  });

  // Process single input (SKU or URL) mutation
  const processSingleMutation = useMutation({
    mutationFn: async () => {
      const inputIsUrl = isUrl(singleInput);
      
      if (inputIsUrl) {
        const response = await apiRequest('POST', '/api/process-url', {
          url: singleInput,
          dimensions,
          dpi: Number(dpi)
        });
        return response;
      } else {
        const response = await apiRequest('POST', '/api/process-sku', {
          sku: singleInput,
          dimensions,
          dpi: Number(dpi)
        });
        return response;
      }
    },
    onSuccess: async (response) => {
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = isUrl(singleInput) ? 'converted-image.jpg' : `${singleInput}.jpg`;
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



  // Start batch processing job
  const startBatchJobMutation = useMutation({
    mutationFn: async () => {
      const inputs = parseInputs(bulkSkus);
      
      // Separate SKUs and URLs
      const skus: string[] = [];
      const urls: string[] = [];
      
      inputs.forEach(input => {
        if (isUrl(input.trim())) {
          urls.push(input.trim());
        } else {
          skus.push(input.trim());
        }
      });
      
      const response = await apiRequest('POST', '/api/start-batch-job', {
        skus,
        urls,
        dimensions,
        dpi: Number(dpi)
      });
      return response.json();
    },
    onSuccess: (data) => {
      const newJob: BatchJob = {
        id: data.jobId,
        status: 'pending',
        progress: { total: parseInputs(bulkSkus).length, completed: 0, failed: 0 },
        items: parseInputs(bulkSkus).map((input, index) => ({
          id: `${data.jobId}_item_${index}`,
          type: isUrl(input) ? 'url' : 'sku',
          input: input.trim(),
          status: 'pending'
        }))
      };
      setCurrentBatchJob(newJob);
      
      toast({
        title: "Batch job started!",
        description: `Processing ${parseInputs(bulkSkus).length} items`,
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: "Failed to start batch processing",
        variant: "destructive",
      });
    }
  });

  // Download completed batch job
  const downloadBatchMutation = useMutation({
    mutationFn: async (jobId: string) => {
      const response = await fetch(`/api/batch-job/${jobId}/download`);
      if (!response.ok) {
        throw new Error('Download failed');
      }
      return response;
    },
    onSuccess: async (response, jobId) => {
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `batch-${jobId}.zip`;
      a.click();
      window.URL.revokeObjectURL(url);
      
      toast({
        title: "Success!",
        description: "Batch results downloaded as ZIP",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to download batch results",
        variant: "destructive",
      });
    }
  });

  const handleFetchProduct = async () => {
    if (!singleInput.trim()) {
      toast({
        title: "Error",
        description: "Please enter a SKU or image URL",
        variant: "destructive",
      });
      return;
    }

    // If it's a URL, just set it as preview
    if (isUrl(singleInput)) {
      setPreviewImage(singleInput);
      setCurrentProduct(null);
      toast({
        title: "Image URL detected!",
        description: "Ready to process image from URL",
      });
      return;
    }
    
    // If it's a SKU, fetch from Shopify
    try {
      const result = await fetchProduct();
      if (result.data) {
        setCurrentProduct(result.data as Product);
        setPreviewImage(null);
        toast({
          title: "Product found!",
          description: `Loaded ${(result.data as Product).title}`,
        });
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Product not found or failed to fetch",
        variant: "destructive",
      });
      setCurrentProduct(null);
      setPreviewImage(null);
    }
  };

  const handleProcess = () => {
    if (mode === "single") {
      if (!singleInput.trim()) {
        toast({
          title: "Error",
          description: "Please enter a SKU or image URL",
          variant: "destructive",
        });
        return;
      }
      processSingleMutation.mutate();
    } else {
      const inputs = parseInputs(bulkSkus);
      if (inputs.length === 0) {
        toast({
          title: "Error", 
          description: "Please enter at least one SKU or URL",
          variant: "destructive",
        });
        return;
      }
      startBatchJobMutation.mutate();
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
                <Label htmlFor="single">Single Image</Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="bulk" id="bulk" />
                <Label htmlFor="bulk">Bulk SKUs/URLs</Label>
              </div>
            </RadioGroup>
          </div>

          {/* Single Input (SKU or URL) */}
          {mode === "single" && (
            <div>
              <Label htmlFor="single-input">Product SKU or Image URL</Label>
              <div className="flex space-x-2 mt-2">
                <Input
                  id="single-input"
                  placeholder="e.g., 66P-00022N-FLS or https://example.com/image.jpg"
                  value={singleInput}
                  onChange={(e) => setSingleInput(e.target.value)}
                  onPaste={(e) => {
                    const clipboardData = e.clipboardData.getData('text');
                    if (clipboardData) {
                      const parsedInputs = parseInputs(clipboardData);
                      if (parsedInputs.length > 1) {
                        e.preventDefault();
                        setBulkSkus(parsedInputs.join('\n'));
                        setMode('bulk');
                        setSingleInput('');
                        toast({
                          title: "Multiple values detected!",
                          description: `Switched to bulk mode with ${parsedInputs.length} items`,
                        });
                      }
                    }
                  }}
                />
                <Button onClick={handleFetchProduct} disabled={fetchingProduct}>
                  {fetchingProduct ? <Loader2 className="h-4 w-4 animate-spin" /> : "Fetch"}
                </Button>
              </div>
              <p className="text-xs text-gray-500 mt-1">Enter a Shopify SKU or direct image URL - the system will auto-detect</p>
            </div>
          )}

          {/* Bulk SKU/URL Input */}
          {mode === "bulk" && (
            <div>
              <Label htmlFor="bulk-skus">Product SKUs or Image URLs</Label>
              <Textarea
                id="bulk-skus"
                placeholder="Paste from spreadsheet or enter manually:\n66P-00022N-FLS\nhttps://example.com/image.jpg\n66P-00023N-FLS\n..."
                rows={6}
                value={bulkSkus}
                onChange={(e) => setBulkSkus(e.target.value)}
                onPaste={(e) => {
                  const clipboardData = e.clipboardData.getData('text');
                  if (clipboardData) {
                    const parsedInputs = parseInputs(clipboardData);
                    const originalLines = clipboardData.split('\n').filter(line => line.trim());
                    if (parsedInputs.length !== originalLines.length && parsedInputs.length > 0) {
                      e.preventDefault();
                      setBulkSkus(parsedInputs.join('\n'));
                      toast({
                        title: "Spreadsheet data detected!",
                        description: `Parsed ${parsedInputs.length} items from your paste`,
                      });
                    }
                  }
                }}
                className="mt-2"
              />
              <div className="flex items-center justify-between mt-1">
                <p className="text-xs text-gray-500">Paste from Excel/Google Sheets or enter manually - supports tabs, commas, newlines</p>
                {bulkSkus && (
                  <Badge variant="outline" className="text-xs">
                    {parseInputs(bulkSkus).length} items
                  </Badge>
                )}
              </div>
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
          <div className="space-y-3">
            <Button 
              onClick={handleProcess} 
              className="w-full bg-foxx-blue hover:bg-blue-600"
              disabled={processSingleMutation.isPending || startBatchJobMutation.isPending || (currentBatchJob?.status === 'processing')}
            >
              {processSingleMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Processing...
                </>
              ) : startBatchJobMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Starting batch...
                </>
              ) : currentBatchJob?.status === 'processing' ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Processing batch...
                </>
              ) : (
                "Process & Download"
              )}
            </Button>

            {currentBatchJob && currentBatchJob.progress.completed > 0 && (
              <Button
                onClick={() => downloadBatchMutation.mutate(currentBatchJob.id)}
                variant="outline"
                className="w-full"
                disabled={downloadBatchMutation.isPending}
              >
                {downloadBatchMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    Downloading...
                  </>
                ) : (
                  <>
                    <Download className="h-4 w-4 mr-2" />
                    Download Results ({currentBatchJob.progress.completed} files)
                  </>
                )}
              </Button>
            )}
          </div>
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
              <p className="text-sm text-gray-500">SKU: {singleInput}</p>
            </div>
          ) : mode === "single" && previewImage ? (
            <div className="border border-gray-200 rounded-lg p-4">
              <img 
                src={previewImage} 
                alt="Preview"
                className="w-full h-48 object-cover rounded-md mb-3"
                onError={(e) => {
                  e.currentTarget.style.display = 'none';
                }}
              />
              <h4 className="font-medium text-gray-900">Direct URL Image</h4>
              <p className="text-sm text-gray-500 break-all">{previewImage}</p>
            </div>
          ) : mode === "single" ? (
            <div className="text-center py-12">
              <div className="mx-auto w-12 h-12 bg-gray-100 rounded-lg flex items-center justify-center mb-4">
                <ImageIcon className="w-6 h-6 text-gray-400" />
              </div>
              <h3 className="text-sm font-medium text-gray-900 mb-1">No image loaded</h3>
              <p className="text-sm text-gray-500">Enter a SKU or image URL and click fetch to preview</p>
            </div>
          ) : (
            <div className="text-center py-12">
              <div className="mx-auto w-12 h-12 bg-gray-100 rounded-lg flex items-center justify-center mb-4">
                <ImageIcon className="w-6 h-6 text-gray-400" />
              </div>
              <h3 className="text-sm font-medium text-gray-900 mb-1">Bulk Processing Mode</h3>
              <p className="text-sm text-gray-500">Enter SKUs or image URLs and click process to download ZIP</p>
            </div>
          )}

          {/* Batch Processing Status */}
          {currentBatchJob && (
            <div className="mt-4 space-y-4">
              <div className="bg-blue-50 border border-blue-200 rounded-md p-4">
                <div className="flex items-center justify-between mb-2">
                  <h4 className="text-sm font-medium text-blue-800">
                    Batch Processing {currentBatchJob.status === 'completed' ? 'Completed' : 'In Progress'}
                  </h4>
                  <Badge variant="outline" className="text-xs">
                    {isConnected ? '🟢 Connected' : '🔴 Disconnected'}
                  </Badge>
                </div>
                
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span>Progress: {currentBatchJob.progress.completed} / {currentBatchJob.progress.total}</span>
                    <span className="text-gray-500">
                      {currentBatchJob.progress.failed > 0 && `${currentBatchJob.progress.failed} failed`}
                    </span>
                  </div>
                  <Progress 
                    value={(currentBatchJob.progress.completed / currentBatchJob.progress.total) * 100}
                    className="w-full"
                  />
                </div>
              </div>

              {/* Items Grid */}
              <div className="border rounded-lg">
                <div className="p-3 border-b bg-gray-50">
                  <h5 className="font-medium text-sm">Processing Items</h5>
                </div>
                <ScrollArea className="h-64">
                  <div className="p-3 space-y-3">
                    {currentBatchJob.items.map((item) => (
                      <div
                        key={item.id}
                        className="flex items-center gap-3 p-2 border rounded-lg hover:bg-gray-50"
                      >
                        <div className="flex-shrink-0">
                          {item.status === 'pending' && <Clock className="h-4 w-4 text-gray-400" />}
                          {item.status === 'processing' && <Loader2 className="h-4 w-4 text-blue-500 animate-spin" />}
                          {item.status === 'completed' && <CheckCircle className="h-4 w-4 text-green-500" />}
                          {item.status === 'failed' && <XCircle className="h-4 w-4 text-red-500" />}
                        </div>
                        
                        <div className="flex-grow min-w-0">
                          <div className="flex items-center gap-2">
                            <Badge variant={item.type === 'sku' ? 'default' : 'secondary'} className="text-xs">
                              {item.type.toUpperCase()}
                            </Badge>
                            <span className="text-sm font-medium truncate">{item.input}</span>
                          </div>
                          {item.error && (
                            <p className="text-xs text-red-600 mt-1">{item.error}</p>
                          )}
                          {item.result && (
                            <p className="text-xs text-green-600 mt-1">✅ {item.result.filename}</p>
                          )}
                        </div>

                        {item.result?.previewUrl && (
                          <div className="flex-shrink-0">
                            <img
                              src={item.result.previewUrl}
                              alt={item.input}
                              className="w-12 h-12 object-cover rounded border"
                              loading="lazy"
                            />
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </div>
            </div>
          )}

          {/* Single Processing Status */}
          {processSingleMutation.isPending && !currentBatchJob && (
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
