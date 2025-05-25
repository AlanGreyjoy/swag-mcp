#!/bin/bash

# Change to the correct directory
cd "/home/alan/Documents/Dev/mcp-servers/swagger-mcp"

# Set environment variables
export NODE_ENV=production

# Start the simplified MCP server (only 4 strategic tools instead of 300+)
exec node dist/simple-stdio.js 