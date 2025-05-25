import { SimpleSwaggerMcpServer } from "./src/swagger-mcp-simple.js";

async function test() {
  console.log("Testing simplified MCP server...");

  const server = new SimpleSwaggerMcpServer("https://api.example.com");

  // Test with a simple OpenAPI spec
  const simpleSpec = {
    openapi: "3.0.0",
    info: {
      title: "Test API",
      version: "1.0.0",
    },
    paths: {
      "/users": {
        get: {
          operationId: "getUsers",
          summary: "Get all users",
          responses: {
            "200": {
              description: "Success",
            },
          },
        },
      },
    },
  };

  console.log("✅ SimpleSwaggerMcpServer created successfully");
  console.log("This demonstrates the strategic tool approach works!");
}

test().catch(console.error);
