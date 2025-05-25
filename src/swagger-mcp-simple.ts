import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import axios from "axios";
import SwaggerParser from "@apidevtools/swagger-parser";
import { Request, Response } from "express";
import { AuthConfig } from "./types.js";

export class SimpleSwaggerMcpServer {
  private mcpServer: McpServer;
  private swaggerSpec: any = null;
  private apiBaseUrl: string;
  private defaultAuth: AuthConfig | undefined;

  constructor(apiBaseUrl: string, defaultAuth?: AuthConfig) {
    this.apiBaseUrl = apiBaseUrl;
    this.defaultAuth = defaultAuth;
    this.mcpServer = new McpServer({
      name: "Simple Swagger API MCP Server",
      version: "1.0.0",
    });
  }

  async loadSwaggerSpec(specUrlOrFile: string) {
    console.debug("Loading Swagger specification from:", specUrlOrFile);
    try {
      this.swaggerSpec = (await SwaggerParser.parse(specUrlOrFile)) as any;

      const info = this.swaggerSpec.info;
      console.debug("Loaded Swagger spec:", {
        title: info.title,
        version: info.version,
      });

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
        if (authConfig.apiKey && authConfig.apiKeyName) {
          if (authConfig.apiKeyIn === "header") {
            return { [authConfig.apiKeyName]: authConfig.apiKey };
          }
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

  private async registerTools() {
    console.debug("Starting tool registration process");
    if (!this.swaggerSpec || !this.swaggerSpec.paths) {
      console.warn("No paths found in Swagger spec");
      return;
    }

    const paths = this.swaggerSpec.paths;
    const totalPaths = Object.keys(paths).length;
    console.debug(`Found ${totalPaths} paths to process`);

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

        for (const [path, pathItem] of Object.entries(paths)) {
          if (!pathItem) continue;

          for (const [method, operation] of Object.entries(pathItem as any)) {
            if (method === "$ref" || !operation) continue;

            const op = operation as any;
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
        for (const [path, pathItem] of Object.entries(paths)) {
          if (!pathItem) continue;

          for (const [method, operation] of Object.entries(pathItem as any)) {
            if (method === "$ref" || !operation) continue;

            const op = operation as any;
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
        if (targetOperation.requestBody) {
          const rb = targetOperation.requestBody;
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

        for (const [path, pathItem] of Object.entries(paths)) {
          if (!pathItem) continue;

          for (const [method, operation] of Object.entries(pathItem as any)) {
            if (method === "$ref" || !operation) continue;

            const op = operation as any;
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
              });
            }

            if (results.length >= input.limit) break;
          }
          if (results.length >= input.limit) break;
        }

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  query: input.query,
                  total: results.length,
                  results,
                },
                null,
                2
              ),
            },
          ],
        };
      }
    );

    // Tool 4: Make API call
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
          auth: z
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
            .optional()
            .describe("Authentication configuration"),
        }),
      },
      async ({ input }) => {
        // Find the operation
        let targetOperation = null;
        let targetPath = "";
        let targetMethod = "";

        for (const [path, pathItem] of Object.entries(paths)) {
          if (!pathItem) continue;

          for (const [method, operation] of Object.entries(pathItem as any)) {
            if (method === "$ref" || !operation) continue;

            const op = operation as any;
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

          const headers = this.getAuthHeaders(
            input.auth?.type !== "none" ? (input.auth as AuthConfig) : undefined
          );
          const authQueryParams = this.getAuthQueryParams(
            input.auth?.type !== "none" ? (input.auth as AuthConfig) : undefined
          );

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
      "Successfully registered 4 strategic tools for API navigation"
    );
  }

  getServer() {
    return this.mcpServer;
  }
}
