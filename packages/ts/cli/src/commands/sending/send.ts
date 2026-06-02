import { curatedOperations } from "../../generated/operations.js";
import { OperationCommand } from "../../operation-command.js";

export default class SendingSend extends OperationCommand {
  static description = curatedOperations.sendingSendEmail.description;
  static operation = curatedOperations.sendingSendEmail;
}
