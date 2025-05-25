import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import axios from "axios";
import {
  Collection,
  Request as PostmanRequest,
  Item,
  ItemGroup,
} from "postman-collection";
import { Request, Response } from "express";
import { AuthConfig, ToolInput } from "./types.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";

let transport: SSEServerTransport | null = null;

export class SimplePostmanMcpServer {
  private mcpServer: McpServer;
  private collection: Collection | null = null;
  private environment: Record<string, any> = {};
  private defaultAuth: AuthConfig | undefined;
  private requests: Array<{
    id: string;
    name: string;
    method: string;
    url: string;
    description: string;
    folder: string;
    request: PostmanRequest;
  }> = [];

  constructor(defaultAuth?: AuthConfig) {
    if (process.env.NODE_ENV !== "production") {
      console.debug("SimplePostmanMcpServer constructor", defaultAuth);
    }
    this.defaultAuth = defaultAuth;
    this.mcpServer = new McpServer({
      name: "Simple Postman Collection MCP Server",
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

      // Get collection info safely
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
        name:
          `${info.name} - Simple Explorer` ||
          "Simple Postman Collection Server",
        version: info.version || "1.0.0",
        description: `Simplified explorer for ${info.name}` || undefined,
      });

      // Parse all requests for the strategic tools
      this.parseAllRequests();

      await this.registerStrategicTools();
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

  private parseAllRequests() {
    if (!this.collection) return;

    this.requests = [];

    const parseItem = (
      item: Item | ItemGroup<Item>,
      folderPath: string = ""
    ) => {
      if (item instanceof Item && item.request) {
        const request = item.request;

        // Handle description safely
        let description = "";
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

        this.requests.push({
          id: `${folderPath}${item.name}`
            .replace(/[^a-zA-Z0-9_]/g, "_")
            .toLowerCase(),
          name: item.name || "Unnamed Request",
          method: request.method || "GET",
          url: request.url?.toString() || "",
          description,
          folder: folderPath,
          request,
        });
      } else if (item instanceof ItemGroup) {
        // Handle folders recursively
        const newFolderPath = folderPath
          ? `${folderPath}/${item.name}`
          : item.name;
        item.items.each((subItem: Item | ItemGroup<Item>) => {
          parseItem(subItem, newFolderPath);
        });
      }
    };

    // Parse all items
    this.collection.items.each((item: Item | ItemGroup<Item>) => {
      parseItem(item);
    });

    console.log(
      `✅ Parsed ${this.requests.length} requests from Postman collection`
    );
  }

  private resolveVariables(text: string): string {
    if (!text) return text;

    // Replace {{variableName}} with actual values
    return text.replace(/\{\{(\w+)\}\}/g, (match, variableName) => {
      return this.environment[variableName] || match;
    });
  }

  private async registerStrategicTools() {
    // Tool 1: List all requests
    this.mcpServer.tool(
      "list_requests",
      "List all available requests in the Postman collection with basic information",
      {
        input: z.object({
          method: z
            .string()
            .optional()
            .describe("Filter by HTTP method (GET, POST, PUT, DELETE, etc.)"),
          folder: z.string().optional().describe("Filter by folder/path"),
          limit: z
            .number()
            .optional()
            .default(50)
            .describe("Maximum number of requests to return"),
        }),
      },
      async ({ input }) => {
        let filteredRequests = this.requests;

        // Apply filters
        if (input.method) {
          filteredRequests = filteredRequests.filter(
            (req) => req.method.toLowerCase() === input.method!.toLowerCase()
          );
        }

        if (input.folder) {
          filteredRequests = filteredRequests.filter((req) =>
            req.folder.toLowerCase().includes(input.folder!.toLowerCase())
          );
        }

        // Limit results
        const limitedRequests = filteredRequests.slice(0, input.limit);

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  total: limitedRequests.length,
                  requests: limitedRequests.map((req) => ({
                    id: req.id,
                    name: req.name,
                    method: req.method,
                    url: req.url,
                    folder: req.folder,
                    description:
                      req.description.substring(0, 100) +
                      (req.description.length > 100 ? "..." : ""),
                  })),
                },
                null,
                2
              ),
            },
          ],
        };
      }
    );

    // Tool 2: Get detailed information about a specific request
    this.mcpServer.tool(
      "get_request_details",
      "Get detailed information about a specific request including parameters, headers, and body structure",
      {
        input: z.object({
          requestId: z.string().describe("The ID of the request"),
          name: z
            .string()
            .optional()
            .describe("The name of the request (alternative to ID)"),
        }),
      },
      async ({ input }) => {
        let targetRequest = null;

        // Find the request by ID or name
        for (const req of this.requests) {
          if (
            req.id === input.requestId ||
            req.name.toLowerCase() === input.name?.toLowerCase()
          ) {
            targetRequest = req;
            break;
          }
        }

        if (!targetRequest) {
          return {
            content: [
              {
                type: "text",
                text: `Request not found. Use list_requests to see available requests.`,
              },
            ],
          };
        }

        const request = targetRequest.request;

        // Extract parameters information
        const parameters = {
          query: [] as any[],
          path: [] as any[],
          headers: [] as any[],
        };

        // Query parameters
        if (request.url && request.url.query) {
          request.url.query.each((param: any) => {
            if (param.key && !param.disabled) {
              parameters.query.push({
                name: param.key,
                value: param.value || "",
                description: param.description || "",
              });
            }
          });
        }

        // Path variables
        if (request.url && request.url.variables) {
          request.url.variables.each((variable: any) => {
            if (variable.key) {
              parameters.path.push({
                name: variable.key,
                value: variable.value || "",
                description: variable.description || "",
              });
            }
          });
        }

        // Headers
        if (request.headers) {
          request.headers.each((header: any) => {
            if (header.key && !header.disabled) {
              parameters.headers.push({
                name: header.key,
                value: header.value || "",
                description: header.description || "",
              });
            }
          });
        }

        // Request body info
        let bodyInfo: any = null;
        if (
          request.body &&
          ["POST", "PUT", "PATCH"].includes(request.method || "")
        ) {
          bodyInfo = {
            mode: request.body.mode,
            description: "Request body based on the collection definition",
          } as any;

          if (request.body.mode === "raw") {
            bodyInfo.example = request.body.raw || "";
          } else if (request.body.mode === "formdata") {
            bodyInfo.formFields = [];
            if (request.body.formdata) {
              request.body.formdata.each((field: any) => {
                if (field.key && !field.disabled) {
                  bodyInfo.formFields.push({
                    name: field.key,
                    type: field.type || "text",
                    value: field.value || "",
                    description: field.description || "",
                  });
                }
              });
            }
          }
        }

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  id: targetRequest.id,
                  name: targetRequest.name,
                  method: targetRequest.method,
                  url: targetRequest.url,
                  folder: targetRequest.folder,
                  description: targetRequest.description,
                  parameters,
                  body: bodyInfo,
                  auth: "Use the auth parameter in make_request to provide authentication",
                },
                null,
                2
              ),
            },
          ],
        };
      }
    );

    // Tool 3: Search requests by keyword
    this.mcpServer.tool(
      "search_requests",
      "Search requests by keyword in name, description, URL, or folder",
      {
        input: z.object({
          query: z
            .string()
            .describe(
              "Search term to look for in request names, descriptions, URLs, or folders"
            ),
          limit: z
            .number()
            .optional()
            .default(20)
            .describe("Maximum number of results to return"),
        }),
      },
      async ({ input }) => {
        const query = input.query.toLowerCase();
        const results = [];

        for (const req of this.requests) {
          const searchText = [
            req.name,
            req.description,
            req.url,
            req.folder,
            req.method,
          ]
            .join(" ")
            .toLowerCase();

          if (searchText.includes(query)) {
            results.push({
              id: req.id,
              name: req.name,
              method: req.method,
              url: req.url,
              folder: req.folder,
              description:
                req.description.substring(0, 100) +
                (req.description.length > 100 ? "..." : ""),
              relevance: this.calculateRelevance(query, searchText),
            });

            if (results.length >= input.limit) break;
          }
        }

        // Sort by relevance
        results.sort((a, b) => b.relevance - a.relevance);

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  query: input.query,
                  total: results.length,
                  results: results.map((r) => ({ ...r, relevance: undefined })), // Remove relevance from output
                },
                null,
                2
              ),
            },
          ],
        };
      }
    );

    // Tool 4: Make request
    this.mcpServer.tool(
      "make_request",
      "Execute any request from the Postman collection with the specified parameters and authentication",
      {
        input: z.object({
          requestId: z.string().optional().describe("The ID of the request"),
          name: z
            .string()
            .optional()
            .describe("The name of the request (alternative to ID)"),
          parameters: z
            .record(z.any())
            .optional()
            .describe(
              "Query parameters, path parameters, headers, or form data"
            ),
          body: z
            .any()
            .optional()
            .describe("Request body (for POST, PUT, PATCH requests)"),
          auth: this.createAuthSchema()
            .optional()
            .describe("Authentication configuration"),
        }),
      },
      async ({ input }) => {
        // Find the request
        let targetRequest = null;

        for (const req of this.requests) {
          if (
            req.id === input.requestId ||
            req.name.toLowerCase() === input.name?.toLowerCase()
          ) {
            targetRequest = req;
            break;
          }
        }

        if (!targetRequest) {
          return {
            content: [
              {
                type: "text",
                text: `Request not found. Use list_requests to see available requests.`,
              },
            ],
          };
        }

        try {
          const result = await this.executeRequest(
            targetRequest.request,
            input.parameters || {},
            input.body,
            input.auth
          );
          return {
            content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
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

    console.log(
      "✅ Successfully registered 4 strategic tools for Postman collection exploration"
    );
  }

  private calculateRelevance(query: string, text: string): number {
    const queryWords = query.split(" ");
    let score = 0;

    queryWords.forEach((word) => {
      if (text.includes(word)) {
        score += 1;
        // Bonus for exact word matches
        if (
          text.includes(` ${word} `) ||
          text.startsWith(word) ||
          text.endsWith(word)
        ) {
          score += 0.5;
        }
      }
    });

    return score;
  }

  private async executeRequest(
    request: PostmanRequest,
    parameters: Record<string, any>,
    body?: any,
    auth?: AuthConfig
  ): Promise<any> {
    // Build URL
    let url = request.url?.toString() || "";
    url = this.resolveVariables(url);

    // Replace path variables
    Object.keys(parameters).forEach((key) => {
      const value = parameters[key];
      if (value !== undefined) {
        // Try different variable formats
        url = url.replace(`:${key}`, encodeURIComponent(String(value)));
        url = url.replace(`{{${key}}}`, encodeURIComponent(String(value)));
        url = url.replace(`{${key}}`, encodeURIComponent(String(value)));
      }
    });

    // Build query parameters
    const queryParams = this.getAuthQueryParams(auth);
    Object.keys(parameters).forEach((key) => {
      const value = parameters[key];
      if (
        value !== undefined &&
        !url.includes(`:${key}`) &&
        !url.includes(`{{${key}}}`)
      ) {
        queryParams[key] = value;
      }
    });

    // Build headers
    const headers = this.getAuthHeaders(auth);

    // Add any headers from parameters
    Object.keys(parameters).forEach((key) => {
      const value = parameters[key];
      if (value !== undefined && key.toLowerCase().includes("header")) {
        headers[key] = value;
      }
    });

    // Add default content type for requests with body
    if (body && !headers["Content-Type"]) {
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
    if (body) {
      if (typeof body === "string") {
        config.data = body;
      } else {
        config.data = JSON.stringify(body);
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
