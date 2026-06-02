import { curatedOperations } from "../../../generated/operations.js";
import { OperationCommand } from "../../../operation-command.js";

export default class ManagementDomainsGet extends OperationCommand {
  static description = curatedOperations.managementGetDomain.description;
  static operation = curatedOperations.managementGetDomain;
}
