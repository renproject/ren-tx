/* eslint-disable @typescript-eslint/no-explicit-any */
import {
    Actor,
    assign,
    createMachine,
    send,
    SpawnedActorRef,
    State,
} from "xstate";
import RenJS from "@renproject/ren";
import { DepositCommon, LockChain, MintChain } from "@renproject/interfaces";
import { assert } from "@renproject/utils";
import { log } from "xstate/lib/actions";
import { UTXO } from "@renproject/chains-bitcoin/build/main/APIs/API";

import {
    AllGatewayTransactions,
    AcceptedGatewayTransaction,
    ConfirmingGatewayTransaction,
    GatewaySession,
    GatewayTransaction,
    MintedGatewayTransaction,
    isMinted,
    OpenedGatewaySession,
    isOpen,
} from "../types/mint";
import {
    DepositEvent,
    DepositMachineContext,
    DepositMachineEvent,
    DepositMachineSchema,
    DepositMachineTypestate,
} from './deposit'

export interface GatewayMachineContext<DepositType, MintType = any> {
    /**
     * The session arguments used for instantiating a mint gateway
     */
    tx: GatewaySession<DepositType> | OpenedGatewaySession<DepositType>;
    /**
     * A reference to a deposit hashes of transactions that can be
     * minted on their destination chains
     */
    mintRequests?: string[];
    /**
     * @private
     * Keeps track of child machines that track underlying deposits
     */
    depositMachines?: {
        [key in string]: SpawnedActorRef<
            DepositMachineEvent<DepositType>,
            State<
                DepositMachineContext<AllGatewayTransactions<DepositType>>,
                DepositMachineEvent<DepositType>,
                DepositMachineSchema<DepositType>,
                DepositMachineTypestate<DepositType>
            >
        >;
    };
    /**
     * @private
     * a listener callback that interacts with renjs deposit objects
     */
    depositListenerRef?: Actor<any>;
    /**
     * Function to create the "from" param;
     */
    from: (
        context: GatewayMachineContext<DepositType>,
    ) => LockChain<DepositType, DepositCommon<DepositType>>;

    /**
     * Function to create the "to" RenJS param;
     */
    to: (context: GatewayMachineContext<DepositType>) => MintChain<MintType>;
    sdk: RenJS;
}

export enum MintEvent { // TODO: MintMachineEvent
    CLAIMABLE = "CLAIMABLE",
    LISTENING = "LISTENING",
    ERROR_LISTENING = "ERROR_LISTENING",
    DEPOSIT_UPDATE = "DEPOSIT_UPDATE",
    DEPOSIT_COMPLETED = "DEPOSIT_COMPLETED",
    SIGN = "SIGN",
    SETTLE = "SETTLE",
    MINT = "MINT",
    UPDATE = "UPDATE",
    EXPIRED = "EXPIRED",
    ACKNOWLEDGE = "ACKNOWLEDGE",
    RESTORE = "RESTORE",
    //added
    DEPOSIT = "DEPOSIT"
}

export type DepositEventType<DepositType> = {
    type: MintEvent.DEPOSIT;
    data: GatewayTransaction<DepositType>;
};

export type GatewayMachineEvent<DepositType> =
  | DepositMachineEvent<DepositType>
  | { type: MintEvent.CLAIMABLE; data: AcceptedGatewayTransaction<DepositType> }
  | { type: MintEvent.ERROR_LISTENING; data: any }
  | DepositEventType<DepositType>
  | { type: MintEvent.DEPOSIT_UPDATE; data: AllGatewayTransactions<DepositType> }
  | { type: MintEvent.DEPOSIT_COMPLETED; data: MintedGatewayTransaction<DepositType> }
  | { type: MintEvent.SIGN; data: ConfirmingGatewayTransaction<DepositType> }
  | { type: MintEvent.SETTLE; data: GatewayTransaction<DepositType> }
  | { type: MintEvent.MINT; data: AcceptedGatewayTransaction<DepositType> }
  | { type: MintEvent.EXPIRED; data: GatewayTransaction<DepositType> }
  | { type: MintEvent.ACKNOWLEDGE; data: any }
  | { type: MintEvent.RESTORE; data: GatewayTransaction<DepositType> };

type extractGeneric<Type> = Type extends LockChain<infer X> ? X : never;

export interface LockChainMap<Context> {
    [key: string]: (context: Context) => LockChain<any, DepositCommon<any>>;
}

export interface MintChainMap<Context> {
    [key: string]: (context: Context) => MintChain<any>;
}

