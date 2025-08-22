// Base URL for API requests. During development, Vite's dev server
// proxies requests starting with `/api` to the FastAPI backend.
const API_BASE_URL = '/api/v1';

export interface LabTest {
  name: string;
  value: number;
  unit: string;
  reference_range: string;
}

export interface UploadResponse {
  status: string;
  content: string;
  content_length: number;
  source: string;
}

export interface ParseResponse {
  status: string;
  tests: LabTest[];
  test_count: number;
}

export interface InterpretResponse {
  interpretation: string;
  status: string;
  test_count: number;
}

class ApiService {
  private async makeRequest<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const url = `${API_BASE_URL}${endpoint}`;
    
    console.log('Making request to:', url);
    
    const response = await fetch(url, {
      mode: 'cors',
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
      ...options,
    });

    console.log('Response status:', response.status);
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
      console.error('API Error:', errorData);
      throw new Error(errorData.error || `HTTP ${response.status}: ${response.statusText}`);
    }

    return response.json();
  }

  async uploadFile(file: File): Promise<UploadResponse> {
    console.log('Uploading file:', file.name);
    const formData = new FormData();
    formData.append('file', file);

    const response = await fetch(`${API_BASE_URL}/upload`, {
      method: 'POST',
      mode: 'cors',
      body: formData,
    });

    console.log('Upload response status:', response.status);
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: 'Upload failed' }));
      console.error('Upload error:', errorData);
      throw new Error(errorData.error || `Upload failed: ${response.statusText}`);
    }

    return response.json();
  }

  async uploadText(textContent: string): Promise<UploadResponse> {
    console.log('Uploading text content, length:', textContent.length);
    const formData = new FormData();
    formData.append('text_content', textContent);

    const response = await fetch(`${API_BASE_URL}/upload`, {
      method: 'POST',
      mode: 'cors',
      body: formData,
    });

    console.log('Text upload response status:', response.status);
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: 'Upload failed' }));
      console.error('Text upload error:', errorData);
      throw new Error(errorData.error || `Upload failed: ${response.statusText}`);
    }

    return response.json();
  }

  async parseReport(content: string): Promise<ParseResponse> {
    return this.makeRequest<ParseResponse>('/parse', {
      method: 'POST',
      body: JSON.stringify({ content }),
    });
  }

  async interpretReport(tests: LabTest[]): Promise<InterpretResponse> {
    return this.makeRequest<InterpretResponse>('/interpret-report', {
      method: 'POST',
      body: JSON.stringify({ tests }),
    });
  }

  async healthCheck(): Promise<{ status: string }> {
    return this.makeRequest<{ status: string }>('/health');
  }
}

export const apiService = new ApiService();