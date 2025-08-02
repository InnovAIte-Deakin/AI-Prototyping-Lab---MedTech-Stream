import React from 'react';
import { MessageCircle, Calendar, Phone, Download, RotateCcw } from 'lucide-react';
import { Disclaimer } from './Disclaimer';

interface FollowUpStepProps {
  interpretation: string;
  onStartOver: () => void;
}

export const FollowUpStep: React.FC<FollowUpStepProps> = ({ interpretation, onStartOver }) => {
  const followUpQuestions = [
    "What do these results mean for my overall health?",
    "Are there any lifestyle changes you recommend based on these results?",
    "When should I have my next lab work done?",
    "Are there any symptoms I should watch for?",
    "Do I need any additional tests or follow-up?"
  ];

  const nextSteps = [
    {
      icon: <Calendar className="h-6 w-6 text-blue-600" />,
      title: "Schedule Follow-up",
      description: "Contact your healthcare provider to discuss these results, even if they're normal.",
      urgent: false
    },
    {
      icon: <MessageCircle className="h-6 w-6 text-green-600" />,
      title: "Prepare Questions",
      description: "Use the suggested questions below to make the most of your appointment.",
      urgent: false
    },
    {
      icon: <Phone className="h-6 w-6 text-orange-600" />,
      title: "Contact if Concerned",
      description: "If you have any health concerns or symptoms, contact your doctor immediately.",
      urgent: true
    }
  ];

  const handleDownloadReport = () => {
    const reportContent = `
ReportRx Interpretation Report
Generated: ${new Date().toLocaleDateString()}

${interpretation}

Follow-up Questions to Ask Your Doctor:
${followUpQuestions.map((q, i) => `${i + 1}. ${q}`).join('\n')}

IMPORTANT DISCLAIMER:
This interpretation is for educational purposes only and is not a substitute for professional medical advice. Always consult with your healthcare provider about your lab results.
    `;

    const blob = new Blob([reportContent], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'lab-interpretation-report.txt';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="max-w-5xl mx-auto space-y-8">
      <div className="text-center">
        <h2 className="text-3xl font-bold text-gray-900 mb-4">
          Next Steps & Follow-up
        </h2>
        <p className="text-lg text-gray-600">
          Here's what to do next and questions to discuss with your healthcare provider
        </p>
      </div>

      {/* Next Steps */}
      <div className="grid md:grid-cols-3 gap-6">
        {nextSteps.map((step, index) => (
          <div key={index} className={`bg-white rounded-lg border-2 p-6 ${step.urgent ? 'border-orange-200 bg-orange-50' : 'border-gray-200'}`}>
            <div className="flex items-start mb-4">
              {step.icon}
              <h3 className="text-lg font-semibold text-gray-900 ml-3">{step.title}</h3>
            </div>
            <p className="text-gray-700">{step.description}</p>
            {step.urgent && (
              <div className="mt-3 text-sm font-medium text-orange-700">
                Priority: High
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Questions for Doctor */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8">
        <h3 className="text-2xl font-bold text-gray-900 mb-6 flex items-center">
          <MessageCircle className="h-6 w-6 text-blue-600 mr-3" />
          Questions to Ask Your Doctor
        </h3>
        <div className="space-y-4">
          {followUpQuestions.map((question, index) => (
            <div key={index} className="flex items-start p-4 bg-gray-50 rounded-lg">
              <div className="bg-blue-100 text-blue-800 rounded-full w-8 h-8 flex items-center justify-center text-sm font-bold mr-4 flex-shrink-0">
                {index + 1}
              </div>
              <p className="text-gray-800 font-medium">{question}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Disclaimer */}
      <Disclaimer variant="full" />

      {/* Action Buttons */}
      <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
        <button
          onClick={handleDownloadReport}
          className="flex items-center px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-medium"
        >
          <Download className="h-5 w-5 mr-2" />
          Download Report
        </button>
        <button
          onClick={onStartOver}
          className="flex items-center px-6 py-3 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors font-medium"
        >
          <RotateCcw className="h-5 w-5 mr-2" />
          Analyze Another Report
        </button>
      </div>

      {/* Final Reminder */}
      <div className="text-center bg-yellow-50 border border-yellow-200 rounded-lg p-6">
        <h4 className="text-lg font-semibold text-yellow-800 mb-2">
          Remember: Professional Medical Care is Essential
        </h4>
        <p className="text-yellow-700">
          Even with normal results, regular check-ups with your healthcare provider are important for maintaining good health.
          If you have any symptoms or concerns, don't hesitate to contact your doctor.
        </p>
      </div>
    </div>
  );
};