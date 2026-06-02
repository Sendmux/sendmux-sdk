import { curatedOperations } from "../../../generated/operations.js";
import { OperationCommand } from "../../../operation-command.js";

export default class MailboxMessagesList extends OperationCommand {
  static description = curatedOperations.mailboxListMessages.description;
  static operation = curatedOperations.mailboxListMessages;
}