export const buildMintContextWithMap = <X>(params: {
    tx: GatewaySession<X> | OpenedGatewaySession<X>;
    sdk: RenJS;
    /**
     * Functions to create the "from" param;
     */
    fromChainMap: LockChainMap<GatewayMachineContext<X>>;

    /**
     * Functions to create the "to" RenJS param;
     */
    toChainMap: MintChainMap<GatewayMachineContext<X>>;
}) => {
    const from = params.fromChainMap[params.tx.sourceChain];
    const to = params.toChainMap[params.tx.destChain];
    const constructed: GatewayMachineContext<
        extractGeneric<ReturnType<typeof from>>
    > = {
        tx: params.tx,
        to,
        sdk: params.sdk,
        from,
    };
    return constructed;
};

export enum MintState { // TODO:  MintMachineState
    Restoring = "restoring",
    Creating = "creating",
    SrcInitializeError = "srcInitializeError",
    Listening = "listening",
    Completed = "completed"
}

/**
 * An Xstate machine that, when given a serializable [[GatewaySession]] tx,
 * will instantiate a RenJS LockAndMint session, provide a gateway address,
 * listen for deposits, and request a signature once a deposit has reached
 * the appropriate number of confirmations.
 *
 * Given the same [[GatewaySession]] parameters, as long as the tx has not
 * expired, the machine will restore the transaction to the appropriate
 * state and enable the completion of in-progress minting transactions.
 *
 * The machine allows for multiple deposits to be detected; it is up to the
 * developer to decide if a detected deposit should be signed or rejected.
 * See `/demos/simpleMint.ts` for example usage.
 */
