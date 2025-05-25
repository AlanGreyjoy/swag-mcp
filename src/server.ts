import express, { Request, Response, Router } from "express";
import cors from "cors";
import dotenv from "dotenv";
import { SwaggerMcpServer } from "./mcp-server";
import { PostmanMcpServer } from "./postman-mcp-server";
import { loadConfig } from "./config";

// Load environment variables
dotenv.config();

const app = express();
const router = Router();
let mcpServer: SwaggerMcpServer | PostmanMcpServer | null = null;

// Middleware
// app.use(cors());
// app.use(express.json());

// Routes
const handleSSE = async (req: Request, res: Response) => {
  console.debug("SSE connection request received");
  if (!mcpServer) {
    console.warn("MCP server not initialized - rejecting SSE connection");
    res.status(400).json({ error: "MCP server not initialized" });
    return;
  }
  console.debug("Establishing SSE connection...");
  mcpServer.handleSSE(res);
};

const handleMessage = async (req: Request, res: Response) => {
  console.debug("Message received:", {
    method: req.method,
    path: req.path,
    body: req.body,
  });
  if (!mcpServer) {
    console.warn("MCP server not initialized - rejecting message");
    res.status(400).json({ error: "MCP server not initialized" });
    return;
  }
  mcpServer.handleMessage(req, res);
};

const handleHealth = (_req: Request, res: Response) => {
  console.debug("Health check request received");
  res.json({
    status: "ok",
    mcpServer: mcpServer ? "initialized" : "not initialized",
  });
};

// // Register routes
// router.get('/sse', handleSSE);
// router.post('/messages', handleMessage);
// router.get('/health', handleHealth);

// Mount router
// app.use('/', router);

app.get("/sse", handleSSE);
app.post("/messages", handleMessage);
app.get("/health", handleHealth);

// Initialize server
async function initializeServer() {
  try {
    console.log("Starting server initialization...");

    // Load configuration
    const config = await loadConfig();
    // set app logging level
    process.env.LOG_LEVEL = config.log?.level || "info";

    console.debug("Configuration loaded:", {
      apiType: config.api.type,
      hasDefaultAuth: !!(
        config.api.openapi?.defaultAuth ||
        config.api.postman?.defaultAuth ||
        config.swagger?.defaultAuth
      ),
    });

    // Create and initialize MCP server based on configuration
    if (config.api.type === "postman") {
      if (!config.api.postman) {
        throw new Error(
          'Postman configuration is required when api.type is "postman"'
        );
      }

      console.log("Creating Postman MCP server instance...");
      mcpServer = new PostmanMcpServer(config.api.postman.defaultAuth);

      // Load collection
      const collectionSource =
        config.api.postman.collectionUrl || config.api.postman.collectionFile;
      if (!collectionSource) {
        throw new Error(
          "Either collectionUrl or collectionFile must be specified for Postman configuration"
        );
      }

      console.log("Loading Postman collection...");
      await mcpServer.loadCollection(collectionSource);

      // Load environment if specified
      const environmentSource =
        config.api.postman.environmentUrl || config.api.postman.environmentFile;
      if (environmentSource) {
        console.log("Loading Postman environment...");
        await mcpServer.loadEnvironment(environmentSource);
      }

      console.debug("Postman collection loaded successfully");
    } else {
      // Default to OpenAPI/Swagger
      const openApiConfig = config.api.openapi || config.swagger;
      if (!openApiConfig) {
        throw new Error(
          'OpenAPI configuration is required when api.type is "openapi" or for legacy swagger config'
        );
      }

      console.log("Creating OpenAPI MCP server instance...");
      mcpServer = new SwaggerMcpServer(
        openApiConfig.apiBaseUrl,
        openApiConfig.defaultAuth
      );

      console.log("Loading OpenAPI specification...");
      await mcpServer.loadSwaggerSpec(openApiConfig.url);
      console.debug("OpenAPI specification loaded successfully");
    }

    // Start the server
    app.listen(config.server.port, config.server.host, () => {
      console.log("Server initialization complete");
      console.log(
        `Server is running on http://${config.server.host}:${config.server.port}`
      );
      if (config.api.type === "postman") {
        const postmanConfig = config.api.postman!;
        console.log(
          "Postman collection loaded from:",
          postmanConfig.collectionUrl || postmanConfig.collectionFile
        );
        if (postmanConfig.environmentUrl || postmanConfig.environmentFile) {
          console.log(
            "Postman environment loaded from:",
            postmanConfig.environmentUrl || postmanConfig.environmentFile
          );
        }
      } else {
        const openApiConfig = config.api.openapi || config.swagger!;
        console.log("OpenAPI specification loaded from:", openApiConfig.url);
        console.log("API Base URL:", openApiConfig.apiBaseUrl);
      }
    });
  } catch (error) {
    console.error("Failed to initialize server:", error);
    process.exit(1);
  }
}

// Start the server
initializeServer();
