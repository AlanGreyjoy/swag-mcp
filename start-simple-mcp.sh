#!/bin/bash

# Change to the correct directory
cd "/home/alan/Documents/Dev/mcp-servers/swagger-mcp"

# Set environment variables
export NODE_ENV=production

echo "🚀 Starting SIMPLIFIED MCP Server with only 4 strategic tools"
echo "   (instead of 300+ individual endpoint tools)"
echo ""
echo "Available tools:"
echo "  1. list_endpoints - List all available API endpoints"
echo "  2. get_endpoint_details - Get detailed info about specific endpoints"
echo "  3. search_endpoints - Search endpoints by keyword"
echo "  4. make_api_call - Make actual API calls"
echo ""

# Start the simplified MCP server
exec node dist/simple-stdio.js 