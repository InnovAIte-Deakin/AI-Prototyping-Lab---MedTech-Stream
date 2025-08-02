import React, { useState, useEffect } from 'react';
import { Brain, Clock, CheckCircle, AlertTriangle, Info } from 'lucide-react';
import { apiService, LabTest } from '../services/api';

interface LabValue extends LabTest {
  status: 'normal' | 'high' | 'low' | 'critical';
}

interface InterpretationStepProps {
  parsedData: LabValue[];
  onContinue: (interpretation: string) => void;
}

export const InterpretationStep: React.FC<InterpretationStepProps> = ({ parsedData, onContinue }) => {
  const [isLoading, setIsLoading] = useState(true);
  const [interpretation, setInterpretation] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const getInterpretation = async () => {
      try {
        setIsLoading(true);
        setError(null);
        
        // Convert parsedData to the format expected by the API
        const tests: LabTest[] = parsedData.map(item => ({
          name: item.name,
          value: item.value,
          unit: item.unit,
          reference_range: item.reference_range
        }));
        
        const response = await apiService.interpretReport(tests);
        setInterpretation(response.interpretation);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to get interpretation');
      } finally {
        setIsLoading(false);
      }
    };

    getInterpretation();
  }, [parsedData]);

  if (error) {
    return (
      <div className="max-w-4xl mx-auto">
        <div className="bg-red-50 border border-red-200 rounded-lg p-6">
          <div className="flex items-center mb-4">
            <AlertTriangle className="h-6 w-6 text-red-500 mr-3" />
            <h2 className="text-xl font-bold text-red-900">Interpretation Error</h2>
          </div>
          <p className="text-red-700 mb-4">{error}</p>
          <p className="text-red-600 text-sm">
            Please try again or contact support if the problem persists.
          </p>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="max-w-4xl mx-auto">
        <div className="text-center space-y-6">
          <div className="bg-blue-50 p-8 rounded-lg">
            <Brain className="h-16 w-16 text-blue-600 mx-auto mb-4 animate-pulse" />
            <h2 className="text-2xl font-bold text-gray-900 mb-2">
              AI is Analyzing Your Results
            </h2>
            <p className="text-gray-600 mb-6">
              Our AI is interpreting your lab values and preparing easy-to-understand explanations...
            </p>
            <div className="flex items-center justify-center space-x-2 text-blue-600">
              <Clock className="h-5 w-5 animate-spin" />
              <span className="font-medium">Processing... This may take a few seconds</span>
            </div>
          </div>
          
          <div className="bg-gray-50 p-4 rounded-lg">
            <div className="flex items-center justify-center space-x-4 text-sm text-gray-600">
              <div className="flex items-center">
                <CheckCircle className="h-4 w-4 text-green-500 mr-1" />
                Report uploaded
              </div>
              <div className="flex items-center">
                <CheckCircle className="h-4 w-4 text-green-500 mr-1" />
                Data extracted
              </div>
              <div className="flex items-center">
                <Clock className="h-4 w-4 text-blue-500 mr-1 animate-pulse" />
                Generating interpretation...
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto space-y-8">
      <div className="text-center">
        <h2 className="text-3xl font-bold text-gray-900 mb-4">
          Your Lab Results Interpretation
        </h2>
        <p className="text-lg text-gray-600">
          Here's what your lab results mean in plain language
        </p>
      </div>

      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8">
        <div className="prose prose-lg max-w-none">
          {interpretation.split('\n').map((line, index) => {
            if (line.startsWith('## ')) {
              return <h2 key={index} className="text-2xl font-bold text-gray-900 mt-8 mb-4">{line.replace('## ', '')}</h2>;
            }
            if (line.startsWith('### ')) {
              return <h3 key={index} className="text-xl font-semibold text-gray-800 mt-6 mb-3">{line.replace('### ', '')}</h3>;
            }
            if (line.startsWith('**') && line.endsWith('**')) {
              return <p key={index} className="font-semibold text-gray-900 mt-4 mb-2">{line.replace(/\*\*/g, '')}</p>;
            }
            if (line.startsWith('- **')) {
              const [label, description] = line.replace('- **', '').split('**: ');
              return (
                <div key={index} className="mb-3">
                  <span className="font-semibold text-gray-900">{label}:</span>
                  <span className="text-gray-700 ml-2">{description}</span>
                </div>
              );
            }
            if (line.startsWith('✅ ')) {
              return (
                <div key={index} className="flex items-start mb-2">
                  <CheckCircle className="h-5 w-5 text-green-500 mr-2 mt-0.5 flex-shrink-0" />
                  <span className="text-gray-700">{line.replace('✅ ', '')}</span>
                </div>
              );
            }
            if (line.trim()) {
              return <p key={index} className="text-gray-700 mb-3">{line}</p>;
            }
            return <div key={index} className="mb-2"></div>;
          })}
        </div>
      </div>

      <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
        <div className="flex items-start">
          <Info className="h-6 w-6 text-blue-600 mr-3 mt-0.5 flex-shrink-0" />
          <div>
            <h3 className="text-lg font-semibold text-blue-900 mb-2">
              Understanding Your Results
            </h3>
            <p className="text-blue-800">
              This interpretation is generated using advanced AI and medical databases. While comprehensive, 
              it's designed to help you understand your results better and prepare questions for your healthcare provider.
            </p>
          </div>
        </div>
      </div>

      <div className="flex justify-center">
        <button
          onClick={() => onContinue(interpretation)}
          className="bg-blue-600 text-white px-8 py-3 rounded-lg hover:bg-blue-700 transition-colors font-medium text-lg"
        >
          Continue to Follow-up Suggestions
        </button>
      </div>
    </div>
  );
};