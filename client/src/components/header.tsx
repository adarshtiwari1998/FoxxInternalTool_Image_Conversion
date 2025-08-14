import { Badge } from "@/components/ui/badge";

export default function Header() {
  return (
    <header className="bg-white shadow-sm border-b border-gray-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          <div className="flex items-center space-x-4">
            <img 
              src="https://www.foxxlifesciences.com/cdn/shop/t/38/assets/logo.png?v=91111398020413059131740668507" 
              alt="Foxx Life Sciences Logo" 
              className="h-10 w-auto" 
            />
            <div className="hidden sm:block">
              <h1 className="text-xl font-semibold text-gray-900">Internal Tools</h1>
              <p className="text-sm text-gray-500">Image Conversion System</p>
            </div>
          </div>
          <div className="flex items-center space-x-3">
            <Badge variant="secondary" className="bg-green-100 text-green-800">
              Connected to shopfls.myshopify.com
            </Badge>
          </div>
        </div>
      </div>
    </header>
  );
}
