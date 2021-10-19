/* eslint-disable @typescript-eslint/no-explicit-any */
// TODO: Improve typings.

import {
    assign,
    createMachine,
    createSchema,
    send,
    sendParent,
    StateSchema,
} from "xstate";
import { log } from "xstate/lib/actions";
import { assert } from "@renproject/utils";

import {
    AcceptedGatewayTransaction,
    AllGatewayTransactions,
    ConfirmingGatewayTransaction,
    GatewayTransaction,
    isAccepted,
    isCompleted,
    isConfirming,
    isMinted,
    isSubmitted,
    MintedGatewayTransaction,
    SubmittingGatewayTransaction,
} from "../types/mint";
import { MintEvent } from './mint'

type extractGeneric<Type> = Type extends AllGatewayTransactions<infer X>
    ? X
    : never;
/** The context that the deposit machine acts on */
export interface DepositMachineContext<
    Deposit extends AllGatewayTransactions<extractGeneric<Deposit>>,
> {
    /** The deposit being tracked */
    deposit: Deposit;
}

const largest = (x?: number, y?: number): number => {
    if (!x) {
        if (y) return y;
        return 0;
    }
    if (!y) {
        if (x) return x;
        return 0;
    }
    if (x > y) return x;
    return y;
};

export enum DepositState {
    CheckingCompletion = "checkingCompletion",
    /** We are waiting for ren-js to find the deposit */
    RestoringDeposit = "restoringDeposit",
    /** We couldn't restore this deposit */
    ErrorRestoring = "errorRestoring",
    /** renjs has found the deposit for the transaction */
    RestoredDeposit = "restoredDeposit",
    /** we are waiting for the source chain to confirm the transaction */
    SrcSettling = "srcSettling",
    /** source chain has confirmed the transaction, submitting to renvm for signature */
    SrcConfirmed = "srcConfirmed",
    /** renvm has accepted and signed the transaction */
    Accepted = "accepted",
    /** renvm did not accept the tx */
    ErrorAccepting = "errorAccepting",
    /** the user is submitting the transaction to mint on the destination chain */
    Claiming = "claiming",
    /** there was an error submitting the tx to the destination chain */
    ErrorSubmitting = "errorSubmitting",
    /** We have recieved a txHash for the destination chain */
    DestInitiated = "destInitiated",
    /** user has acknowledged that the transaction is completed, so we can stop listening for further deposits */
    Completed = "completed",
    /** user does not want to mint this deposit or the transaction reverted */
    Rejected = "rejected",
}

export type DepositMachineTypestate<X> =
    | {
          value: DepositState.CheckingCompletion;
          context: DepositMachineContext<AllGatewayTransactions<X>>;
      }
    | {
          value: DepositState.RestoringDeposit;
          context: DepositMachineContext<AllGatewayTransactions<X>>;
      }
    | {
          value: DepositState.ErrorRestoring;
          context: DepositMachineContext<GatewayTransaction<X>>;
      }
    | {
          value: DepositState.RestoredDeposit;
          context: DepositMachineContext<GatewayTransaction<X>>;
      }
    | {
          value: DepositState.SrcSettling;
          context: DepositMachineContext<ConfirmingGatewayTransaction<X>>;
      }
    | {
          value: DepositState.SrcConfirmed;
          context: DepositMachineContext<AcceptedGatewayTransaction<X>>;
      }
    | {
          value: DepositState.Accepted;
          context: DepositMachineContext<AcceptedGatewayTransaction<X>>;
      }
    | {
          value: DepositState.ErrorAccepting;
          context: DepositMachineContext<ConfirmingGatewayTransaction<X>>;
      }
    | {
          value: DepositState.Claiming;
          context: DepositMachineContext<SubmittingGatewayTransaction<X>>;
      }
    | {
          value: DepositState.ErrorSubmitting;
          context: DepositMachineContext<SubmittingGatewayTransaction<X>>;
      }
    | {
          value: DepositState.DestInitiated;
          context: DepositMachineContext<MintedGatewayTransaction<X>>;
      }
    | {
          value: DepositState.Completed;
          context: DepositMachineContext<MintedGatewayTransaction<X>>;
      }
    | {
          value: DepositState.Rejected;
          context: DepositMachineContext<GatewayTransaction<X>>;
      };

