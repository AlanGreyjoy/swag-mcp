import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import axios from "axios";
import {
  Collection,
  VariableDefinition,
  Request as PostmanRequest,
  Item,
  ItemGroup,
} from "postman-collection";
import { Request, Response } from "express";
import { AuthConfig, ToolInput } from "./types.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";

let transport: SSEServerTransport | null = null;

export class PostmanMcpServer {
  private mcpServer: McpServer;
  private collection: Collection | null = null;
  private environment: Record<string, any> = {};
  private defaultAuth: AuthConfig | undefined;

  constructor(defaultAuth?: AuthConfig) {
    if (process.env.NODE_ENV !== "production") {
      console.debug("PostmanMcpServer constructor", defaultAuth);
    }
    this.defaultAuth = defaultAuth;
    this.mcpServer = new McpServer({
      name: "Postman Collection MCP Server",
      version: "1.0.0",
    });
  }

  private getAuthHeaders(auth?: AuthConfig): Record<string, string> {
    const authConfig = auth || this.defaultAuth;
    if (!authConfig) return {};

    switch (authConfig.type) {
      case "basic":
        if (authConfig.username && authConfig.password) {
          const credentials = Buffer.from(
            `${authConfig.username}:${authConfig.password}`
          ).toString("base64");
          return { Authorization: `Basic ${credentials}` };
        }
        break;
      case "bearer":
        if (authConfig.token) {
          return { Authorization: `Bearer ${authConfig.token}` };
        }
        break;
      case "apiKey":
        if (
          authConfig.apiKey &&
          authConfig.apiKeyName &&
          authConfig.apiKeyIn === "header"
        ) {
          return { [authConfig.apiKeyName]: authConfig.apiKey };
        }
        break;
      case "oauth2":
        if (authConfig.token) {
          return { Authorization: `Bearer ${authConfig.token}` };
        }
        break;
    }
    return {};
  }

  private getAuthQueryParams(auth?: AuthConfig): Record<string, string> {
    const authConfig = auth || this.defaultAuth;
    if (!authConfig) return {};

    if (
      authConfig.type === "apiKey" &&
      authConfig.apiKey &&
      authConfig.apiKeyName &&
      authConfig.apiKeyIn === "query"
    ) {
      return { [authConfig.apiKeyName]: authConfig.apiKey };
    }

    return {};
  }

  private createAuthSchema(): z.ZodType<any> {
    return z
      .object({
        type: z
          .enum(["none", "basic", "bearer", "apiKey", "oauth2"])
          .default("none"),
        username: z.string().optional(),
        password: z.string().optional(),
        token: z.string().optional(),
        apiKey: z.string().optional(),
        apiKeyName: z.string().optional(),
        apiKeyIn: z.enum(["header", "query"]).optional(),
      })
      .describe("Authentication configuration for the request");
  }

  async loadCollection(collectionUrlOrFile: string) {
    if (process.env.NODE_ENV !== "production") {
      console.debug("Loading Postman collection from:", collectionUrlOrFile);
    }
    try {
      let collectionData: any;

      if (collectionUrlOrFile.startsWith("http")) {
        const response = await axios.get(collectionUrlOrFile);
        collectionData = response.data;
      } else {
        const fs = await import("fs/promises");
        const fileContent = await fs.readFile(collectionUrlOrFile, "utf-8");
        collectionData = JSON.parse(fileContent);
      }

      this.collection = new Collection(collectionData);

      // Get collection info safely from the original data and collection object
      const info = {
        name:
          (this.collection as any).name ||
          collectionData.info?.name ||
          "Postman Collection",
        description:
          (this.collection as any).description ||
          collectionData.info?.description ||
          "",
        version:
          (this.collection as any).version ||
          collectionData.info?.version ||
          "1.0.0",
      };

      if (process.env.NODE_ENV !== "production") {
        console.debug("Loaded Postman collection:", {
          name: info.name,
          description:
            typeof info.description === "string"
              ? info.description.substring(0, 100) + "..."
              : "",
        });
      }

      // Update server name with collection info
      this.mcpServer = new McpServer({
        name: info.name || "Postman Collection Server",
        version: info.version || "1.0.0",
        description:
          typeof info.description === "string" ? info.description : undefined,
      });

      await this.registerTools();
    } catch (error) {
      console.error("Failed to load Postman collection:", error);
      throw error;
    }
  }

