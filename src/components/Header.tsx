import React from 'react';
import { Activity, Shield } from 'lucide-react';

export const Header: React.FC = () => {
  return (
    <header className="bg-white shadow-sm border-b border-gray-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center py-4">
          <div className="flex items-center space-x-3">
            <div className="bg-blue-600 p-2 rounded-lg">
              <Activity className="h-6 w-6 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">ReportRx</h1>
              <p className="text-sm text-gray-600">Lab Report Interpretation</p>
            </div>
          </div>
          <div className="hidden sm:flex items-center space-x-2 bg-yellow-50 px-3 py-2 rounded-lg border border-yellow-200">
            <Shield className="h-4 w-4 text-yellow-600" />
            <span className="text-sm font-medium text-yellow-800">Educational Tool Only</span>
          </div>
        </div>
      </div>
    </header>
  );
};