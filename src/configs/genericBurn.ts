/* eslint-disable no-console */
/* eslint-disable @typescript-eslint/no-explicit-any */
// TODO: Improve typings.

import {
    BurnAndReleaseTransaction,
    DepositCommon,
} from "@renproject/interfaces";
import {
    BurnAndRelease,
    BurnAndReleaseStatus,
} from "@renproject/ren/build/main/burnAndRelease";
import { Actor, assign, MachineOptions, Receiver, Sender, spawn } from "xstate";

import { BurnMachineContext, BurnMachineEvent } from "../machines/burn";
import {
    BurnTransaction,
    CompletedBurnTransaction,
    ConfirmedBurnTransaction,
    ReleasedBurnTransaction,
} from "../types/burn";

const burnAndRelease = async <X, Y>(context: BurnMachineContext<X, Y>) => {
    const transaction = context.tx.transaction?.sourceTxHash;
    return await context.sdk.burnAndRelease({
        asset: context.tx.sourceAsset.toUpperCase(),
        to: context.to(context),
        from: context.from(context),
        ...(transaction ? { transaction } : {}),
    });
};

const spawnBurnTransaction = assign<
    BurnMachineContext<any, any>,
    BurnMachineEvent<any, any>
>({
    burnListenerRef: <X, Y>(context: BurnMachineContext<X, Y>, event: any) => {
        const actorName = `${context.tx.id}BurnListener`;
        if (context.burnListenerRef) {
            console.warn("listener already exists");
            return context.burnListenerRef;
        }
        const transactionListener = burnTransactionListener(context);
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion
        return spawn(transactionListener, actorName) as Actor<any>;
    },
});

const extractTx = <X>(
    burn: BurnAndRelease<any, DepositCommon<any>, any, any>,
): ConfirmedBurnTransaction<X> => {
    if (!burn.burnDetails) throw new Error("missing burn");
    const tx: ConfirmedBurnTransaction<X> = {
        renVMHash: burn.txHash(),
        rawSourceTx: burn.burnDetails.transaction,
        sourceTxConfTarget: 0,
        sourceTxConfs: 0,
        sourceTxHash:
            burn.burnDetails.transaction.hash || burn.burnDetails.transaction,
        detectedAt: Date.now(),
        sourceTxAmount: burn.burnDetails.amount.toString(),
    };
    return tx;
};

const performBurn = async <X, Y>(
    burn: BurnAndRelease<any, DepositCommon<any>, any, any>,
    send: Sender<BurnMachineEvent<X, Y>>,
    cleaners: Array<() => void>,
    context: BurnMachineContext<X, Y>,
) => {
    // will resume from previous tx if we have the hash
    const burnRef = burn.burn();
    let tx: BurnTransaction;

    const burnListener = (
        confs: number /* actually eth tx target: number */,
    ) => {
        burn.confirmationTarget()
            .then((target) => {
                // We need to wait for burn details to resolve, which
                // might not be ready even if we have sufficient confirmations
                const data: BurnTransaction = {
                    ...{
                        ...tx,
                        ...context.tx.transaction,
                    },
                    sourceTxConfs: confs,
                    sourceTxConfTarget: target,
                };
                send({
                    type: "CONFIRMATION",
                    data,
                });
                if (target <= confs) {
                    const data: ConfirmedBurnTransaction<X> = {
                        ...{ ...extractTx(burn), ...context.tx.transaction },
                        sourceTxConfs: target,
                        sourceTxConfTarget: target,
                    };
                    send({
                        type: "CONFIRMED",
                        data,
                    });
                }
            })
            .catch((e) => {
                throw e;
            });
    };

    cleaners.push(() => {
        burnRef._cancel();
        burnRef.removeListener("confirmation", burnListener);
    });

    try {
        // ensure we have a target
        const target =
            context.tx.transaction?.sourceTxConfTarget ||
            (await burn.confirmationTarget());
        const r = await burnRef
            // host chain tx hash
            .on("transactionHash", (txHash: string) => {
                const data: BurnTransaction = {
                    sourceTxConfs: 0,
                    sourceTxConfTarget: target,
                    sourceTxHash: txHash,
                    detectedAt: Date.now(),
                    sourceTxAmount: context.tx.targetAmount,
                };
                tx = data;
                send({
                    type: "SUBMITTED",
                    data,
                });
            })
            .on("confirmation", burnListener);

        // stop listening for confirmations once confirmed
        burnRef.removeListener("confirmation", burnListener);

        if (
            r.status == BurnAndReleaseStatus.Burned ||
            r.status == BurnAndReleaseStatus.Released
        ) {
            const data: ConfirmedBurnTransaction<X> = {
                ...{ ...extractTx(burn), ...context.tx.transaction },
                sourceTxConfs: target,
                sourceTxConfTarget: target,
            };
            send({
                type: "CONFIRMED",
                data,
            });
            return data;
        }
        if (r.status == BurnAndReleaseStatus.Reverted) {
            throw new Error(`Burn tx reverted: ${r.revertReason}`);
        }
        throw new Error(`Burn interrupted`);
    } catch (error) {
        throw error;
    }
};