  async loadEnvironment(environmentUrlOrFile: string) {
    if (process.env.NODE_ENV !== "production") {
      console.debug("Loading Postman environment from:", environmentUrlOrFile);
    }
    try {
      let environmentData: any;

      if (environmentUrlOrFile.startsWith("http")) {
        const response = await axios.get(environmentUrlOrFile);
        environmentData = response.data;
      } else {
        const fs = await import("fs/promises");
        const fileContent = await fs.readFile(environmentUrlOrFile, "utf-8");
        environmentData = JSON.parse(fileContent);
      }

      // Parse environment variables
      if (environmentData.values) {
        for (const variable of environmentData.values) {
          this.environment[variable.key] = variable.value;
        }
      }

      if (process.env.NODE_ENV !== "production") {
        console.debug(
          "Loaded environment variables:",
          Object.keys(this.environment)
        );
      }
    } catch (error) {
      console.error("Failed to load Postman environment:", error);
      throw error;
    }
  }

  private resolveVariables(text: string): string {
    if (!text) return text;

    // Replace {{variableName}} with actual values
    return text.replace(/\{\{(\w+)\}\}/g, (match, variableName) => {
      return this.environment[variableName] || match;
    });
  }

  private createParameterSchema(request: PostmanRequest): z.ZodObject<any> {
    const schema: any = {};

    // Add auth parameter
    schema.auth = this.createAuthSchema();

    // Handle query parameters
    if (request.url && request.url.query) {
      request.url.query.each((param: any) => {
        if (param.key && !param.disabled) {
          const paramName = `query_${param.key}`;
          schema[paramName] = param.description
            ? z.string().optional().describe(param.description)
            : z.string().optional();
        }
      });
    }

    // Handle path variables
    if (request.url && request.url.variables) {
      request.url.variables.each((variable: any) => {
        if (variable.key) {
          const paramName = `path_${variable.key}`;
          schema[paramName] = variable.description
            ? z.string().describe(variable.description)
            : z.string();
        }
      });
    }

    // Handle headers (make them optional)
    if (request.headers) {
      request.headers.each((header: any) => {
        if (
          header.key &&
          !header.disabled &&
          !header.key.toLowerCase().startsWith("authorization")
        ) {
          const paramName = `header_${header.key}`;
          schema[paramName] = header.description
            ? z.string().optional().describe(header.description)
            : z.string().optional();
        }
      });
    }

    // Handle request body for POST/PUT/PATCH
    if (
      request.body &&
      ["POST", "PUT", "PATCH"].includes(request.method || "")
    ) {
      if (request.body.mode === "raw") {
        schema.body = z
          .string()
          .optional()
          .describe("Request body (JSON, XML, or plain text)");
      } else if (request.body.mode === "formdata") {
        schema.body = z
          .record(z.string())
          .optional()
          .describe("Form data as key-value pairs");
      }
    }

    return z.object(schema);
  }