export const buildMintMachine = <X extends UTXO>() =>
    createMachine<GatewayMachineContext<X>, GatewayMachineEvent<X>>(
        {
            id: "RenVMGatewaySession",
            initial: MintState.Restoring,
            states: {
                [MintState.Restoring]: {
                    entry: [
                        send(MintEvent.RESTORE),
                        assign({
                            mintRequests: (_c, _e) => [],
                            depositMachines: (_ctx, _evt) => ({}),
                        }),
                    ],
                    meta: { test: async () => {} },
                    on: {
                        [MintEvent.RESTORE]: [
                            {
                                target: MintState.Completed,
                                cond: "isExpired",
                            },
                            {
                                target: MintState.Listening,
                                cond: "isCreated",
                            },
                            {
                                target: MintState.Creating,
                            },
                        ],
                    },
                },

                [MintState.Creating]: {
                    meta: {
                        test: (_: void, state: any) => {
                            assert(
                                !state.context.tx.gatewayAddress ? true : false,
                                "Gateway address should not be initialized",
                            );
                        },
                    },
                    invoke: {
                        src: "txCreator",
                        onDone: {
                            target: MintState.Listening,
                            actions: assign({
                                tx: (_context, evt) => ({ ...evt.data }),
                            }),
                        },
                        onError: {
                            target: MintState.SrcInitializeError,
                            actions: [
                                assign({
                                    tx: (context, evt) => {
                                        const newTx = {
                                            ...context.tx,
                                            error: evt.data || true,
                                        };
                                        return newTx;
                                    },
                                }),
                                log((_ctx, evt) => evt.data, "ERROR"),
                            ],
                        },
                    },
                },

                [MintState.SrcInitializeError]: {
                    meta: {
                        test: (_: void, state: any) => {
                            assert(
                                state.context.tx.error ? true : false,
                                "Error must exist",
                            );
                        },
                    },
                },

                [MintState.Listening]: {
                    meta: {
                        test: (_: void, state: any) => {
                            assert(
                                state.context.tx.gatewayAddress ? true : false,
                                "GatewayAddress must exist",
                            );
                        },
                    },
                    invoke: {
                        src: "depositListener",
                    },
                    on: {
                        [MintEvent.EXPIRED]: MintState.Completed,
                        // once we have ren-js listening for deposits,
                        // start the statemachines to determine deposit states
                        [MintEvent.LISTENING]: { actions: "depositMachineSpawner" },
                        [MintEvent.ERROR_LISTENING]: {
                            target: MintState.SrcInitializeError,
                            actions: [
                                assign({
                                    tx: (context, evt) => {
                                        const newTx = {
                                            ...context.tx,
                                            error: evt.data || true,
                                        };
                                        return newTx;
                                    },
                                }),
                                log((_ctx, evt) => evt.data, "ERROR"),
                            ],
                        },

                        // forward messages from child machines to renjs listeners
                        [MintEvent.RESTORE]: [
                            {
                                cond: "isPersistedDeposit",
                                actions: "forwardEvent",
                            },
                            {
                                actions: [
                                    assign({
                                        tx: ({ tx }, e) => {
                                            if (!e.data.sourceTxHash) return tx;
                                            return {
                                                ...tx,
                                                transactions: {
                                                    ...tx.transactions,
                                                    [e.data.sourceTxHash]:
                                                        e.data,
                                                },
                                            } as any;
                                        },
                                    }),
                                    "spawnDepositMachine",
                                    "forwardEvent",
                                ],
                            },
                        ],
                        [MintEvent.SETTLE]: {
                            actions: "forwardEvent",
                        },
                        [MintEvent.SIGN]: {
                            actions: "forwardEvent",
                        },
                        [MintEvent.MINT]: {
                            actions: "forwardEvent",
                        },

                        // Send messages to child machines
                        [DepositEvent.RESTORED]: {
                            actions: "routeEvent",
                        },
                        [DepositEvent.CLAIM]: { actions: "routeEvent" },
                        [DepositEvent.CONFIRMATION]: { actions: "routeEvent" },
                        [DepositEvent.CONFIRMED]: { actions: "routeEvent" },
                        [DepositEvent.ERROR]: { actions: "routeEvent" },
                        [DepositEvent.SIGN_ERROR]: { actions: "routeEvent" },
                        [DepositEvent.REVERTED]: { actions: "routeEvent" },
                        [DepositEvent.SUBMIT_ERROR]: { actions: "routeEvent" },
                        [DepositEvent.SIGNED]: { actions: "routeEvent" },
                        [DepositEvent.SUBMITTED]: { actions: "routeEvent" },
                        [DepositEvent.ACKNOWLEDGE]: { actions: "routeEvent" },

                        [MintEvent.CLAIMABLE]: {
                            actions: assign({
                                mintRequests: (context, evt) => {
                                    const oldRequests =
                                        context.mintRequests || [];
                                    const newRequest = evt.data?.sourceTxHash;
                                    if (!newRequest) {
                                        return oldRequests;
                                    }

                                    if (oldRequests.includes(newRequest)) {
                                        return oldRequests;
                                    }
                                    return [...oldRequests, newRequest];
                                },
                                tx: (context, evt) => {
                                    if (evt.data.sourceTxHash) {
                                        context.tx.transactions[
                                            evt.data.sourceTxHash
                                        ] = evt.data;
                                    }
                                    return context.tx;
                                },
                            }),
                        },

                        // We only complete when expiring
                        // DEPOSIT_COMPLETED: {
                        //     target: "completed",
                        //     cond: "isCompleted",
                        // },

                        [MintEvent.DEPOSIT_UPDATE]: [
                            {
                                actions: [
                                    assign({
                                        mintRequests: (ctx, evt) => {
                                            // check if completed
                                            if (isMinted(evt.data)) {
                                                return (
                                                    ctx.mintRequests?.filter(
                                                        (x) =>
                                                            x !==
                                                            evt.data
                                                                .sourceTxHash,
                                                    ) || []
                                                );
                                            } else {
                                                return ctx.mintRequests;
                                            }
                                        },
                                        tx: (context, evt) => {
                                            if (evt.data.sourceTxHash) {
                                                context.tx.transactions[
                                                    evt.data.sourceTxHash
                                                ] = evt.data;
                                            }
                                            return context.tx;
                                        },
                                    }),
                                    send(
                                        (_, evt) => {
                                            return {
                                                type: MintEvent.UPDATE,
                                                hash: evt.data.sourceTxHash,
                                                data: evt.data,
                                            };
                                        },
                                        {
                                            to: (
                                                _ctx: GatewayMachineContext<X>,
                                            ) => "depositListener",
                                        },
                                    ),
                                ],
                            },
                        ],

                        [MintEvent.DEPOSIT]: {
                            cond: "isNewDeposit",
                            actions: [
                                assign({
                                    tx: (context, evt) => {
                                        // Replace the transaction with the newly
                                        // detected one; the listener will provide
                                        // persisted data if it is already present
                                        return {
                                            ...context.tx,
                                            transactions: {
                                                ...context.tx.transactions,
                                                [evt.data.sourceTxHash]:
                                                    evt.data,
                                            },
                                        };
                                    },
                                }),
                                "spawnDepositMachine",
                            ],
                        },
                    },
                },

                [MintState.Completed]: {
                    meta: {
                        test: (_: any, state: any) => {
                            if (state.context.depositListenerRef) {
                                throw Error(
                                    "Deposit listener has not been cleaned up",
                                );
                            }
                        },
                    },
                },
            },
        },
        {
            guards: {
                isPersistedDeposit: (ctx, evt) => {
                    const depositEvt = evt as DepositEventType<X>;
                    if (!depositEvt.data) return false;
                    return (ctx.tx.transactions || {})[
                        depositEvt.data.sourceTxHash
                    ]
                        ? true
                        : false;
                },
                isNewDeposit: (ctx, evt) => {
                    const depositEvt = evt as DepositEventType<X>;
                    if (!depositEvt.data) return false;
                    return !(ctx.depositMachines || {})[
                        depositEvt.data.sourceTxHash
                    ];
                },
                isExpired: ({ tx }) => tx.expiryTime < new Date().getTime(),
                isCreated: ({ tx }) => isOpen(tx),
            },
        },
    );
