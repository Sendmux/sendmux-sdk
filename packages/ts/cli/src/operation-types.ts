import type { ApiKeyKind } from "./key-kind.js";

export interface OperationParameter {
  name: string;
  required: boolean;
}

export interface OperationDefinition {
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
