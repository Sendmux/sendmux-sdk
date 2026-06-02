import { curatedOperations } from "../../../generated/operations.js";
import { OperationCommand } from "../../../operation-command.js";

export default class ManagementProvidersList extends OperationCommand {
  static description = curatedOperations.managementListProviders.description;
  static operation = curatedOperations.managementListProviders;
}
