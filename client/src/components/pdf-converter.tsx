import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Loader2, FileText } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

export default function PdfConverter() {
  const [pdfUrl, setPdfUrl] = useState("");
  const [dimensions, setDimensions] = useState("original");
  const { toast } = useToast();

  // Process PDF mutation
  const processPdfMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest('POST', '/api/process-pdf', {
        url: pdfUrl,
        dimensions
      });
      return response;
    },
    onSuccess: async (response) => {
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'pdf-pages.zip';
      a.click();
      window.URL.revokeObjectURL(url);
      
      toast({
        title: "Success!",
        description: "PDF pages extracted and downloaded as ZIP",
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: "Failed to process PDF",
        variant: "destructive",
      });
    }
  });

  const handleProcess = () => {
    if (!pdfUrl.trim()) {
      toast({
        title: "Error",
        description: "Please enter a PDF URL",
        variant: "destructive",
      });
      return;
    }

    // Basic URL validation
    try {
      new URL(pdfUrl);
    } catch {
      toast({
        title: "Error",
        description: "Please enter a valid URL",
        variant: "destructive",
      });
      return;
    }

    processPdfMutation.mutate();
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
      {/* PDF Configuration Panel */}
      <Card>
        <CardHeader>
          <CardTitle>PDF Configuration</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* PDF URL Input */}
          <div>
            <Label htmlFor="pdf-url">PDF URL</Label>
            <Input
              id="pdf-url"
              type="url"
              placeholder="https://example.com/document.pdf"
              value={pdfUrl}
              onChange={(e) => setPdfUrl(e.target.value)}
              className="mt-2"
            />
            <p className="text-xs text-gray-500 mt-1">Enter the direct URL to the PDF file</p>
          </div>

          {/* Output Format */}
          <div>
            <Label className="text-sm font-medium mb-3 block">Output Format</Label>
            <RadioGroup value={dimensions} onValueChange={setDimensions}>
              <div className="flex items-center space-x-3 p-3 border rounded-lg hover:bg-gray-50">
                <RadioGroupItem value="original" id="pdf-original" />
                <Label htmlFor="pdf-original" className="cursor-pointer flex-1">
                  <div className="font-medium">Original PDF Size</div>
                  <div className="text-xs text-gray-500">Keep original document dimensions</div>
                </Label>
              </div>
              <div className="flex items-center space-x-3 p-3 border rounded-lg hover:bg-gray-50">
                <RadioGroupItem value="342x427" id="pdf-dim1" />
                <Label htmlFor="pdf-dim1" className="cursor-pointer flex-1">
                  <div className="font-medium">Standard (342 × 427)</div>
                  <div className="text-xs text-gray-500">Portrait format for product displays</div>
                </Label>
              </div>
              <div className="flex items-center space-x-3 p-3 border rounded-lg hover:bg-gray-50">
                <RadioGroupItem value="600x600" id="pdf-dim2" />
                <Label htmlFor="pdf-dim2" className="cursor-pointer flex-1">
                  <div className="font-medium">Square (600 × 600)</div>
                  <div className="text-xs text-gray-500">Square format for social media</div>
                </Label>
              </div>
            </RadioGroup>
          </div>

          {/* Process Button */}
          <Button 
            onClick={handleProcess} 
            className="w-full bg-foxx-blue hover:bg-blue-600"
            disabled={processPdfMutation.isPending}
          >
            {processPdfMutation.isPending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                Extracting Pages...
              </>
            ) : (
              "Extract Pages to Images"
            )}
          </Button>
        </CardContent>
      </Card>

      {/* PDF Preview & Results Panel */}
      <Card>
        <CardHeader>
          <CardTitle>PDF Pages</CardTitle>
        </CardHeader>
        <CardContent>
          {processPdfMutation.isPending ? (
            <div className="bg-blue-50 border border-blue-200 rounded-md p-4">
              <div className="flex items-center">
                <Loader2 className="h-5 w-5 text-blue-600 animate-spin mr-3" />
                <div>
                  <h4 className="text-sm font-medium text-blue-800">Processing PDF...</h4>
                  <p className="text-sm text-blue-600">Extracting pages and converting to images</p>
                </div>
              </div>
            </div>
          ) : (
            <div className="text-center py-12">
              <div className="mx-auto w-12 h-12 bg-gray-100 rounded-lg flex items-center justify-center mb-4">
                <FileText className="w-6 h-6 text-gray-400" />
              </div>
              <h3 className="text-sm font-medium text-gray-900 mb-1">No PDF loaded</h3>
              <p className="text-sm text-gray-500">Enter a PDF URL to extract pages</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
