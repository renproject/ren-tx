import { createModel } from "@xstate/test";
import {
    mintMachine,
    buildMintConfig,
    buildDepositMachine,
    buildBurnConfig,
    DepositMachineContext,
    DepositMachineEvent,
    GatewayMachineContext,
} from "../src";
import { buildBurnMachine } from "../src/machines/burn";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const makeTestContext = (): GatewayMachineContext<any> => ({
    tx: {
        id: "txid",
        sourceAsset: "btc",
        sourceChain: "bitcoin",
        network: "testnet",
        destAddress: "",
        destChain: "ethereum",
        userAddress: "",
        expiryTime: new Date().getTime() + 1000 * 60,
        customParams: {},
        transactions: {
            "123": {
                renVMHash: "",
                detectedAt: Date.now(),
                sourceTxHash: "123",
                sourceTxAmount: "1",
                sourceTxConfs: 0,
                rawSourceTx: { transaction: {}, amount: "1" },
            },
        },
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    sdk: {} as any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    from: () => ({} as any),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    to: () => ({} as any),
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mintModel = createModel<GatewayMachineContext<any>>(
    mintMachine.withContext(makeTestContext()),
).withEvents({
    RESTORE: {
        cases: [
            {
                data: {
                    sourceTxHash: "123",
                    rawSourceTx: { transaction: { txHash: "123" } },
                },
            },
        ],
    },
    CLAIM: {
        cases: [{ data: { sourceTxHash: "123", destTxHash: "123" } }],
    },
    CONFIRMED: {
        cases: [{ data: { sourceTxHash: "123", destTxHash: "123" } }],
    },
    CONFIRMATION: {
        cases: [{ data: { sourceTxHash: "123", destTxHash: "123" } }],
    },
    ERROR: {
        cases: [{ data: { sourceTxHash: "123", destTxHash: "123" } }],
    },
    SIGN_ERROR: {
        cases: [{ data: { sourceTxHash: "123", destTxHash: "123" } }],
    },
    SUBMIT_ERROR: {
        cases: [{ data: { sourceTxHash: "123", destTxHash: "123" } }],
    },
    SIGNED: {
        cases: [{ data: { sourceTxHash: "123", destTxHash: "123" } }],
    },
    SUBMITTED: {
        cases: [{ data: { sourceTxHash: "123", destTxHash: "123" } }],
    },
    "done.invoke.txCreator": {
        exec: async () => {},
        cases: [
            { data: { ...makeTestContext().tx, gatewayAddress: "generated" } },
        ],
    },
    "error.platform.txCreator": {
        exec: async () => {},
        cases: [{ data: { message: "an error" } }],
    },
    // Unfortunately these break the test generator due to an issue with context mutation
    DEPOSIT: {
        cases: [
            {
                data: {
                    sourceTxHash: "123",
                    rawSourceTx: { amount: "0", transaction: {} },
                },
            },
        ],
    },
    DEPOSIT_UPDATE: {
        cases: [{ data: { sourceTxHash: "123", destTxHash: "123" } }],
    },
    RESTORED: {
        cases: [{ data: { sourceTxHash: "123" } }],
    },
    REVERTED: {
        cases: [{ data: { sourceTxHash: "123" } }],
    },
    EXPIRED: {},
    LISTENING: {},
    CLAIMABLE: {
        cases: [{ data: { sourceTxHash: "123", destTxHash: "123" } }],
    },
    ACKNOWLEDGE: {
        cases: [{ data: { sourceTxHash: "123", destTxHash: "123" } }],
    },
    ERROR_LISTENING: {},
});

describe("MintMachine", () => {
    const testPlans = mintModel.getSimplePathPlans();
    testPlans.forEach((plan) => {
        describe(plan.description, () => {
            plan.paths.forEach((path: any) => {
                it(path.description, async () => {
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    await path.test({} as any);
                });
            });
        });
    });

    it("should have full coverage", () => {
        return mintModel.testCoverage();
    });
});

const depositModel = createModel<
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    DepositMachineEvent<any>,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    DepositMachineContext<any>
>(
    buildDepositMachine()
        .withConfig({
            actions: {
                listenerAction: buildMintConfig().actions?.listenerAction,
            },
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any)
        .withContext({
            // ...makeTestContext(),
            deposit: {
                renVMHash: "",
                detectedAt: Date.now(),
                sourceTxAmount: "0",
                sourceTxHash: "",
                sourceTxConfs: 0,
                rawSourceTx: { transaction: {}, amount: "0" },
            },
        }),
).withEvents({
    CHECK: {},
    DETECTED: {},
    RESTORE: {},
    ERROR: {
        cases: [{ error: new Error("error") }],
    },
    SIGN_ERROR: {
        cases: [{ error: { message: "an error" } }],
    },
    SUBMIT_ERROR: {
        cases: [{ error: { message: "an error" } }],
    },
    RESTORED: {
        cases: [
            {
                data: {
                    sourceTxHash: "123",
                    sourceTxConfs: 0,
                    sourceTxConfTarget: 1,
                },
            },
        ],
    },
    CONFIRMATION: {},
    CONFIRMED: {
        cases: [{ data: { sourceTxHash: "123" } }],
    },
    REVERTED: {
        cases: [{ data: { sourceTxHash: "123" } }],
    },
    REJECT: {},
    SIGNED: {},
    CLAIM: {
        cases: [{ data: { sourceTxHash: "123" } }],
    },
    SUBMITTED: {},
    ACKNOWLEDGE: {},
});

describe("DepositMachine", () => {
    const testPlans = depositModel.getShortestPathPlans();
    testPlans.forEach((plan) => {
        describe(plan.description, () => {
            plan.paths.forEach((path: any) => {
                it(path.description, async () => {
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    await path.test({} as any);
                });
            });
        });
    });

    xit("should have full coverage", () => {
        return depositModel.testCoverage();
    });
});

const burnModel = createModel(
    buildBurnMachine()
        .withConfig(buildBurnConfig())
        .withContext({
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            sdk: {} as any,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            from: () => ({} as any),
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            to: () => ({} as any),
            tx: {
                id: "a unique identifier",
                network: "testnet",
                sourceAsset: "renBTC",
                sourceChain: "testSourceChain",
                destAddress: "0x0000000000000000000000000000000000000000",
                destChain: "testDestChain",
                targetAmount: "1",
                userAddress: "0x0000000000000000000000000000000000000000",
                customParams: {},
            },
        }),
).withEvents({
    RESTORE: {},
    CREATED: {},
    "done.invoke.burnCreator": {
        exec: async () => {},
        cases: [{ data: { ...makeTestContext().tx, transactions: {} } }],
    },
    "error.platform.burnCreator": {
        exec: async () => {},
        cases: [{ data: { message: "an error" } }],
    },
    CONFIRMATION: {
        cases: [{ data: { sourceTxHash: "123" } }],
    },
    BURN_ERROR: {
        cases: [{ data: {}, error: { message: "an error" } }],
    },
    RELEASE_ERROR: {
        cases: [{ data: {}, error: { message: "an error" } }],
    },
    CONFIRMED: {
        cases: [{ data: { sourceTxHash: "123", sourceTxConfs: 1 } }],
    },
    ACCEPTED: {
        cases: [{ data: { sourceTxHash: "123", sourceTxConfs: 1 } }],
    },
    SUBMIT: {
        cases: [{ data: { sourceTxHash: "123" } }],
    },
    SUBMITTED: {
        cases: [{ data: { sourceTxHash: "123" } }],
    },
    RELEASED: {
        cases: [{ data: { sourceTxHash: "123", renResponse: {} } }],
    },
    RETRY: {},
});

describe("BurnMachine", () => {
    const testPlans = burnModel.getShortestPathPlans();
    testPlans.forEach((plan) => {
        describe(plan.description, () => {
            plan.paths.forEach((path: any) => {
                it(path.description, async () => {
                    await path.test({});
                });
            });
        });
    });

    it("should have full coverage", () => {
        return burnModel.testCoverage();
    });
});
