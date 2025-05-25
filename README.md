# Swagger/Postman MCP Server

Server that ingests and serves Swagger/OpenAPI specifications and Postman collections as MCP (Model Context Protocol) tools using a **simplified strategic approach**.

Instead of generating hundreds of individual tools for each API endpoint, this server provides **only 4 strategic tools** that allow AI agents to dynamically discover and interact with APIs:

```bash
Example prompt:
Help me generate an axios call using our api mcp. I want to implement updating a user. Follow our same DDD pattern (tanstack hook -> axios service)
```

## Features

- **Strategic Tool Approach**: Only 4 tools instead of hundreds for better AI agent performance
- **OpenAPI/Swagger Support**: Load OpenAPI 2.0/3.0 specifications from URLs or local files
- **Postman Collection Support**: Load Postman collection JSON files from URLs or local files
- **Environment Variables**: Support for Postman environment files
- **Authentication**: Multiple authentication methods (Basic, Bearer, API Key, OAuth2)
- **Dynamic API Discovery**: Tools for listing, searching, and getting details about API endpoints
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

#### Logging Configuration

- `log.level`: Logging level (`"debug"`, `"info"`, `"warn"`, `"error"`)

## Usage

### Starting the MCP Server

The server runs via stdio transport for MCP connections:

```bash
# Start the simplified MCP server via stdio
./start-mcp.sh

# Or directly with node
node dist/simple-stdio.js

# For development with auto-reload
npm run dev:simple
# or
yarn dev:simple
```

### MCP Integration

This server uses stdio transport and is designed to be used with MCP clients like Claude Desktop. Configure it in your MCP client configuration file.

## How It Works

### Strategic Tool Approach

Instead of generating hundreds of individual tools for each API endpoint, this server provides **4 strategic tools** that enable dynamic API discovery and interaction:

### OpenAPI/Swagger Mode

**4 Strategic Tools:**

1. **`list_endpoints`** - List all available API endpoints
2. **`get_endpoint_details`** - Get detailed information about specific endpoints
3. **`search_endpoints`** - Search endpoints by keyword
4. **`make_api_call`** - Execute any API call with proper authentication

**Process:**

1. Loads the OpenAPI specification from the configured URL or file
2. Parses the specification to extract API endpoints, parameters, and security schemes
3. Makes endpoint information available through the 4 strategic tools
4. Handles authentication and parameter validation dynamically
5. Executes API requests and returns responses

### Postman Collection Mode

**4 Strategic Tools:**

1. **`list_requests`** - List all available requests in the collection
2. **`get_request_details`** - Get detailed information about specific requests
3. **`search_requests`** - Search requests by keyword
4. **`make_request`** - Execute any request from the collection

**Process:**

1. Loads the Postman collection JSON from the configured URL or file
2. Optionally loads a Postman environment file for variable substitution
3. Parses requests, folders, and nested items in the collection
4. Makes request information available through the 4 strategic tools
5. Handles variable substitution, authentication, and parameter mapping dynamically
6. Executes requests with proper headers, query parameters, and body data

### Benefits of Strategic Tools

- **Better AI Performance**: 4 tools vs hundreds means faster decision making
- **Dynamic Discovery**: AI agents can explore APIs without knowing endpoints beforehand
- **Flexible Interaction**: Any endpoint can be called through `make_api_call`/`make_request`
- **Reduced Overwhelm**: AI agents aren't flooded with tool options

## Strategic Tools Reference

### For OpenAPI/Swagger APIs

1. **`list_endpoints`**

   - Lists all available API endpoints with methods and paths
   - No parameters required
   - Returns: Array of endpoint summaries

2. **`get_endpoint_details`**

   - Get detailed information about a specific endpoint
   - Parameters: `method` (GET/POST/etc), `path` (/users/{id}/etc)
   - Returns: Full endpoint specification with parameters, body schema, responses

3. **`search_endpoints`**

   - Search endpoints by keyword in path, summary, or description
   - Parameters: `query` (search term)
   - Returns: Filtered list of matching endpoints

4. **`make_api_call`**
   - Execute an API call to any endpoint
   - Parameters: `method`, `path`, `pathParams`, `queryParams`, `headers`, `body`
   - Returns: API response with status and data

### For Postman Collections

1. **`list_requests`**

   - Lists all available requests in the collection
   - No parameters required
   - Returns: Array of request summaries

2. **`get_request_details`**

   - Get detailed information about a specific request
   - Parameters: `requestId` or `requestName`
   - Returns: Full request specification

3. **`search_requests`**

   - Search requests by keyword
   - Parameters: `query` (search term)
   - Returns: Filtered list of matching requests

4. **`make_request`**
   - Execute any request from the collection
   - Parameters: `requestId`, `variables` (for substitution)
   - Returns: Request response

### Authentication

The server supports multiple authentication methods:

- **Basic Authentication**: Username/password
- **Bearer Token**: JWT or other bearer tokens
- **API Key**: In headers or query parameters
- **OAuth2**: Bearer token based

Authentication can be configured globally or overridden per request.

## Example Configuration

Your `config.json` should specify either OpenAPI or Postman configuration as shown above.

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
