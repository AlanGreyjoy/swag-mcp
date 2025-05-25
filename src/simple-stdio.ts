import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { loadConfig } from "./config.js";
import { SimpleSwaggerMcpServer } from "./swagger-mcp-simple.js";
import { SimplePostmanMcpServer } from "./postman-mcp-simple.js";

async function main() {
  try {
    console.error(`[SIMPLE-STDIO] Starting simplified MCP server via stdio...`);
    console.error(`[SIMPLE-STDIO] Process ID: ${process.pid}`);
    console.error(`[SIMPLE-STDIO] Working directory: ${process.cwd()}`);

    // Load configuration
    console.error(`[SIMPLE-STDIO] Loading configuration...`);
    const config = await loadConfig();

    let mcpServer: SimpleSwaggerMcpServer | SimplePostmanMcpServer;

    // Create and initialize MCP server based on configuration
    if (config.api.type === "postman") {
      if (!config.api.postman) {
        throw new Error(
          'Postman configuration is required when api.type is "postman"'
        );
      }

      console.error(
        "[SIMPLE-STDIO] Creating simplified Postman MCP server instance..."
      );
      console.error(
        "✅ Using simplified Postman explorer with only 4 strategic tools!"
      );

      mcpServer = new SimplePostmanMcpServer(config.api.postman.defaultAuth);

      // Load collection
      const collectionSource =
        config.api.postman.collectionUrl || config.api.postman.collectionFile;
      if (!collectionSource) {
        throw new Error(
          "Either collectionUrl or collectionFile must be specified for Postman configuration"
        );
      }

      console.error("[SIMPLE-STDIO] Loading Postman collection...");
      await (mcpServer as SimplePostmanMcpServer).loadCollection(
        collectionSource
      );

      // Load environment if specified
      const environmentSource =
        config.api.postman.environmentUrl || config.api.postman.environmentFile;
      if (environmentSource) {
        console.error("[SIMPLE-STDIO] Loading Postman environment...");
        await (mcpServer as SimplePostmanMcpServer).loadEnvironment(
          environmentSource
        );
      }

      console.error("[SIMPLE-STDIO] Postman collection loaded successfully");

      console.error(
        "✅ Simple MCP Server successfully initialized with strategic tools!"
      );
      console.error("Now you have only 4 tools instead of hundreds:");
      console.error(
        "  1. list_requests - List all available requests in the collection"
      );
      console.error(
        "  2. get_request_details - Get detailed info about specific requests"
      );
      console.error("  3. search_requests - Search requests by keyword");
      console.error(
        "  4. make_request - Execute any request from the collection"
      );
    } else {
      // Default to OpenAPI/Swagger with simplified tools
      const openApiConfig = config.api.openapi || config.swagger;
      if (!openApiConfig) {
        throw new Error(
          'OpenAPI configuration is required when api.type is "openapi" or for legacy swagger config'
        );
      }

      console.error(
        "[SIMPLE-STDIO] Creating simplified OpenAPI MCP server instance..."
      );
      mcpServer = new SimpleSwaggerMcpServer(
        openApiConfig.apiBaseUrl,
        openApiConfig.defaultAuth && openApiConfig.defaultAuth.type
          ? (openApiConfig.defaultAuth as any)
          : undefined
      );

      console.error("[SIMPLE-STDIO] Loading OpenAPI specification...");
      await mcpServer.loadSwaggerSpec(openApiConfig.url);
      console.error("[SIMPLE-STDIO] OpenAPI specification loaded successfully");

      console.error(
        "✅ Simple MCP Server successfully initialized with strategic tools!"
      );
      console.error("Now you have only 4 tools instead of hundreds:");
      console.error("  1. list_endpoints - List all available API endpoints");
      console.error(
        "  2. get_endpoint_details - Get detailed info about specific endpoints"
      );
      console.error("  3. search_endpoints - Search endpoints by keyword");
      console.error("  4. make_api_call - Make actual API calls");
    }

    // Get the MCP server instance
    const server = mcpServer.getServer();

    // Create stdio transport
    console.error(`[SIMPLE-STDIO] Creating stdio transport...`);
    const transport = new StdioServerTransport();

    // Connect the MCP server to stdio transport
    console.error(`[SIMPLE-STDIO] Connecting MCP server to stdio transport...`);
    await server.connect(transport);

    console.error(
      "[SIMPLE-STDIO] Simplified MCP server connected via stdio successfully!"
    );
    console.error(
      `[SIMPLE-STDIO] Server is ready and listening for requests...`
    );

    // Handle process termination gracefully
    process.on("SIGINT", () => {
      console.error(
        "[SIMPLE-STDIO] Received SIGINT, shutting down gracefully..."
      );
      process.exit(0);
    });

    process.on("SIGTERM", () => {
      console.error(
        "[SIMPLE-STDIO] Received SIGTERM, shutting down gracefully..."
      );
      process.exit(0);
    });
  } catch (error) {
    console.error(
      "[SIMPLE-STDIO] Failed to start simplified MCP server:",
      error
    );
    process.exit(1);
  }
}

// Handle uncaught exceptions and rejections
process.on("uncaughtException", (error) => {
  console.error("[SIMPLE-STDIO] Uncaught Exception:", error);
  process.exit(1);
});

process.on("unhandledRejection", (reason, promise) => {
  console.error(
    "[SIMPLE-STDIO] Unhandled Rejection at:",
    promise,
    "reason:",
    reason
  );
  process.exit(1);
});

main().catch((error) => {
  console.error("[SIMPLE-STDIO] Unhandled error:", error);
  process.exit(1);
});
