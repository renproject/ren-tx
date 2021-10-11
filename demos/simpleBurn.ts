/* eslint-disable no-console */

import { interpret } from "xstate";
import { burnMachine } from "../";
import RenJS from "@renproject/ren";
import { Ethereum } from "@renproject/chains-ethereum";
import { Bitcoin } from "@renproject/chains-bitcoin";
import HDWalletProvider from "@truffle/hdwallet-provider";
import { BurnSession, isBurnCompleted } from '../build/main';
import ethers from "ethers";

const MNEMONIC = process.env.MNEMONIC;
const INFURA_URL = process.env.INFURA_URL;
const hdWalletProvider = new HDWalletProvider({
    mnemonic: MNEMONIC || "",
    providerOrUrl: INFURA_URL,
    addressIndex: 0,
    numberOfAddresses: 10,
});
const ethProvider = new ethers.providers.Web3Provider(hdWalletProvider);

// Allow for an existing tx to be passed in via CLI
let parsedTx: BurnSession<any, any>;
if (process.argv[2]) {
    parsedTx = JSON.parse(process.argv[2]);
}

const burnTransaction: BurnSession<any, any> = parsedTx || {
    id: "a unique identifier",
    network: "testnet",
    sourceAsset: "btc",
    sourceChain: "ethereum",
    destAddress: "bitcoin address that will receive assets",
    destChain: "bitcoin",
    targetAmount: "200000",
    userAddress: "address that will sign the transaction",
    customParams: {},
};

ethProvider
    .listAccounts()
    .then((accounts) => {
        burnTransaction.destAddress =
            "tb1qryn92xs8gxwhwcnf95rgyy5388tav6quex9pvh";
        burnTransaction.userAddress = accounts[0];
        const machine = burnMachine.withContext({
            tx: burnTransaction,
            sdk: new RenJS("testnet"),
            autoSubmit: true,
            to: () => Bitcoin().Address(burnTransaction.destAddress),
            from: () =>
                Ethereum(hdWalletProvider, burnTransaction.network).Account({
                    address: burnTransaction.destAddress,
                    value: burnTransaction.targetAmount,
                }),
        });

        let shownRestore = false;
        // Interpret the machine, and add a listener for whenever a transition occurs.
        // The machine will detect which state the transaction should be in,
        // and perform the neccessary next actions
        const service = interpret(machine).onTransition((state) => {
            console.log(state.value);
            console.log(state.context.tx);
            if (!shownRestore && state.context.tx.transaction) {
                console.log("Restore with", JSON.stringify(state.context.tx));
                shownRestore = true;
            }
            const burnTx = state.context.tx.transaction;
            if (isBurnCompleted(burnTx)) {
                // If we have a destination txHash, we have successfully released BTC
                console.log(
                    "Your BTC has been released! TxHash",
                    burnTx.destTxHash,
                );
                service.stop();
            }
        });

        // Start the service
        service.start();
    })
    .catch(console.error);
