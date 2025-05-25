#!/bin/bash

# ⚠️ IMPORTANT: Update this path to match your installation directory!
# Change this to the full path where you cloned the swag-mcp repository
cd "/path/to/your/swag-mcp"

# Set environment variables
export NODE_ENV=production

# Start the simplified MCP server (only 4 strategic tools instead of 300+)
exec node dist/simple-stdio.js 