import { SimpleSwaggerMcpServer } from "./swagger-mcp-simple.js";
import { loadConfig } from "./config.js";

async function main() {
  try {
    const configPath = process.argv[2] || undefined;
    const config = await loadConfig(configPath);

    // Use new config structure or fallback to legacy
    const openApiConfig =
      config.api.type === "openapi" ? config.api.openapi : config.swagger;

    if (!openApiConfig) {
      throw new Error("No OpenAPI configuration found");
    }

    console.log("Creating MCP server with config:", {
      apiBaseUrl: openApiConfig.apiBaseUrl,
      authType: openApiConfig.defaultAuth?.type,
    });

    const server = new SimpleSwaggerMcpServer(
      openApiConfig.apiBaseUrl,
      openApiConfig.defaultAuth && openApiConfig.defaultAuth.type
        ? (openApiConfig.defaultAuth as any)
        : undefined
    );

    // Load the swagger spec
    await server.loadSwaggerSpec(openApiConfig.url);

    console.log(
      "✅ Simple MCP Server successfully initialized with strategic tools!"
    );
    console.log("Now you have only 4 tools instead of hundreds:");
    console.log("  1. list_endpoints - List all available API endpoints");
    console.log(
      "  2. get_endpoint_details - Get detailed info about specific endpoints"
    );
    console.log("  3. search_endpoints - Search endpoints by keyword");
    console.log("  4. make_api_call - Make actual API calls");
    console.log("");
    console.log("This approach allows AI agents to:");
    console.log("  - Discover APIs dynamically");
    console.log("  - Get required parameter info");
    console.log("  - Make informed API calls");
    console.log("  - Search for relevant endpoints");

    return server.getServer();
  } catch (error) {
    console.error("Failed to initialize MCP server:", error);
    process.exit(1);
  }
}

main().catch(console.error);
