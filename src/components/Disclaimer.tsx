import React from 'react';
import { AlertTriangle } from 'lucide-react';

interface DisclaimerProps {
  variant?: 'compact' | 'full';
}

export const Disclaimer: React.FC<DisclaimerProps> = ({ variant = 'compact' }) => {
  return (
    <div className="bg-red-50 border-l-4 border-red-400 p-4 rounded-r-lg">
      <div className="flex items-start">
        <AlertTriangle className="h-5 w-5 text-red-400 mt-0.5 mr-3 flex-shrink-0" />
        <div>
          <h3 className="text-sm font-medium text-red-800 mb-1">
            Important Medical Disclaimer!!
          </h3>
          <div className="text-sm text-red-700 space-y-1">
            <p className="font-medium">This tool is NOT a substitute for professional medical advice.</p>
            {variant === 'full' && (
              <>
                <p>• Always consult with your healthcare provider about your lab results</p>
                <p>• Do not make medical decisions based solely on this interpretation</p>
                <p>• Contact your doctor immediately if you have urgent health concerns</p>
                <p>• This tool is for educational purposes only</p>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};