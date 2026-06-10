import type { ApiKeyKind } from "./key-kind.js";

export interface OperationParameter {
  name: string;
  required: boolean;
  schema: OperationParameterSchema;
}

export type OperationParameterSchema = OperationParameterArraySchema | OperationParameterScalarSchema;

export interface OperationParameterArraySchema {
  items: OperationParameterScalarSchema;
  maxItems?: number;
  minItems?: number;
  type: "array";
}

export interface OperationParameterScalarSchema {
  enum?: readonly (number | string)[];
  maximum?: number;
  maxLength?: number;
  minimum?: number;
  minLength?: number;
  pattern?: string;
  type: "boolean" | "integer" | "number" | "string";
}

export interface OperationDefinition {
  bodyKind: "binary" | "json" | "none";
  command: string;
  description: string;
  headerParams: readonly OperationParameter[];
  method: string;
  operationId: string;
  path: string;
  pathParams: readonly OperationParameter[];
  queryParams: readonly OperationParameter[];
  requestBodyRequired: boolean;
  requiredKeyKind: ApiKeyKind;
  surface: "mailbox" | "management" | "sending";
}
