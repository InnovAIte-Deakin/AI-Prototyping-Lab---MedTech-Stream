import React from 'react';
import { CheckCircle, AlertTriangle, TrendingUp, TrendingDown } from 'lucide-react';
import { apiService, LabTest } from '../services/api';

interface LabValue extends LabTest {
  status: 'normal' | 'high' | 'low' | 'critical';
}

interface ParsedDataStepProps {
  reportContent: string;
  onContinue: (parsedData: LabValue[]) => void;
}

export const ParsedDataStep: React.FC<ParsedDataStepProps> = ({ reportContent, onContinue }) => {
  const [parsedData, setParsedData] = React.useState<LabValue[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    const parseReport = async () => {
      try {
        setIsLoading(true);
        setError(null);
        
        const response = await apiService.parseReport(reportContent);
        
        // Convert API response to LabValue format with status
        const labValues: LabValue[] = response.tests.map(test => ({
          ...test,
          status: determineStatus(test.value, test.reference_range)
        }));
        
        setParsedData(labValues);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to parse report');
      } finally {
        setIsLoading(false);
      }
    };

    parseReport();
  }, [reportContent]);

  const determineStatus = (value: number, referenceRange: string): 'normal' | 'high' | 'low' | 'critical' => {
    try {
      // Parse reference range (e.g., "12.0 - 16.0" or "12.0-16.0")
      const range = referenceRange.replace(/\s/g, '');
      const match = range.match(/(\d+\.?\d*)-(\d+\.?\d*)/);
      
      if (match) {
        const low = parseFloat(match[1]);
        const high = parseFloat(match[2]);
        
        if (value < low * 0.5 || value > high * 2) {
          return 'critical';
        } else if (value < low) {
          return 'low';
        } else if (value > high) {
          return 'high';
        }
      }
      
      return 'normal';
    } catch {
      return 'normal';
    }
  };

  if (isLoading) {
    return (
      <div className="max-w-4xl mx-auto text-center">
        <div className="bg-blue-50 p-8 rounded-lg">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">
            Parsing Your Report
          </h2>
          <p className="text-gray-600">
            Extracting lab test data from your report...
          </p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-4xl mx-auto">
        <div className="bg-red-50 border border-red-200 rounded-lg p-6">
          <div className="flex items-center mb-4">
            <AlertTriangle className="h-6 w-6 text-red-500 mr-3" />
            <h2 className="text-xl font-bold text-red-900">Parsing Error</h2>
          </div>
          <p className="text-red-700 mb-4">{error}</p>
          <p className="text-red-600 text-sm">
            Please ensure your report contains recognizable lab test values with reference ranges.
          </p>
        </div>
      </div>
    );
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'normal':
        return <CheckCircle className="h-5 w-5 text-green-500" />;
      case 'high':
        return <TrendingUp className="h-5 w-5 text-orange-500" />;
      case 'low':
        return <TrendingDown className="h-5 w-5 text-orange-500" />;
      case 'critical':
        return <AlertTriangle className="h-5 w-5 text-red-500" />;
      default:
        return <CheckCircle className="h-5 w-5 text-gray-400" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'normal':
        return 'text-green-700 bg-green-50';
      case 'high':
      case 'low':
        return 'text-orange-700 bg-orange-50';
      case 'critical':
        return 'text-red-700 bg-red-50';
      default:
        return 'text-gray-700 bg-gray-50';
    }
  };

  return (
    <div className="max-w-6xl mx-auto space-y-8">
      <div className="text-center">
        <h2 className="text-3xl font-bold text-gray-900 mb-4">
          Extracted Lab Values
        </h2>
        <p className="text-lg text-gray-600">
          We've identified {parsedData.length} lab values from your report. Review them below and continue for interpretation.
        </p>
      </div>

      <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Lab Test
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Your Value
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Reference Range
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {parsedData.map((item, index) => (
                <tr key={index} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                    {item.name}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    <span className="font-semibold">{item.value}</span> {item.unit}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                    {item.reference_range} {item.unit}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm">
                    <div className="flex items-center">
                      {getStatusIcon(item.status)}
                      <span className={`ml-2 px-2 py-1 text-xs font-medium rounded-full ${getStatusColor(item.status)}`}>
                        {item.status.charAt(0).toUpperCase() + item.status.slice(1)}
                      </span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
        <h3 className="text-lg font-semibold text-blue-900 mb-2">Parsing Summary</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          <div className="text-center">
            <div className="text-2xl font-bold text-green-600">
              {parsedData.filter(item => item.status === 'normal').length}
            </div>
            <div className="text-gray-600">Normal</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-orange-600">
              {parsedData.filter(item => item.status === 'high' || item.status === 'low').length}
            </div>
            <div className="text-gray-600">Outside Range</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-red-600">
              {parsedData.filter(item => item.status === 'critical').length}
            </div>
            <div className="text-gray-600">Critical</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-blue-600">
              {parsedData.length}
            </div>
            <div className="text-gray-600">Total Tests</div>
          </div>
        </div>
      </div>

      <div className="flex justify-center">
        <button
          onClick={() => onContinue(parsedData)}
          className="bg-blue-600 text-white px-8 py-3 rounded-lg hover:bg-blue-700 transition-colors font-medium text-lg"
        >
          Continue to AI Interpretation
        </button>
      </div>
    </div>
  );
};