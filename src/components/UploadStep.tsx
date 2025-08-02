import React, { useState, useCallback } from 'react';
import { Upload, FileText, AlertCircle, CheckCircle } from 'lucide-react';
import { apiService } from '../services/api';

interface UploadStepProps {
  onFileUpload: (content: string, filename?: string) => void;
  onTextInput: (content: string) => void;
}

export const UploadStep: React.FC<UploadStepProps> = ({ onFileUpload, onTextInput }) => {
  const [textInput, setTextInput] = useState('');
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadSuccess, setUploadSuccess] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [isUploading, setIsUploading] = useState(false);

  const validateAndProcessFile = useCallback(async (file: File) => {
    setUploadError(null);
    setUploadSuccess(null);
    setIsUploading(true);

    // Validate file type
    if (file.type !== 'application/pdf' && file.type !== 'text/plain') {
      setUploadError('Please upload a PDF or text file only.');
      setIsUploading(false);
      return;
    }

    // Validate file size (5MB max)
    if (file.size > 5 * 1024 * 1024) {
      setUploadError('File size must be under 5MB.');
      setIsUploading(false);
      return;
    }

    try {
      // Upload file to backend
      const response = await apiService.uploadFile(file);
      
      setUploadSuccess(`Successfully uploaded: ${file.name}`);
      onFileUpload(response.content, file.name);
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : 'Upload failed');
    } finally {
      setIsUploading(false);
    }
  }, [onFileUpload]);

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    
    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) {
      validateAndProcessFile(files[0]);
    }
  }, [validateAndProcessFile]);

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      validateAndProcessFile(files[0]);
    }
  };

  const handleTextSubmit = async () => {
    if (textInput.trim()) {
      setUploadError(null);
      setIsUploading(true);
      
      try {
        const response = await apiService.uploadText(textInput.trim());
        onTextInput(response.content);
      } catch (error) {
        setUploadError(error instanceof Error ? error.message : 'Processing failed');
      } finally {
        setIsUploading(false);
      }
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      <div className="text-center">
        <h2 className="text-3xl font-bold text-gray-900 mb-4">
          Upload Your Lab Report
        </h2>
        <p className="text-lg text-gray-600 max-w-2xl mx-auto">
          Upload a PDF lab report or paste the text directly. We'll help you understand your results in plain language.
        </p>
      </div>

      <div className="grid md:grid-cols-2 gap-8">
        {/* File Upload */}
        <div className="space-y-4">
          <h3 className="text-xl font-semibold text-gray-900 flex items-center">
            <Upload className="h-5 w-5 mr-2" />
            Upload PDF Report
          </h3>
          
          <div
            className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
              dragActive 
                ? 'border-blue-400 bg-blue-50' 
                : 'border-gray-300 hover:border-gray-400'
            }`}
            onDragEnter={handleDrag}
            onDragLeave={handleDrag}
            onDragOver={handleDrag}
            onDrop={handleDrop}
          >
            <Upload className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <p className="text-lg font-medium text-gray-700 mb-2">
              Drop your PDF here or click to browse
            </p>
            <p className="text-sm text-gray-500 mb-4">
              Maximum file size: 5MB
            </p>
            <input
              type="file"
              accept=".pdf,.txt"
              onChange={handleFileInput}
              className="hidden"
              id="file-upload"
            />
            <label
              htmlFor="file-upload"
              className="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors cursor-pointer"
            >
              <FileText className="h-4 w-4 mr-2" />
              Choose File
            </label>
          </div>

          {uploadError && (
            <div className="flex items-center p-3 bg-red-50 border border-red-200 rounded-lg">
              <AlertCircle className="h-5 w-5 text-red-500 mr-2" />
              <span className="text-red-700">{uploadError}</span>
            </div>
          )}

          {uploadSuccess && (
            <div className="flex items-center p-3 bg-green-50 border border-green-200 rounded-lg">
              <CheckCircle className="h-5 w-5 text-green-500 mr-2" />
              <span className="text-green-700">{uploadSuccess}</span>
            </div>
          )}
        </div>

        {/* Text Input */}
        <div className="space-y-4">
          <h3 className="text-xl font-semibold text-gray-900 flex items-center">
            <FileText className="h-5 w-5 mr-2" />
            Paste Report Text
          </h3>
          
          <div className="space-y-4">
            <textarea
              value={textInput}
              onChange={(e) => setTextInput(e.target.value)}
              placeholder="Paste your lab report text here...

Example:
COMPLETE BLOOD COUNT
Hemoglobin: 14.2 g/dL (12.0-16.0)
White Blood Cell Count: 7.2 K/uL (4.0-11.0)
..."
              className="w-full h-64 p-4 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-none"
            />
            <button
              onClick={handleTextSubmit}
              disabled={!textInput.trim() || isUploading}
              className="w-full bg-blue-600 text-white py-3 px-4 rounded-lg hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors font-medium"
            >
              {isUploading ? 'Processing...' : 'Analyze Report Text'}
            </button>
          </div>
        </div>
      </div>
      
      {isUploading && (
        <div className="text-center">
          <div className="inline-flex items-center px-4 py-2 bg-blue-50 border border-blue-200 rounded-lg">
            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600 mr-2"></div>
            <span className="text-blue-700">Processing your report...</span>
          </div>
        </div>
      )}
    </div>
  );
};