import RenJS from "@renproject/ren";
import { createMachine, send } from "xstate";

export enum TransactionState {
  Initial = "initial",
  Restoring = "restoring",
  RestoringFailed = "restoringFailed",
  FromChainDepositing = "fromChainProcessing", //TODO: "fromChain/originChain"
  FromChainDepositingFailed = "fromChainFailed", //TODO: "fromChain/originChain"

}

export enum TransactionEvent {
  RESTORE = "RESTORE",
  RESTORE_SUCCESS = "RESTORE_SUCCESS",
  RESTORE_ERROR = "RESTORE_ERROR",
  DEPOSIT_SUCCESS = "DEPOSIT_SUCCESS",
  DEPOSIT_UPDATE = "DEPOSIT_UPDATE",
  DEPOSIT_ERROR = "DEPOSIT_ERROR",
}

export const createTransactionMachine = (id= "RenVMTransactionMachine") =>
  createMachine({
    id,
    initial: TransactionState.Initial,
    states: {
      [TransactionState.Initial]: {
        entry: [send(TransactionEvent.RESTORE)],
        on: {
          [TransactionEvent.RESTORE]: TransactionState.Restoring,
        },
      },
      [TransactionState.RestoringFailed]: {

      },
      [TransactionState.Restoring]: {
        on: {
          [TransactionEvent.RESTORE_SUCCESS]: TransactionState.FromChainDepositing,
          [TransactionEvent.RESTORE_ERROR]: TransactionState.RestoringFailed,
        }
      },
      [TransactionState.FromChainDepositing]: {

      },
    },
  });
