# ReportRx Backend

A Python FastAPI backend for the ReportRx lab report interpretation application. This service integrates with OpenAI's GPT-4 to provide educational interpretations of medical lab results.

## Features

- **FastAPI Framework**: Modern, fast web framework with automatic API documentation
- **OpenAI Integration**: Uses GPT-4 to generate human-readable lab result interpretations
- **CORS Support**: Configured for local frontend development
- **Input Validation**: Comprehensive request/response validation using Pydantic
- **Error Handling**: Graceful error handling with appropriate HTTP status codes
- **Logging**: Structured logging for monitoring and debugging
- **Health Checks**: Built-in health and readiness endpoints

## Installation

1. **Create a virtual environment:**
   ```bash
   cd backend
   python -m venv venv
   source venv/bin/activate  # On Windows: venv\Scripts\activate
   ```

2. **Install dependencies:**
   ```bash
   pip install -r requirements.txt
   ```

3. **Set up environment variables:**
   ```bash
   cp .env.example .env
   # Edit .env and add your OpenAI API key
   ```

## Configuration

Create a `.env` file in the backend directory with the following variables:

```env
# OpenAI Configuration
OPENAI_API_KEY=your_openai_api_key_here

# Server Configuration
HOST=0.0.0.0
PORT=8000
DEBUG=True

# CORS Configuration
ALLOWED_ORIGINS=http://localhost:3000,http://localhost:5173
```

## Running the Server

### Development Mode
```bash
python run.py
```

### Production Mode
```bash
uvicorn app.main:app --host 0.0.0.0 --port 8000
```

## API Endpoints

### Health Checks
- `GET /api/v1/health` - Basic health check
- `GET /api/v1/health/ready` - Readiness check with dependency validation

### Lab Report Interpretation
- `POST /api/v1/interpret-report` - Generate interpretation for lab results
- `POST /api/v1/interpret-report/validate` - Validate lab data without interpretation

### API Documentation
- `GET /docs` - Interactive Swagger UI documentation (development only)
- `GET /redoc` - ReDoc documentation (development only)

## Request Format

Send a POST request to `/api/v1/interpret-report` with the following JSON structure:

```json
{
  "tests": [
    {
      "name": "Hemoglobin",
      "value": 9.5,
      "unit": "g/dL",
      "reference_range": "12.0 - 15.5"
    },
    {
      "name": "WBC",
      "value": 11000,
      "unit": "cells/mcL",
      "reference_range": "4000 - 11000"
    }
  ],
  "patient_context": "Optional patient context information"
}
```

## Response Format

The API returns interpretations in the following format:

```json
{
  "interpretation": "AI-generated interpretation text...",
  "status": "success",
  "test_count": 2
}
```

## Error Handling

The API provides detailed error responses:

```json
{
  "error": "Error description",
  "status": "error",
  "details": "Additional error details"
}
```

## Project Structure

```
backend/
├── app/
│   ├── __init__.py
│   ├── main.py              # FastAPI application
│   ├── config.py            # Configuration management
│   ├── models.py            # Pydantic models
│   ├── routes/
│   │   ├── health.py        # Health check endpoints
│   │   └── interpret.py     # Interpretation endpoints
│   └── services/
│       └── openai_service.py # OpenAI integration
├── requirements.txt         # Python dependencies
├── .env.example            # Environment variables template
├── run.py                  # Development server runner
└── README.md              # This file
```

## Security Considerations

- API keys are managed through environment variables
- CORS is configured for specific origins
- Input validation prevents malformed requests
- Error messages don't expose sensitive information in production

## Medical Disclaimer

This application is for educational purposes only and is not a substitute for professional medical advice. All interpretations include appropriate medical disclaimers and encourage users to consult with healthcare providers.

## Development

### Adding New Features

1. Define new Pydantic models in `models.py`
2. Create service functions in the appropriate service module
3. Add new routes in the `routes/` directory
4. Include the router in `main.py`

### Testing

The application includes comprehensive error handling and validation. For production deployment, consider adding:

- Unit tests with pytest
- Integration tests for OpenAI API
- Load testing for performance validation
- Health monitoring and alerting

## Deployment

For production deployment:

1. Set `DEBUG=False` in environment variables
2. Use a production WSGI server like Gunicorn
3. Configure proper logging and monitoring
4. Set up SSL/TLS termination
5. Implement rate limiting and authentication as needed