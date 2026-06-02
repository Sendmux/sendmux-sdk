import { curatedOperations } from "../../../generated/operations.js";
import { OperationCommand } from "../../../operation-command.js";

export default class MailboxMessagesGet extends OperationCommand {
  static description = curatedOperations.mailboxGetMessage.description;
  static operation = curatedOperations.mailboxGetMessage;
}
