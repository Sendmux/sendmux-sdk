import { curatedOperations } from "../../../generated/operations.js";
import { OperationCommand } from "../../../operation-command.js";

export default class MailboxMeGet extends OperationCommand {
  static description = curatedOperations.mailboxGetMe.description;
  static operation = curatedOperations.mailboxGetMe;
}
