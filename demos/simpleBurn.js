"use strict";
/* eslint-disable no-console */
exports.__esModule = true;
var xstate_1 = require("xstate");
var __1 = require("../");
var ren_1 = require("@renproject/ren");
var chains_ethereum_1 = require("@renproject/chains-ethereum");
var chains_bitcoin_1 = require("@renproject/chains-bitcoin");
var hdwallet_provider_1 = require("@truffle/hdwallet-provider");
var main_1 = require("../build/main");
var ethers_1 = require("ethers");
var MNEMONIC = process.env.MNEMONIC;
var INFURA_URL = process.env.INFURA_URL;
var hdWalletProvider = new hdwallet_provider_1["default"]({
    mnemonic: MNEMONIC || "",
    providerOrUrl: INFURA_URL,
    addressIndex: 0,
    numberOfAddresses: 10
});
var ethProvider = new ethers_1["default"].providers.Web3Provider(hdWalletProvider);
// Allow for an existing tx to be passed in via CLI
var parsedTx;
if (process.argv[2]) {
    parsedTx = JSON.parse(process.argv[2]);
}
var burnTransaction = parsedTx || {
    id: "a unique identifier",
    network: "testnet",
    sourceAsset: "btc",
    sourceChain: "ethereum",
    destAddress: "bitcoin address that will receive assets",
    destChain: "bitcoin",
    targetAmount: "200000",
    userAddress: "address that will sign the transaction",
    customParams: {}
};
ethProvider
    .listAccounts()
    .then(function (accounts) {
    burnTransaction.destAddress =
        "tb1qryn92xs8gxwhwcnf95rgyy5388tav6quex9pvh";
    burnTransaction.userAddress = accounts[0];
    var machine = __1.burnMachine.withContext({
        tx: burnTransaction,
        sdk: new ren_1["default"]("testnet"),
        autoSubmit: true,
        to: function () { return chains_bitcoin_1.Bitcoin().Address(burnTransaction.destAddress); },
        from: function () {
            return chains_ethereum_1.Ethereum(hdWalletProvider, burnTransaction.network).Account({
                address: burnTransaction.destAddress,
                value: burnTransaction.targetAmount
            });
        }
    });
    var shownRestore = false;
    // Interpret the machine, and add a listener for whenever a transition occurs.
    // The machine will detect which state the transaction should be in,
    // and perform the neccessary next actions
    var service = xstate_1.interpret(machine).onTransition(function (state) {
        console.log(state.value);
        console.log(state.context.tx);
        if (!shownRestore && state.context.tx.transaction) {
            console.log("Restore with", JSON.stringify(state.context.tx));
            shownRestore = true;
        }
        var burnTx = state.context.tx.transaction;
        if (main_1.isBurnCompleted(burnTx)) {
            // If we have a destination txHash, we have successfully released BTC
            console.log("Your BTC has been released! TxHash", burnTx.destTxHash);
            service.stop();
        }
    });
    // Start the service
    service.start();
})["catch"](console.error);