  private async registerTools() {
    if (!this.collection) return;

    const usedToolNames = new Set<string>();

    const generateUniqueToolName = (baseName: string): string => {
      let toolName = baseName.replace(/[^a-zA-Z0-9_]/g, "_").toLowerCase();

      // Remove multiple consecutive underscores
      toolName = toolName.replace(/_+/g, "_");

      // Remove leading/trailing underscores
      toolName = toolName.replace(/^_+|_+$/g, "");

      // Ensure it doesn't start with a number
      if (/^\d/.test(toolName)) {
        toolName = `api_${toolName}`;
      }

      // If empty, provide a default
      if (!toolName) {
        toolName = "unnamed_request";
      }

      // Make it unique by adding a suffix if needed
      let uniqueName = toolName;
      let counter = 1;
      while (usedToolNames.has(uniqueName)) {
        uniqueName = `${toolName}_${counter}`;
        counter++;
      }

      usedToolNames.add(uniqueName);
      return uniqueName;
    };

    const registerItem = (
      item: Item | ItemGroup<Item>,
      prefix: string = ""
    ) => {
      if (item instanceof Item && item.request) {
        const request = item.request;
        const baseName = `${prefix}${item.name}`;
        const toolName = generateUniqueToolName(baseName);

        // Handle description safely
        let description = `Execute ${item.name} request`;
        if (item.request.description) {
          if (typeof item.request.description === "string") {
            description = item.request.description;
          } else if (
            typeof item.request.description === "object" &&
            "content" in item.request.description
          ) {
            description = (item.request.description as any).content;
          }
        }

        const inputSchema = this.createParameterSchema(request);

        if (process.env.NODE_ENV !== "production") {
          console.debug(
            `Registering tool: ${toolName} for request: ${item.name}`
          );
        }

        this.mcpServer.tool(
          toolName,
          description,
          { input: inputSchema },
          async ({ input }: { input: ToolInput }) => {
            try {
              const result = await this.executeRequest(request, input);
              return {
                content: [
                  { type: "text", text: JSON.stringify(result, null, 2) },
                ],
              };
            } catch (error) {
              return {
                content: [
                  {
                    type: "text",
                    text: `Error: ${
                      error instanceof Error ? error.message : String(error)
                    }`,
                  },
                ],
              };
            }
          }
        );
      } else if (item instanceof ItemGroup) {
        // Handle folders recursively
        const folderPrefix = `${prefix}${item.name}_`
          .replace(/[^a-zA-Z0-9_]/g, "_")
          .toLowerCase();
        item.items.each((subItem: Item | ItemGroup<Item>) => {
          registerItem(subItem, folderPrefix);
        });
      }
    };

    // Register all items
    this.collection.items.each((item: Item | ItemGroup<Item>) => {
      registerItem(item);
    });

    console.log(
      `Registered ${usedToolNames.size} unique Postman collection tools`
    );
  }

  private async executeRequest(
    request: PostmanRequest,
    input: ToolInput
  ): Promise<any> {
    // Build URL
    let url = request.url?.toString() || "";
    url = this.resolveVariables(url);

    // Replace path variables
    Object.keys(input).forEach((key) => {
      if (key.startsWith("path_")) {
        const varName = key.replace("path_", "");
        url = url.replace(`:${varName}`, input[key]);
        url = url.replace(`{{${varName}}}`, input[key]);
      }
    });

    // Build query parameters
    const queryParams = this.getAuthQueryParams(input.auth);
    Object.keys(input).forEach((key) => {
      if (key.startsWith("query_")) {
        const paramName = key.replace("query_", "");
        if (input[key] !== undefined) {
          queryParams[paramName] = input[key];
        }
      }
    });

    // Build headers
    const headers = this.getAuthHeaders(input.auth);
    Object.keys(input).forEach((key) => {
      if (key.startsWith("header_")) {
        const headerName = key.replace("header_", "");
        if (input[key] !== undefined) {
          headers[headerName] = input[key];
        }
      }
    });

    // Add default content type for requests with body
    if (input.body && !headers["Content-Type"]) {
      headers["Content-Type"] = "application/json";
    }

    // Prepare request configuration
    const config: any = {
      method: request.method || "GET",
      url,
      headers,
      params: queryParams,
    };

    // Add body if present
    if (input.body) {
      if (typeof input.body === "string") {
        config.data = input.body;
      } else {
        config.data = JSON.stringify(input.body);
      }
    }

    if (process.env.NODE_ENV !== "production") {
      console.debug("Executing request:", {
        method: config.method,
        url: config.url,
        headers: Object.keys(config.headers),
        hasBody: !!config.data,
      });
    }

    try {
      const response = await axios(config);
      return {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
        data: response.data,
      };
    } catch (error: any) {
      if (error.response) {
        return {
          status: error.response.status,
          statusText: error.response.statusText,
          headers: error.response.headers,
          data: error.response.data,
          error: true,
        };
      }
      throw error;
    }
  }

  getServer() {
    return this.mcpServer;
  }

  handleSSE(res: Response) {
    if (!transport) {
      transport = new SSEServerTransport("/messages", res);
    }
    this.mcpServer.connect(transport);
  }

  handleMessage(req: Request, res: Response) {
    this.mcpServer.connect(transport!);
  }
}
