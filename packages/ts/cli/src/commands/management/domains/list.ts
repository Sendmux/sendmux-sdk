import { curatedOperations } from "../../../generated/operations.js";
import { OperationCommand } from "../../../operation-command.js";

export default class ManagementDomainsList extends OperationCommand {
  static description = curatedOperations.managementListDomains.description;
  static operation = curatedOperations.managementListDomains;
}
