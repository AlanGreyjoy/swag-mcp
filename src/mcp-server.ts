import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import axios from "axios";
import SwaggerParser from "@apidevtools/swagger-parser";
import { OpenAPI } from "openapi-types";
import { Request, Response } from "express";
import { AuthConfig, ToolInput, SecurityScheme } from "./types.js";

let transport: SSEServerTransport | null = null;

export class SwaggerMcpServer {
  private mcpServer: McpServer;
  private swaggerSpec: OpenAPI.Document | null = null;
  private apiBaseUrl: string;
  private defaultAuth: AuthConfig | undefined;
  private securitySchemes: Record<string, SecurityScheme> = {};

  constructor(apiBaseUrl: string, defaultAuth?: AuthConfig) {
    console.debug("constructor", apiBaseUrl, defaultAuth);
    this.apiBaseUrl = apiBaseUrl;
    this.defaultAuth = defaultAuth;
    this.mcpServer = new McpServer({
      name: "Swagger API MCP Server",
      version: "1.0.0",
    });
    this.mcpServer.tool(
      "test",
      "test",
      {
        input: z.object({
          test: z.string(),
        }),
      },
      async ({ input }) => {
        return { content: [{ type: "text", text: "Hello, world!" }] };
      }
    );
  }

  private getAuthHeaders(
    auth?: AuthConfig,
    operation?: OpenAPI.Operation
  ): Record<string, string> {
    // Use provided auth or fall back to default auth
    const authConfig = auth || this.defaultAuth;
    if (!authConfig) return {};

    // Check if operation requires specific security
    const requiredSchemes =
      operation?.security || (this.swaggerSpec as any)?.security || [];
    if (requiredSchemes.length === 0) return {};

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
        // For Petstore, we know the API key goes in header named 'api_key'
        if (authConfig.apiKey) {
          return { api_key: authConfig.apiKey };
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

  private extractSecuritySchemes() {
    if (!this.swaggerSpec) return;

    // OpenAPI 3.x
    const components = (this.swaggerSpec as any).components;
    if (components && components.securitySchemes) {
      this.securitySchemes = components.securitySchemes;
      return;
    }

    // Swagger 2.0
    const securityDefinitions = (this.swaggerSpec as any).securityDefinitions;
    if (securityDefinitions) {
      this.securitySchemes = securityDefinitions;
    }
  }

  private createAuthSchema(operation?: OpenAPI.Operation): z.ZodType<any> {
    const authTypes: string[] = ["none"]; // Start with 'none' as default
    const authSchema: any = {};

    // Check operation-specific security requirements
    const requiredSchemes =
      operation?.security || (this.swaggerSpec as any)?.security || [];
    const requiredSchemeNames = new Set(
      requiredSchemes.flatMap((scheme: any) => Object.keys(scheme))
    );

    for (const [key, scheme] of Object.entries(this.securitySchemes)) {
      const securityScheme = scheme as SecurityScheme;
      const isRequired = requiredSchemeNames.has(key);

      switch (securityScheme.type) {
        case "basic":
          authTypes.push("basic");
          if (isRequired || authTypes.length === 1) {
            authSchema.username = z.string();
            authSchema.password = z.string();
          } else {
            authSchema.username = z.string().optional();
            authSchema.password = z.string().optional();
          }
          break;
        case "bearer":
        case "http":
          if (securityScheme.scheme === "bearer") {
            authTypes.push("bearer");
            authSchema.token = isRequired ? z.string() : z.string().optional();
          }
          break;
        case "apiKey":
          authTypes.push("apiKey");
          if (isRequired || authTypes.length === 1) {
            authSchema.apiKey = z.string();
            if (securityScheme.in && securityScheme.name) {
              authSchema.apiKeyIn = z
                .enum(["header", "query"])
                .default(securityScheme.in as "header" | "query");
              authSchema.apiKeyName = z.string().default(securityScheme.name);
            }
          } else {
            authSchema.apiKey = z.string().optional();
            if (securityScheme.in && securityScheme.name) {
              authSchema.apiKeyIn = z
                .enum(["header", "query"])
                .optional()
                .default(securityScheme.in as "header" | "query");
              authSchema.apiKeyName = z
                .string()
                .optional()
                .default(securityScheme.name);
            }
          }
          break;
        case "oauth2":
          authTypes.push("oauth2");
          // Make token optional if API Key auth is available
          authSchema.token =
            isRequired && !authTypes.includes("apiKey")
              ? z.string()
              : z.string().optional();
          break;
      }
    }

    // Add all auth types to the enum - ensure we have at least 'none'
    authSchema.type = z.enum(authTypes as [string, ...string[]]);

    const description =
      `Authentication configuration. Available methods: ${authTypes.join(
        ", "
      )}. ` +
      Object.entries(this.securitySchemes)
        .map(([key, scheme]) => {
          const desc = (scheme as SecurityScheme).description || scheme.type;
          const required = requiredSchemeNames.has(key)
            ? " (Required)"
            : " (Optional)";
          return `${key}: ${desc}${required}`;
        })
        .join(". ");

    return z.object(authSchema).describe(description);
  }

  async loadSwaggerSpec(specUrlOrFile: string) {
    console.debug("Loading Swagger specification from:", specUrlOrFile);
    try {
      // Add auth headers for fetching the swagger spec if needed
      const headers = this.getAuthHeaders();
      this.swaggerSpec = (await SwaggerParser.parse(specUrlOrFile, {
        resolve: { http: { headers } },
      })) as OpenAPI.Document;

      const info = this.swaggerSpec.info;
      console.debug("Loaded Swagger spec:", {
        title: info.title,
        version: info.version,
        description: info.description?.substring(0, 100) + "...",
      });

      // Extract security schemes
      this.extractSecuritySchemes();
      console.debug(
        "Security schemes found:",
        Object.keys(this.securitySchemes)
      );

      // Update server name with API info
      this.mcpServer = new McpServer({
        name: info.title || "Swagger API Server",
        version: info.version || "1.0.0",
        description: info.description || undefined,
      });

      await this.registerTools();
    } catch (error) {
      console.error("Failed to load Swagger specification:", error);
      throw error;
    }
  }

  private createZodSchema(parameter: OpenAPI.Parameter): z.ZodType<any> {
    const schema = (parameter as any).schema || parameter;

    switch (schema.type) {
      case "string":
        return z.string().describe(schema.description || "");
      case "number":
        return z.number().describe(schema.description || "");
      case "integer":
        return z
          .number()
          .int()
          .describe(schema.description || "");
      case "boolean":
        return z.boolean().describe(schema.description || "");
      case "array":
        return z
          .array(this.createZodSchema(schema.items))
          .describe(schema.description || "");
      case "object":
        if (schema.properties) {
          const shape: { [key: string]: z.ZodType<any> } = {};
          Object.entries(schema.properties).forEach(([key, prop]) => {
            shape[key] = this.createZodSchema(prop as OpenAPI.Parameter);
          });
          return z.object(shape).describe(schema.description || "");
        }
        return z.object({}).describe(schema.description || "");
      default:
        return z.any().describe(schema.description || "");
    }
  }

  private async registerTools() {
    console.debug("Starting tool registration process");
    if (!this.swaggerSpec || !this.swaggerSpec.paths) {
      console.warn("No paths found in Swagger spec");
      return;
    }

    const totalPaths = Object.keys(this.swaggerSpec.paths).length;
    console.debug(`Found ${totalPaths} paths to process`);

    // Type assertion to handle OpenAPI 2.x and 3.x compatibility
    const paths = this.swaggerSpec.paths as any;

    // Tool 1: List all available endpoints
    this.mcpServer.tool(
      "list_endpoints",
      "List all available API endpoints with basic information including path, method, summary, and tags",
      {
        input: z.object({
          method: z
            .string()
            .optional()
            .describe("Filter by HTTP method (GET, POST, PUT, DELETE, etc.)"),
          tag: z.string().optional().describe("Filter by OpenAPI tag"),
          limit: z
            .number()
            .optional()
            .default(50)
            .describe("Maximum number of endpoints to return"),
        }),
      },
      async ({ input }) => {
        const endpoints = [];

        for (const [path, pathItem] of Object.entries(
          this.swaggerSpec!.paths ?? {}
        )) {
          if (!pathItem) continue;

          for (const [method, operation] of Object.entries(pathItem)) {
            if (method === "$ref" || !operation) continue;

            const op = operation as OpenAPI.Operation;
            const operationId = op.operationId || `${method}-${path}`;

            // Apply filters
            if (
              input.method &&
              method.toLowerCase() !== input.method.toLowerCase()
            )
              continue;
            if (input.tag && (!op.tags || !op.tags.includes(input.tag)))
              continue;

            endpoints.push({
              operationId,
              method: method.toUpperCase(),
              path,
              summary: op.summary || "",
              description: op.description || "",
              tags: op.tags || [],
              deprecated: op.deprecated || false,
            });

            if (endpoints.length >= input.limit) break;
          }
          if (endpoints.length >= input.limit) break;
        }

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  total: endpoints.length,
                  endpoints,
                },
                null,
                2
              ),
            },
          ],
        };
      }
    );

    // Tool 2: Get detailed information about a specific endpoint
    this.mcpServer.tool(
      "get_endpoint_details",
      "Get detailed information about a specific API endpoint including parameters, request/response schemas, and authentication requirements",
      {
        input: z.object({
          operationId: z.string().describe("The operation ID of the endpoint"),
          path: z
            .string()
            .optional()
            .describe("The API path (alternative to operationId)"),
          method: z
            .string()
            .optional()
            .describe("The HTTP method (required if using path)"),
        }),
      },
      async ({ input }) => {
        let targetOperation = null;
        let targetPath = "";
        let targetMethod = "";

        // Find the operation by operationId or path+method
        for (const [path, pathItem] of Object.entries(
          this.swaggerSpec!.paths ?? {}
        )) {
          if (!pathItem) continue;

          for (const [method, operation] of Object.entries(pathItem)) {
            if (method === "$ref" || !operation) continue;

            const op = operation as OpenAPI.Operation;
            const operationId = op.operationId || `${method}-${path}`;

            if (
              input.operationId === operationId ||
              (input.path === path &&
                input.method?.toLowerCase() === method.toLowerCase())
            ) {
              targetOperation = op;
              targetPath = path;
              targetMethod = method;
              break;
            }
          }
          if (targetOperation) break;
        }

        if (!targetOperation) {
          return {
            content: [
              {
                type: "text",
                text: `Endpoint not found. Use list_endpoints to see available endpoints.`,
              },
            ],
          };
        }

        // Extract parameter information
        const parameters = (targetOperation.parameters || []).map(
          (param: any) => ({
            name: param.name,
            in: param.in,
            required: param.required || false,
            type: param.schema?.type || param.type,
            description: param.description || "",
            example: param.example || param.schema?.example,
          })
        );

        // Extract request body schema
        let requestBody = null;
        if ((targetOperation as any).requestBody) {
          const rb = (targetOperation as any).requestBody as any;
          const content = rb.content;
          if (content) {
            requestBody = Object.keys(content).map((mediaType) => ({
              mediaType,
              schema: content[mediaType].schema,
              required: rb.required || false,
            }));
          }
        }

        // Extract response schemas
        const responses = Object.entries(targetOperation.responses || {}).map(
          ([code, resp]: [string, any]) => ({
            statusCode: code,
            description: resp.description || "",
            schema: resp.content
              ? Object.keys(resp.content).map((mt) => ({
                  mediaType: mt,
                  schema: resp.content[mt].schema,
                }))
              : null,
          })
        );

        // Security requirements
        const security =
          targetOperation.security || (this.swaggerSpec as any)?.security || [];

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  operationId:
                    targetOperation.operationId ||
                    `${targetMethod}-${targetPath}`,
                  method: targetMethod.toUpperCase(),
                  path: targetPath,
                  summary: targetOperation.summary || "",
                  description: targetOperation.description || "",
                  tags: targetOperation.tags || [],
                  deprecated: targetOperation.deprecated || false,
                  parameters,
                  requestBody,
                  responses,
                  security,
                  securitySchemes: this.securitySchemes,
                },
                null,
                2
              ),
            },
          ],
        };
      }
    );

    // Tool 3: Search endpoints by keyword
    this.mcpServer.tool(
      "search_endpoints",
      "Search API endpoints by keyword in path, summary, description, or tags",
      {
        input: z.object({
          query: z
            .string()
            .describe(
              "Search term to look for in endpoint paths, summaries, descriptions, or tags"
            ),
          limit: z
            .number()
            .optional()
            .default(20)
            .describe("Maximum number of results to return"),
        }),
      },
      async ({ input }) => {
        const results = [];
        const query = input.query.toLowerCase();

        for (const [path, pathItem] of Object.entries(
          this.swaggerSpec!.paths ?? {}
        )) {
          if (!pathItem) continue;

          for (const [method, operation] of Object.entries(pathItem)) {
            if (method === "$ref" || !operation) continue;

            const op = operation as OpenAPI.Operation;
            const operationId = op.operationId || `${method}-${path}`;

            // Search in various fields
            const searchText = [
              path,
              op.summary || "",
              op.description || "",
              ...(op.tags || []),
              operationId,
            ]
              .join(" ")
              .toLowerCase();

            if (searchText.includes(query)) {
              results.push({
                operationId,
                method: method.toUpperCase(),
                path,
                summary: op.summary || "",
                description: op.description || "",
                tags: op.tags || [],
                relevance: this.calculateRelevance(query, searchText),
              });
            }

            if (results.length >= input.limit) break;
          }
          if (results.length >= input.limit) break;
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

    // Tool 4: Get schema information
    this.mcpServer.tool(
      "get_schema",
      "Get detailed schema information for request/response bodies or components",
      {
        input: z.object({
          schemaName: z
            .string()
            .optional()
            .describe(
              "Name of a schema component (e.g., from #/components/schemas/)"
            ),
          operationId: z
            .string()
            .optional()
            .describe("Get request/response schemas for this operation"),
          schemaPath: z
            .string()
            .optional()
            .describe(
              "JSON path to a specific schema (e.g., #/components/schemas/User)"
            ),
        }),
      },
      async ({ input }) => {
        let schema = null;
        let schemaLocation = "";

        if (input.schemaName) {
          // Look for schema in components
          const components = (this.swaggerSpec as any)?.components?.schemas;
          if (components && components[input.schemaName]) {
            schema = components[input.schemaName];
            schemaLocation = `#/components/schemas/${input.schemaName}`;
          }
        } else if (input.operationId) {
          // Find operation and return its schemas
          for (const [path, pathItem] of Object.entries(
            this.swaggerSpec!.paths ?? {}
          )) {
            if (!pathItem) continue;

            for (const [method, operation] of Object.entries(pathItem)) {
              if (method === "$ref" || !operation) continue;

              const op = operation as OpenAPI.Operation;
              const operationId = op.operationId || `${method}-${path}`;

              if (operationId === input.operationId) {
                const schemas = {
                  requestBody: null,
                  responses: {} as Record<string, any>,
                };

                // Extract request body schema
                if ((op as any).requestBody) {
                  const rb = (op as any).requestBody as any;
                  schemas.requestBody = rb.content;
                }

                // Extract response schemas
                Object.entries(op.responses || {}).forEach(
                  ([code, resp]: [string, any]) => {
                    schemas.responses[code] = {
                      description: resp.description,
                      content: resp.content,
                    };
                  }
                );

                return {
                  content: [
                    {
                      type: "text",
                      text: JSON.stringify(
                        {
                          operationId: input.operationId,
                          schemas,
                        },
                        null,
                        2
                      ),
                    },
                  ],
                };
              }
            }
          }
        } else if (input.schemaPath) {
          // Navigate to schema by path
          const pathParts = input.schemaPath.replace("#/", "").split("/");
          let current = this.swaggerSpec as any;

          for (const part of pathParts) {
            if (current && current[part]) {
              current = current[part];
            } else {
              current = null;
              break;
            }
          }

          if (current) {
            schema = current;
            schemaLocation = input.schemaPath;
          }
        }

        if (!schema) {
          return {
            content: [
              {
                type: "text",
                text: `Schema not found. Available schemas: ${Object.keys(
                  (this.swaggerSpec as any)?.components?.schemas || {}
                ).join(", ")}`,
              },
            ],
          };
        }

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  schemaLocation,
                  schema,
                },
                null,
                2
              ),
            },
          ],
        };
      }
    );

    // Tool 5: Make API call
    this.mcpServer.tool(
      "make_api_call",
      "Make an API call to any endpoint with the specified parameters and authentication",
      {
        input: z.object({
          operationId: z
            .string()
            .optional()
            .describe("The operation ID of the endpoint"),
          path: z
            .string()
            .optional()
            .describe("The API path (alternative to operationId)"),
          method: z
            .string()
            .optional()
            .describe("The HTTP method (required if using path)"),
          parameters: z
            .record(z.any())
            .optional()
            .describe("Query parameters, path parameters, or form data"),
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
        // Find the operation
        let targetOperation = null;
        let targetPath = "";
        let targetMethod = "";

        for (const [path, pathItem] of Object.entries(
          this.swaggerSpec!.paths ?? {}
        )) {
          if (!pathItem) continue;

          for (const [method, operation] of Object.entries(pathItem)) {
            if (method === "$ref" || !operation) continue;

            const op = operation as OpenAPI.Operation;
            const operationId = op.operationId || `${method}-${path}`;

            if (
              input.operationId === operationId ||
              (input.path === path &&
                input.method?.toLowerCase() === method.toLowerCase())
            ) {
              targetOperation = op;
              targetPath = path;
              targetMethod = method;
              break;
            }
          }
          if (targetOperation) break;
        }

        if (!targetOperation) {
          return {
            content: [
              {
                type: "text",
                text: `Endpoint not found. Use list_endpoints to see available endpoints.`,
              },
            ],
          };
        }

        try {
          const params = input.parameters || {};
          let url = this.apiBaseUrl + targetPath;

          // Handle path parameters
          const pathParams = new Set();
          targetPath.split("/").forEach((segment) => {
            if (segment.startsWith("{") && segment.endsWith("}")) {
              pathParams.add(segment.slice(1, -1));
            }
          });

          Object.entries(params).forEach(([key, value]) => {
            if (pathParams.has(key)) {
              url = url.replace(`{${key}}`, encodeURIComponent(String(value)));
            }
          });

          // Separate query parameters
          const queryParams = Object.entries(params)
            .filter(([key]) => !pathParams.has(key))
            .reduce((acc, [key, value]) => ({ ...acc, [key]: value }), {});

          const headers = this.getAuthHeaders(input.auth, targetOperation);
          const authQueryParams = this.getAuthQueryParams(input.auth);

          const response = await axios({
            method: targetMethod as string,
            url: url,
            headers,
            data: input.body,
            params: { ...queryParams, ...authQueryParams },
          });

          return {
            content: [
              { type: "text", text: JSON.stringify(response.data, null, 2) },
              { type: "text", text: `HTTP Status Code: ${response.status}` },
            ],
          };
        } catch (error) {
          console.error(`Error in API call:`, error);
          if (axios.isAxiosError(error) && error.response) {
            return {
              content: [
                {
                  type: "text",
                  text: `Error ${error.response.status}: ${JSON.stringify(
                    error.response.data,
                    null,
                    2
                  )}`,
                },
              ],
            };
          }
          return {
            content: [{ type: "text", text: `Error: ${error}` }],
          };
        }
      }
    );

    console.debug(
      "Successfully registered 5 strategic tools for API navigation"
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

  getServer() {
    return this.mcpServer;
  }

  handleSSE(res: Response) {
    console.debug("MCP handleSSE");
    transport = new SSEServerTransport("/messages", res);
    this.mcpServer.connect(transport);
  }

  handleMessage(req: Request, res: Response) {
    console.debug("MCP handleMessage", req.body);
    if (transport) {
      try {
        transport.handlePostMessage(req, res);
      } catch (error) {
        console.error("Error handling message:", error);
      }
    } else {
      console.warn("no transport");
    }
  }
}
