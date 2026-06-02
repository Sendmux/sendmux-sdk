import { curatedOperations } from "../../../generated/operations.js";
import { OperationCommand } from "../../../operation-command.js";

export default class SendingSendBatch extends OperationCommand {
  static description = curatedOperations.sendingSendEmailBatch.description;
  static operation = curatedOperations.sendingSendEmailBatch;
}