/** The states a deposit can be in */
export interface DepositMachineSchema<X>
    extends StateSchema<DepositMachineContext<AllGatewayTransactions<X>>> {
    states: {
        /** check if we can skip instantiating the deposit, if we finished the tx
         * previously  */
        checkingCompletion: {};
        /** We are waiting for ren-js to find the deposit */
        restoringDeposit: {};
        /** We couldn't restore this deposit */
        errorRestoring: {};
        /** renjs has found the deposit for the transaction */
        restoredDeposit: {};
        /** we are waiting for the source chain to confirm the transaction */
        srcSettling: {};
        /** source chain has confirmed the transaction */
        srcConfirmed: {};
        /** renvm has accepted and signed the transaction */
        accepted: {};
        /** renvm did not accept the tx */
        errorAccepting: {};
        /** the user is submitting the transaction to mint on the destination chain */
        claiming: {};
        /** there was an error submitting the tx to the destination chain */
        errorSubmitting: {};
        /** We have recieved a txHash for the destination chain */
        destInitiated: {};
        /** user has acknowledged that the transaction is completed, so we can stop listening for further deposits */
        completed: {};
        /** user does not want to claim this deposit */
        rejected: {};
    };
}

export interface ContractParams {
    [key: string]: any;
}

export enum DepositEvent {
    NOOP = "NOOP",
    CHECK = "CHECK",
    LISTENING = "LISTENING",
    DETECTED = "DETECTED",
    ERROR = "ERROR",
    RESTORE = "RESTORE",
    RESTORED = "RESTORED",
    CONFIRMED = "CONFIRMED",
    CONFIRMATION = "CONFIRMATION",
    SIGNED = "SIGNED",
    SIGN_ERROR = "SIGN_ERROR",
    REVERTED = "REVERTED",
    CLAIM = "CLAIM",
    REJECT = "REJECT",
    SUBMITTED = "SUBMITTED",
    SUBMIT_ERROR = "SUBMIT_ERROR",
    ACKNOWLEDGE = "ACKNOWLEDGE"
}

export type DepositMachineEvent<X> =
    | { type: DepositEvent.NOOP }
    | { type: DepositEvent.CHECK }
    | { type: DepositEvent.LISTENING }
    | { type: DepositEvent.DETECTED }
    | { type: DepositEvent.ERROR; data: Partial<GatewayTransaction<X>>; error: Error }
    | { type: DepositEvent.RESTORE; data: Partial<AllGatewayTransactions<X>> }
    | { type: DepositEvent.RESTORED; data: AllGatewayTransactions<X> }
    | { type: DepositEvent.CONFIRMED; data: Partial<ConfirmingGatewayTransaction<X>> }
    | { type: DepositEvent.CONFIRMATION; data: Partial<ConfirmingGatewayTransaction<X>> }
    | { type: DepositEvent.SIGNED; data: AcceptedGatewayTransaction<X> }
    | { type: DepositEvent.SIGN_ERROR; data: GatewayTransaction<X>; error: Error }
    | { type: DepositEvent.REVERTED; data: GatewayTransaction<X>; error: Error }
    | {
          type: DepositEvent.CLAIM;
          data: AcceptedGatewayTransaction<X>;
          params: ContractParams;
      }
    | { type: DepositEvent.REJECT }
    | { type: DepositEvent.SUBMITTED; data: Partial<SubmittingGatewayTransaction<X>> }
    | {
          type: DepositEvent.SUBMIT_ERROR;
          data: Partial<SubmittingGatewayTransaction<X>>;
          error: Error;
      }
    | { type: DepositEvent.ACKNOWLEDGE; data: Partial<SubmittingGatewayTransaction<X>> };

