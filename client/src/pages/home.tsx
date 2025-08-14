import { useState } from "react";
import Header from "@/components/header";
import SkuConverter from "@/components/sku-converter";
import PdfConverter from "@/components/pdf-converter";
import SystemStatus from "@/components/system-status";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export default function Home() {
  return (
    <div className="bg-gray-50 min-h-screen">
      <Header />
      
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Tabs defaultValue="sku" className="w-full">
          <TabsList className="mb-8">
            <TabsTrigger value="sku">SKU Image Conversion</TabsTrigger>
            <TabsTrigger value="pdf">PDF to Images</TabsTrigger>
          </TabsList>
          
          <TabsContent value="sku">
            <SkuConverter />
          </TabsContent>
          
          <TabsContent value="pdf">
            <PdfConverter />
          </TabsContent>
        </Tabs>

        <SystemStatus />
      </main>
    </div>
  );
}
