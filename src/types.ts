export interface SwaggerConfig {
  swaggerUrl?: string;
  swaggerFile?: string;
  apiBaseUrl: string;
  auth?: AuthConfig;
}

export interface PostmanConfig {
  collectionUrl?: string;
  collectionFile?: string;
  environmentUrl?: string;
  environmentFile?: string;
  auth?: AuthConfig;
}

export interface ApiConfig {
  type: "openapi" | "postman";
  openapi?: SwaggerConfig;
  postman?: PostmanConfig;
}

export interface AuthConfig {
  type: "basic" | "bearer" | "apiKey" | "oauth2";
  username?: string;
  password?: string;
  token?: string;
  apiKey?: string;
  apiKeyName?: string;
  apiKeyIn?: "header" | "query";
}

export interface ToolInput {
  auth?: AuthConfig;
  [key: string]: any;
}

export interface SecurityScheme {
  type: string;
  description?: string;
  name?: string;
  in?: string;
  scheme?: string;
  flows?: {
    implicit?: {
      authorizationUrl: string;
      scopes: Record<string, string>;
    };
    [key: string]: any;
  };
}
