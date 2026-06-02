import { curatedOperations } from "../../../generated/operations.js";
import { OperationCommand } from "../../../operation-command.js";

export default class ManagementMailboxesList extends OperationCommand {
  static description = curatedOperations.managementListMailboxes.description;
  static operation = curatedOperations.managementListMailboxes;
}
