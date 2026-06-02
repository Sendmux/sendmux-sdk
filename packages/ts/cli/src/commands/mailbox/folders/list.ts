import { curatedOperations } from "../../../generated/operations.js";
import { OperationCommand } from "../../../operation-command.js";

export default class MailboxFoldersList extends OperationCommand {
  static description = curatedOperations.mailboxListFolders.description;
  static operation = curatedOperations.mailboxListFolders;
}
