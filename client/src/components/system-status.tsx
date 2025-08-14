import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CheckCircle, XCircle } from "lucide-react";

interface HealthStatus {
  status: string;
  services: {
    shopify: string;
    imageProcessing: string;
    pdfConverter: string;
  };
}

export default function SystemStatus() {
  const { data: health } = useQuery<HealthStatus>({
    queryKey: ['/api/health'],
    refetchInterval: 30000, // Refetch every 30 seconds
  });

  const getStatusIcon = (status: string) => {
    if (status === "connected" || status === "online" || status === "ready") {
      return <CheckCircle className="w-6 h-6 text-green-600" />;
    }
    return <XCircle className="w-6 h-6 text-red-600" />;
  };

  const getStatusColor = (status: string) => {
    if (status === "connected" || status === "online" || status === "ready") {
      return "text-green-600";
    }
    return "text-red-600";
  };

  return (
    <Card className="mt-8">
      <CardHeader>
        <CardTitle>System Status</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="text-center">
            <div className="inline-flex items-center justify-center w-12 h-12 bg-green-100 rounded-lg mb-3">
              {getStatusIcon(health?.services.shopify || "disconnected")}
            </div>
            <h4 className="text-sm font-medium text-gray-900">Shopify API</h4>
            <p className={`text-sm ${getStatusColor(health?.services.shopify || "disconnected")}`}>
              {health?.services.shopify || "Unknown"}
            </p>
          </div>
          <div className="text-center">
            <div className="inline-flex items-center justify-center w-12 h-12 bg-green-100 rounded-lg mb-3">
              {getStatusIcon(health?.services.imageProcessing || "offline")}
            </div>
            <h4 className="text-sm font-medium text-gray-900">Image Processing</h4>
            <p className={`text-sm ${getStatusColor(health?.services.imageProcessing || "offline")}`}>
              {health?.services.imageProcessing || "Unknown"}
            </p>
          </div>
          <div className="text-center">
            <div className="inline-flex items-center justify-center w-12 h-12 bg-green-100 rounded-lg mb-3">
              {getStatusIcon(health?.services.pdfConverter || "offline")}
            </div>
            <h4 className="text-sm font-medium text-gray-900">PDF Converter</h4>
            <p className={`text-sm ${getStatusColor(health?.services.pdfConverter || "offline")}`}>
              {health?.services.pdfConverter || "Unknown"}
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
