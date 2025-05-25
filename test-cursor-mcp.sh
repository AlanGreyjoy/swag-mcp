#!/bin/bash

echo "Testing Cursor MCP server startup..."
echo "Current directory: $(pwd)"
echo "Target directory: '/home/alan/Documents/Dev/mcp servers/swagger-mcp'"

# Test the exact command Cursor would run
echo ""
echo "Running the exact command that Cursor will execute:"
echo "bash -c \"cd '/home/alan/Documents/Dev/mcp servers/swagger-mcp' && node dist/mcp-stdio.js\""

# Run the command and capture both stdout and stderr
echo ""
echo "=== MCP Server Output ==="
timeout 10 bash -c "cd '/home/alan/Documents/Dev/mcp servers/swagger-mcp' && NODE_ENV=production node dist/mcp-stdio.js" 2>&1 &
PID=$!

# Wait a moment for startup logs
sleep 3

# Send a test request
echo ""
echo "=== Sending test request ==="
echo '{"jsonrpc": "2.0", "id": 1, "method": "tools/list", "params": {}}' | timeout 5 bash -c "cd '/home/alan/Documents/Dev/mcp servers/swagger-mcp' && NODE_ENV=production node dist/mcp-stdio.js" 2>/dev/null | head -1

# Clean up
kill $PID 2>/dev/null
wait $PID 2>/dev/null

echo ""
echo "Test completed." 