const performRelease = async <X, Y>(
    burn: BurnAndRelease<any, DepositCommon<any>, any, any>,
    send: Sender<BurnMachineEvent<X, Y>>,
    cleaners: Array<() => void>,
    tx: ConfirmedBurnTransaction<X>,
) => {
    // Only start processing release once confirmed
    // Release from renvm status
    const releaseListener = (status: string) => {
        status === "confirming"
            ? console.debug(`confirming`)
            : console.debug("status", status);
    };

    const hashListener = (renVMHash: string) => {
        const data: ConfirmedBurnTransaction<X> = {
            ...tx,
            renVMHash,
        };
        send({
            type: "ACCEPTED",
            data,
        });
    };

    let response: BurnAndReleaseTransaction;
    const transactionListener = (transaction: Y) => {
        if (!burn.burnDetails) return;
        const data: CompletedBurnTransaction<X, Y> = {
            ...tx,
            rawSourceTx: burn.burnDetails.transaction,
            destTxHash: (transaction as unknown as { hash: string }).hash,
            // Can be used to construct blockchain explorer link
            renResponse: response,
            rawDestTx: transaction,
            completedAt: Date.now(),
            destTxAmount: (transaction as unknown as { amount: string }).amount,
        };
        send({
            type: "COMPLETED",
            data,
        });
    };

    const releaseRef = burn.release();
    cleaners.push(() => {
        releaseRef._cancel();
        releaseRef.removeListener("status", releaseListener);
        releaseRef.removeListener("transaction", transactionListener);
        releaseRef.removeListener("txHash", hashListener);
    });

    releaseRef.catch((e) => {
        console.error("release error", e);
        send({
            type: "RELEASE_ERROR",
            data: tx,
            error: e,
        });
    });

    try {
        const res = await releaseRef
            .on("status", releaseListener)
            .on("transaction", transactionListener)
            .on("txHash", hashListener);
        if (!burn.burnDetails?.transaction) return;
        response = res;
        const data: ReleasedBurnTransaction<X> = {
            ...tx,
            rawSourceTx: burn.burnDetails.transaction,
            destTxHash: burn.releaseTransaction,
            renResponse: res,
        };
        send({
            type: "RELEASED",
            data,
        });
    } catch (e) {
        send({
            type: "RELEASE_ERROR",
            data: tx,
            error: e,
        });
    }
};

const burnTransactionListener =
    <X, Y>(context: BurnMachineContext<X, Y>) =>
    (send: Sender<BurnMachineEvent<X, Y>>, receive: Receiver<any>) => {
        const cleaners: Array<() => void> = [];
        let burning = false;
        let tx: ConfirmedBurnTransaction<X>;
        burnAndRelease(context)
            .then((burn) => {
                // Ready to recieve SUBMIT
                send({ type: "CREATED" });
                if (
                    context.autoSubmit ||
                    // Always "SUBMIT" if we have submitted previously
                    context.tx.transaction
                ) {
                    setTimeout(() => send("SUBMIT"), 500);
                }

                receive((event) => {
                    if (event.type === "SUBMIT") {
                        // Only burn once
                        if (burning) {
                            return;
                        }
                        burning = true;
                        performBurn(burn, send, cleaners, context)
                            .then((r) => (tx = r))
                            .catch((e) => {
                                console.error(e);
                                send({
                                    type: "BURN_ERROR",
                                    data: e.toString(),
                                    error: e,
                                });
                            });
                    }

                    if (event.type === "RELEASE") {
                        const tx: ConfirmedBurnTransaction<X> =
                            (context.tx
                                .transaction as ConfirmedBurnTransaction<X>) ||
                            extractTx(burn);

                        performRelease(burn, send, cleaners, tx)
                            .then()
                            .catch((e) => {
                                console.error(e);
                                send({
                                    type: "BURN_ERROR",
                                    data: context.tx,
                                    error: e,
                                });
                            });
                    }
                });
            })
            .catch((e) => {
                console.error(e);

                send({ type: "BURN_ERROR", data: {}, error: e });
            });

        return () => {
            for (const cleaner of cleaners) {
                cleaner();
            }
        };
    };

export const buildBurnConfig = <X, Y>(): Partial<
    MachineOptions<BurnMachineContext<X, Y>, BurnMachineEvent<X, Y>>
> => ({
    actions: {
        burnSpawner: spawnBurnTransaction,
    },
    services: {
        burnListener: burnTransactionListener,
    },
});
