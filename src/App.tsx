import React, { useState } from 'react';
import { Header } from './components/Header';
import { ProgressBar } from './components/ProgressBar';
import { UploadStep } from './components/UploadStep';
import { ParsedDataStep } from './components/ParsedDataStep';
import { InterpretationStep } from './components/InterpretationStep';
import { FollowUpStep } from './components/FollowUpStep';
import { Disclaimer } from './components/Disclaimer';
import { LabTest } from './services/api';

interface LabValue extends LabTest {
  status: 'normal' | 'high' | 'low' | 'critical';
}

function App() {
  const [currentStep, setCurrentStep] = useState(1);
  const [reportContent, setReportContent] = useState('');
  const [parsedData, setParsedData] = useState<LabValue[]>([]);
  const [interpretation, setInterpretation] = useState('');

  const stepLabels = ['Upload', 'Parse Data', 'AI Analysis', 'Follow-up'];

  const handleFileUpload = (content: string, filename?: string) => {
    setReportContent(content);
    setCurrentStep(2);
  };

  const handleTextInput = (content: string) => {
    setReportContent(content);
    setCurrentStep(2);
  };

  const handleParsedDataContinue = (data: LabValue[]) => {
    setParsedData(data);
    setCurrentStep(3);
  };

  const handleInterpretationContinue = (interp: string) => {
    setInterpretation(interp);
    setCurrentStep(4);
  };

  const handleStartOver = () => {
    setCurrentStep(1);
    setReportContent('');
    setParsedData([]);
    setInterpretation('');
  };

  const renderCurrentStep = () => {
    switch (currentStep) {
      case 1:
        return (
          <UploadStep 
            onFileUpload={handleFileUpload}
            onTextInput={handleTextInput}
          />
        );
      case 2:
        return (
          <ParsedDataStep 
            reportContent={reportContent}
            onContinue={handleParsedDataContinue}
          />
        );
      case 3:
        return (
          <InterpretationStep 
            parsedData={parsedData}
            onContinue={handleInterpretationContinue}
          />
        );
      case 4:
        return (
          <FollowUpStep 
            interpretation={interpretation}
            onStartOver={handleStartOver}
          />
        );
      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <Header />
      
      {currentStep > 1 && (
        <ProgressBar 
          currentStep={currentStep}
          totalSteps={4}
          stepLabels={stepLabels}
        />
      )}

      <main className="py-12 px-4 sm:px-6 lg:px-8">
        {currentStep === 1 && (
          <div className="mb-8">
            <Disclaimer variant="compact" />
          </div>
        )}
        
        {renderCurrentStep()}
      </main>

      <footer className="bg-white border-t border-gray-200 py-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center space-y-4">
            <div className="text-sm text-gray-600">
              <p className="font-semibold">ReportRx - Educational Lab Report Interpretation</p>
              <p>This tool is for educational purposes only and is not a substitute for professional medical advice.</p>
            </div>
            <div className="text-xs text-gray-500">
              <p>References: MedlinePlus.org, LabTestsOnline.org, NIH PROMIS Framework</p>
              <p>Always consult with your healthcare provider about your lab results.</p>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}

export default App;