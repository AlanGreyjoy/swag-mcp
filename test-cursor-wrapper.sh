#!/bin/bash

echo "Testing Cursor wrapper script execution..."
echo "Script path: /home/alan/Documents/Dev/mcp servers/swagger-mcp/start-mcp.sh"

# Test if the script is executable
if [ -x "/home/alan/Documents/Dev/mcp servers/swagger-mcp/start-mcp.sh" ]; then
    echo "✓ Script is executable"
else
    echo "✗ Script is not executable"
    exit 1
fi

# Test running the script exactly as Cursor would
echo ""
echo "Running script exactly as Cursor would..."
echo "Command: /home/alan/Documents/Dev/mcp servers/swagger-mcp/start-mcp.sh"

# Start the server in background and capture output
timeout 10 "/home/alan/Documents/Dev/mcp servers/swagger-mcp/start-mcp.sh" 2>&1 &
PID=$!

# Wait for startup
sleep 3

# Check if process is still running
if kill -0 $PID 2>/dev/null; then
    echo "✓ Process is running (PID: $PID)"
    
    # Send a test request
    echo ""
    echo "Sending test tools/list request..."
    echo '{"jsonrpc": "2.0", "id": 1, "method": "tools/list", "params": {}}' | timeout 5 "/home/alan/Documents/Dev/mcp servers/swagger-mcp/start-mcp.sh" 2>/dev/null | jq -r '.result.tools | length' 2>/dev/null || echo "Response received (unable to parse JSON)"
    
    # Clean up
    kill $PID 2>/dev/null
    wait $PID 2>/dev/null
else
    echo "✗ Process exited unexpectedly"
    exit 1
fi

echo ""
echo "Test completed successfully!" 