# Swagger/Postman MCP Server

Server that ingests and serves Swagger/OpenAPI specifications and Postman collections as MCP (Model Context Protocol) tools.

```bash
Example prompt:
Help me generate an axios call using our api mcp. I want to implement updating a user. Follow our same DDD pattern (tanstack hook -> axios service)
```

## Features

- **OpenAPI/Swagger Support**: Load OpenAPI 2.0/3.0 specifications from URLs or local files
- **Postman Collection Support**: Load Postman collection JSON files from URLs or local files
- **Environment Variables**: Support for Postman environment files
- **Authentication**: Multiple authentication methods (Basic, Bearer, API Key, OAuth2)
- **Dynamic Tool Generation**: Automatically generates MCP tools from API specifications
- **Request Execution**: Execute API requests with proper parameter handling and authentication

## Security

This is a personal server!! Do not expose it to the public internet.
If the underlying API requires authentication, you should not expose the MCP server to the public internet.

## TODO

- secrets - the MCP server should be able to use secrets from the user to authenticate requests to the API
- Comprehensive test suite

## Prerequisites

- Node.js (v18 or higher)
- Yarn package manager
- TypeScript

## Installation

```bash
# Clone the repository
git clone <repository-url>
cd swag-mcp

# Install dependencies
npm install
# or
yarn install

# Build the project
npm run build
# or
yarn build
```

## Configuration

The server uses a `config.json` file for configuration. You can specify either OpenAPI/Swagger specifications or Postman collections.

### OpenAPI/Swagger Configuration

```json
{
  "api": {
    "type": "openapi",
    "openapi": {
      "url": "https://petstore.swagger.io/v2/swagger.json",
      "apiBaseUrl": "https://petstore.swagger.io/v2",
      "defaultAuth": {
        "type": "apiKey",
        "apiKey": "special-key",
        "apiKeyName": "api_key",
        "apiKeyIn": "header"
      }
    }
  },
  "log": {
    "level": "info"
  },
  "server": {
    "port": 3000,
    "host": "0.0.0.0"
  }
}
```

### Postman Collection Configuration

```json
{
  "api": {
    "type": "postman",
    "postman": {
      "collectionUrl": "https://www.postman.com/collections/your-collection-id",
      "collectionFile": "./examples/postman-collection.json",
      "environmentUrl": "https://www.postman.com/environments/your-environment-id",
      "environmentFile": "./examples/postman-environment.json",
      "defaultAuth": {
        "type": "bearer",
        "token": "your-api-token-here"
      }
    }
  },
  "log": {
    "level": "info"
  },
  "server": {
    "port": 3000,
    "host": "0.0.0.0"
  }
}
```

### Configuration Options

#### API Configuration

- `api.type`: Either `"openapi"` or `"postman"`
- `api.openapi`: OpenAPI/Swagger specific configuration
  - `url`: URL to the OpenAPI specification
  - `apiBaseUrl`: Base URL for API requests
  - `defaultAuth`: Default authentication configuration
- `api.postman`: Postman specific configuration
  - `collectionUrl`: URL to the Postman collection (optional)
  - `collectionFile`: Path to local Postman collection file (optional)
  - `environmentUrl`: URL to the Postman environment (optional)
  - `environmentFile`: Path to local Postman environment file (optional)
  - `defaultAuth`: Default authentication configuration

#### Authentication Configuration

- `type`: Authentication type (`"basic"`, `"bearer"`, `"apiKey"`, `"oauth2"`)
- `username`: Username (for basic auth)
- `password`: Password (for basic auth)
- `token`: Token (for bearer/oauth2 auth)
- `apiKey`: API key value
- `apiKeyName`: API key parameter name
- `apiKeyIn`: Where to send API key (`"header"` or `"query"`)

#### Server Configuration

- `server.port`: Server port (default: 3000)
- `server.host`: Server host (default: "0.0.0.0")
- `log.level`: Logging level (`"debug"`, `"info"`, `"warn"`, `"error"`)

## Usage

### Starting the Server

```bash
# Start the server
npm start
# or
yarn start

# For development with auto-reload
npm run dev
# or
yarn dev
```

### API Endpoints

- `GET /health` - Health check endpoint
- `GET /sse` - Server-Sent Events endpoint for MCP connections
- `POST /messages` - MCP message handling endpoint

## How It Works

### OpenAPI/Swagger Mode

1. Loads the OpenAPI specification from the configured URL or file
2. Parses the specification to extract API endpoints, parameters, and security schemes
3. Generates MCP tools for each API operation
4. Handles authentication and parameter validation
5. Executes API requests and returns responses

### Postman Collection Mode

1. Loads the Postman collection JSON from the configured URL or file
2. Optionally loads a Postman environment file for variable substitution
3. Parses requests, folders, and nested items in the collection
4. Generates MCP tools for each request in the collection
5. Handles variable substitution, authentication, and parameter mapping
6. Executes requests with proper headers, query parameters, and body data

### Generated Tools

Each API operation becomes an MCP tool with:

- **Name**: Derived from the operation name or request name
- **Description**: From the API documentation or request description
- **Parameters**: Automatically generated schema for:
  - Path parameters
  - Query parameters
  - Request headers
  - Request body (for POST/PUT/PATCH operations)
  - Authentication parameters

### Authentication

The server supports multiple authentication methods:

- **Basic Authentication**: Username/password
- **Bearer Token**: JWT or other bearer tokens
- **API Key**: In headers or query parameters
- **OAuth2**: Bearer token based

Authentication can be configured globally or overridden per request.

## Examples

See the `examples/` directory for sample configurations and collection files.

### Example Postman Collection Structure

```json
{
  "info": {
    "name": "Sample API Collection",
    "description": "A sample Postman collection"
  },
  "item": [
    {
      "name": "Get Users",
      "request": {
        "method": "GET",
        "header": [],
        "url": {
          "raw": "{{baseUrl}}/users",
          "host": ["{{baseUrl}}"],
          "path": ["users"]
        }
      }
    }
  ]
}
```

## Development

```bash
# Install dependencies
npm install

# Run in development mode
npm run dev

# Run tests
npm test

# Build for production
npm run build
```

## License

ISC

## Environment Variables

- `PORT`: Server port (default: 3000)
- `API_USERNAME`: Username for API authentication (fallback)
- `API_PASSWORD`: Password for API authentication (fallback)
- `API_TOKEN`: API token for authentication (fallback)
- `DEFAULT_API_BASE_URL`: Default base URL for API endpoints (fallback)
- `DEFAULT_SWAGGER_URL`: Default Swagger specification URL