/** Statemachine that tracks individual deposits */
export const buildDepositMachine = <X>() =>
    createMachine<
        DepositMachineContext<AllGatewayTransactions<X>>,
        DepositMachineEvent<X>,
        DepositMachineTypestate<X>
    >(
        {
            id: "RenVMDepositTransaction",
            initial: DepositState.CheckingCompletion,
            schema: {
                events: createSchema<DepositMachineEvent<X>>(),
                context:
                    createSchema<
                        DepositMachineContext<AllGatewayTransactions<X>>
                    >(),
            },
            states: {
                // Checking if deposit is completed so that we can skip initialization
                [DepositState.CheckingCompletion]: {
                    entry: [send(DepositEvent.CHECK)],

                    // If we already have completed, no need to listen
                    on: {
                        [DepositEvent.CHECK]: [
                            {
                                target: DepositState.Completed,
                                cond: "isCompleted",
                            },
                            { target: DepositState.RestoringDeposit},
                        ],
                    },

                    meta: {
                        test: (_: void, state: any) => {
                            assert(
                                !state.context.deposit.error ? true : false,
                                "Error must not exist",
                            );
                        },
                    },
                },
                [DepositState.ErrorRestoring]: {
                    entry: [log((ctx, _) => ctx.deposit.error, "ERROR")],
                    meta: {
                        test: (_: void, state: any) => {
                            assert(
                                state.context.deposit.error ? true : false,
                                "Error must exist",
                            );
                        },
                    },
                },

                [DepositState.RestoringDeposit]: {
                    entry: sendParent((c, _) => ({
                        type: DepositEvent.RESTORE,
                        data: c.deposit,
                    })),

                    on: {
                        [DepositEvent.RESTORED]: {
                            target: DepositState.RestoringDeposit,
                            actions: [assign((_, e) => ({ deposit: e.data }))],
                        },
                        [DepositEvent.ERROR]: {
                            target: DepositState.ErrorRestoring,
                            actions: assign((c, e) => ({
                                deposit: { ...c.deposit, error: e.error },
                            })),
                        },
                    },

                    meta: {
                        test: (_: void, state: any) => {
                            assert(
                                !state.context.deposit.error ? true : false,
                                "Error must not exist",
                            );
                        },
                    },
                },

                // Checking deposit internal state to transition to correct machine state
                [DepositState.RestoredDeposit]: {
                    // Parent must send restored
                    entry: [send(DepositEvent.RESTORED)],
                    on: {
                        [DepositEvent.RESTORED]: [
                            {
                                target: DepositState.SrcSettling,
                                cond: "isSrcSettling",
                            },
                            {
                                target: DepositState.SrcConfirmed,
                                cond: "isSrcSettled",
                            },
                            {
                                target: DepositState.Accepted,
                                cond: "isAccepted",
                            },
                            // We need to call "submit" again in case
                            // a transaction has been sped up / ran out of gas
                            // so we revert back to accepted when restored instead
                            // of waiting on destination initiation
                            // {
                            //     target: "destInitiated",
                            //     cond: "isDestInitiated",
                            // },
                        ].reverse(),
                    },
                    meta: { test: async () => {} },
                },

                [DepositState.SrcSettling]: {
                    entry: sendParent((ctx, _) => ({
                        type: MintEvent.SETTLE,
                        hash: ctx.deposit.sourceTxHash,
                    })),
                    on: {
                        [DepositEvent.CONFIRMED]: [
                            {
                                target: DepositState.SrcConfirmed,
                                actions: [
                                    assign({
                                        deposit: ({ deposit }, evt) => {
                                            if (
                                                isConfirming(deposit) &&
                                                deposit.sourceTxConfTarget
                                            ) {
                                                return {
                                                    ...deposit,
                                                    sourceTxConfs: largest(
                                                        deposit.sourceTxConfs,
                                                        evt.data.sourceTxConfs,
                                                    ),
                                                    sourceTxConfTarget: largest(
                                                        deposit.sourceTxConfTarget,
                                                        evt.data
                                                            .sourceTxConfTarget,
                                                    ),
                                                };
                                            }
                                            return deposit;
                                        },
                                    }),
                                    sendParent((ctx, _) => {
                                        return {
                                            type: MintEvent.DEPOSIT_UPDATE,
                                            data: ctx.deposit,
                                        };
                                    }),
                                ],
                            },
                        ],

                        [DepositEvent.CONFIRMATION]: [
                            {
                                actions: [
                                    sendParent((ctx, evt) => ({
                                        type: MintEvent.DEPOSIT_UPDATE,
                                        data: { ...ctx.deposit, ...evt.data },
                                    })),
                                    assign({
                                        deposit: (context, evt) => ({
                                            ...context.deposit,
                                            sourceTxConfs:
                                                evt.data?.sourceTxConfs || 0,
                                            sourceTxConfTarget:
                                                evt.data?.sourceTxConfTarget,
                                        }),
                                    }),
                                ],
                            },
                        ],

                        [DepositEvent.ERROR]: [
                            {
                                actions: [
                                    assign({
                                        deposit: (ctx, evt) => ({
                                            ...ctx.deposit,
                                            error: evt.error,
                                        }),
                                    }),
                                    log((ctx, _) => ctx.deposit.error, "ERROR"),
                                ],
                            },
                        ],
                    },
                    meta: { test: async () => {} },
                },

                [DepositState.SrcConfirmed]: {
                    entry: sendParent((ctx, _) => ({
                        type: MintEvent.SIGN,
                        hash: ctx.deposit.sourceTxHash,
                    })),
                    on: {
                        [DepositEvent.SIGN_ERROR]: {
                            target: DepositState.ErrorAccepting,
                            actions: assign({
                                deposit: (ctx, evt) => ({
                                    ...ctx.deposit,
                                    error: evt.error,
                                }),
                            }),
                        },
                        [DepositEvent.REVERTED]: {
                            target: DepositState.Rejected,
                            actions: assign({
                                deposit: (ctx, evt) => ({
                                    ...ctx.deposit,
                                    error: evt.error,
                                }),
                            }),
                        },
                        [DepositEvent.SIGNED]: {
                            target: DepositState.Accepted,
                            actions: assign({
                                deposit: (ctx, evt) => ({
                                    ...ctx.deposit,
                                    ...evt.data,
                                }),
                            }),
                        },
                    },
                    meta: { test: async () => {} },
                },

                [DepositState.ErrorAccepting]: {
                    entry: [log((ctx, _) => ctx.deposit.error, "ERROR")],
                    meta: {
                        test: (_: void, state: any) => {
                            assert(
                                state.context.deposit.error ? true : false,
                                "error must exist",
                            );
                        },
                    },
                },

                [DepositState.Accepted]: {
                    entry: sendParent((ctx, _) => {
                        return {
                            type: MintEvent.CLAIMABLE,
                            data: ctx.deposit,
                        };
                    }),
                    on: {
                        [DepositEvent.CLAIM]: {
                            target: DepositState.Claiming,
                            actions: assign({
                                deposit: (ctx, evt) => ({
                                    ...ctx.deposit,
                                    contractParams: evt.params,
                                }),
                            }),
                        },
                        [DepositEvent.REJECT]: DepositState.Rejected,
                    },
                    meta: { test: async () => {} },
                },

                [DepositState.ErrorSubmitting]: {
                    entry: [
                        log((ctx, _) => ctx.deposit.error, "ERROR"),
                        sendParent((ctx, _) => {
                            return {
                                type: MintEvent.CLAIMABLE,
                                data: ctx.deposit,
                            };
                        }),
                    ],
                    on: {
                        [DepositEvent.CLAIM]: {
                            target: DepositState.Claiming,
                            actions: assign({
                                deposit: (ctx, evt) => ({
                                    ...ctx.deposit,
                                    contractParams: evt.data,
                                }),
                            }),
                        },
                        [DepositEvent.REJECT]: DepositState.Rejected,
                    },
                    meta: {
                        test: (_: void, state: any) => {
                            assert(
                                state.context.deposit.error ? true : false,
                                "error must exist",
                            );
                        },
                    },
                },

                [DepositState.Claiming]: {
                    entry: sendParent((ctx) => ({
                        type: "MINT",
                        hash: ctx.deposit.sourceTxHash,
                        data:
                            isSubmitted(ctx.deposit) &&
                            ctx.deposit.contractParams,
                    })),
                    on: {
                        [DepositEvent.SUBMIT_ERROR]: [
                            {
                                target: DepositState.ErrorSubmitting,
                                actions: [
                                    assign({
                                        deposit: (ctx, evt) => ({
                                            ...ctx.deposit,
                                            error: evt.error,
                                        }),
                                    }),
                                    sendParent((ctx, _) => ({
                                        type: MintEvent.DEPOSIT_UPDATE,
                                        data: ctx.deposit,
                                    })),
                                ],
                            },
                        ],
                        [DepositEvent.SUBMITTED]: [
                            {
                                target: DepositState.DestInitiated,
                                actions: [
                                    assign({
                                        deposit: (ctx, evt) => ({
                                            ...ctx.deposit,
                                            ...evt.data,
                                        }),
                                    }),
                                    sendParent((ctx, _) => ({
                                        type: MintEvent.DEPOSIT_UPDATE,
                                        data: ctx.deposit,
                                    })),
                                ],
                            },
                        ],
                    },
                    meta: { test: async () => {} },
                },

                [DepositState.DestInitiated]: {
                    on: {
                        [DepositEvent.SUBMIT_ERROR]: [
                            {
                                target: DepositState.ErrorSubmitting,
                                actions: [
                                    assign({
                                        deposit: (ctx, evt) => ({
                                            ...ctx.deposit,
                                            error: evt.error,
                                        }),
                                    }),
                                    sendParent((ctx, _) => ({
                                        type: MintEvent.DEPOSIT_UPDATE,
                                        data: ctx.deposit,
                                    })),
                                ],
                            },
                        ],
                        [DepositEvent.ACKNOWLEDGE]: {
                            target: DepositState.Completed,
                            actions: [
                                assign({
                                    deposit: (ctx, _) => ({
                                        ...ctx.deposit,
                                        completedAt: new Date().getTime(),
                                    }),
                                }),
                            ],
                        },
                    },
                    meta: { test: async () => {} },
                },

                [DepositState.Rejected]: {
                    entry: [
                        sendParent((ctx, _) => {
                            return {
                                type: MintEvent.DEPOSIT_UPDATE,
                                data: ctx.deposit,
                            };
                        }),
                    ],
                    meta: { test: async () => {} },
                },

                [DepositState.Completed]: {
                    entry: [
                        sendParent((ctx, _) => ({
                            type: MintEvent.DEPOSIT_COMPLETED,
                            data: ctx.deposit,
                        })),
                        sendParent((ctx, _) => ({
                            type: MintEvent.DEPOSIT_UPDATE,
                            data: ctx.deposit,
                        })),
                    ],
                    meta: {
                        test: (_: void, state: any) => {
                            assert(
                                state.context.deposit.completedAt
                                    ? true
                                    : false,
                                "Must have completedAt timestamp",
                            );
                        },
                    },
                },
            },
        },

        {
            guards: {
                isSrcSettling: ({ deposit }) =>
                    isConfirming(deposit) &&
                    (deposit.sourceTxConfs || 0) <
                        (deposit.sourceTxConfTarget ||
                            Number.POSITIVE_INFINITY), // If we don't know the target, keep settling
                isSrcSettled: ({ deposit }) =>
                    isConfirming(deposit) &&
                    (deposit.sourceTxConfs || 0) >= deposit.sourceTxConfTarget, // If we don't know the target, keep settling
                isAccepted: ({ deposit }) =>
                    isAccepted(deposit) && deposit.renSignature ? true : false,
                isDestInitiated: ({ deposit }) =>
                    isMinted(deposit) && deposit.destTxHash ? true : false,
                isCompleted: ({ deposit }) =>
                    isCompleted(deposit) && deposit.completedAt ? true : false,
            },
        },
    );
