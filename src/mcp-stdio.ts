import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { loadConfig } from "./config.js";
import { SwaggerMcpServer } from "./mcp-server.js";
import { PostmanMcpServer } from "./postman-mcp-server.js";

async function main() {
  try {
    console.error(`[MCP-STDIO] Starting MCP server via stdio...`);
    console.error(`[MCP-STDIO] Process ID: ${process.pid}`);
    console.error(`[MCP-STDIO] Working directory: ${process.cwd()}`);
    console.error(
      `[MCP-STDIO] Command line args: ${JSON.stringify(process.argv)}`
    );
    console.error(
      `[MCP-STDIO] Environment NODE_ENV: ${process.env.NODE_ENV || "not set"}`
    );
    console.error(`[MCP-STDIO] Parent process ID: ${process.ppid}`);
    console.error(`[MCP-STDIO] Node version: ${process.version}`);

    // Load configuration
    console.error(`[MCP-STDIO] Loading configuration...`);
    const config = await loadConfig();
    console.error(
      `[MCP-STDIO] Configuration loaded: ${JSON.stringify(config, null, 2)}`
    );

    let mcpServer: SwaggerMcpServer | PostmanMcpServer;

    // Create and initialize MCP server based on configuration
    if (config.api.type === "postman") {
      if (!config.api.postman) {
        throw new Error(
          'Postman configuration is required when api.type is "postman"'
        );
      }

      console.error("[MCP-STDIO] Creating Postman MCP server instance...");
      mcpServer = new PostmanMcpServer(config.api.postman.defaultAuth);

      // Load collection
      const collectionSource =
        config.api.postman.collectionUrl || config.api.postman.collectionFile;
      if (!collectionSource) {
        throw new Error(
          "Either collectionUrl or collectionFile must be specified for Postman configuration"
        );
      }

      console.error("[MCP-STDIO] Loading Postman collection...");
      await mcpServer.loadCollection(collectionSource);

      // Load environment if specified
      const environmentSource =
        config.api.postman.environmentUrl || config.api.postman.environmentFile;
      if (environmentSource) {
        console.error("[MCP-STDIO] Loading Postman environment...");
        await mcpServer.loadEnvironment(environmentSource);
      }

      console.error("[MCP-STDIO] Postman collection loaded successfully");
    } else {
      // Default to OpenAPI/Swagger
      const openApiConfig = config.api.openapi || config.swagger;
      if (!openApiConfig) {
        throw new Error(
          'OpenAPI configuration is required when api.type is "openapi" or for legacy swagger config'
        );
      }

      console.error("[MCP-STDIO] Creating OpenAPI MCP server instance...");
      mcpServer = new SwaggerMcpServer(
        openApiConfig.apiBaseUrl,
        openApiConfig.defaultAuth
      );

      console.error("[MCP-STDIO] Loading OpenAPI specification...");
      await mcpServer.loadSwaggerSpec(openApiConfig.url);
      console.error("[MCP-STDIO] OpenAPI specification loaded successfully");
    }

    // Get tool count before connecting
    const server = mcpServer.getServer();
    console.error(
      `[MCP-STDIO] MCP server instance created, checking tool count...`
    );

    // Create stdio transport
    console.error(`[MCP-STDIO] Creating stdio transport...`);
    const transport = new StdioServerTransport();

    // Connect the MCP server to stdio transport
    console.error(`[MCP-STDIO] Connecting MCP server to stdio transport...`);
    await server.connect(transport);

    console.error("[MCP-STDIO] MCP server connected via stdio successfully!");
    console.error(`[MCP-STDIO] Server is ready and listening for requests...`);

    // Handle process termination gracefully
    process.on("SIGINT", () => {
      console.error("[MCP-STDIO] Received SIGINT, shutting down gracefully...");
      process.exit(0);
    });

    process.on("SIGTERM", () => {
      console.error(
        "[MCP-STDIO] Received SIGTERM, shutting down gracefully..."
      );
      process.exit(0);
    });
  } catch (error) {
    console.error("[MCP-STDIO] Failed to start MCP server:", error);
    process.exit(1);
  }
}

// Handle uncaught exceptions and rejections
process.on("uncaughtException", (error) => {
  console.error("[MCP-STDIO] Uncaught Exception:", error);
  process.exit(1);
});

process.on("unhandledRejection", (reason, promise) => {
  console.error(
    "[MCP-STDIO] Unhandled Rejection at:",
    promise,
    "reason:",
    reason
  );
  process.exit(1);
});

main().catch((error) => {
  console.error("[MCP-STDIO] Unhandled error:", error);
  process.exit(1);
});
