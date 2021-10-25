import { Bitcoin, BitcoinCash, Zcash } from '@renproject/chains-bitcoin'
import { BinanceSmartChain, Ethereum } from '@renproject/chains-ethereum'
import RenJS from '@renproject/ren'
import * as React from 'react'
import { FunctionComponent, useCallback, useEffect, useMemo, useState } from 'react'
import { interpret } from 'xstate'
import { useMachine } from "@xstate/react";

// import detectEthereumProvider from '@metamask/detect-provider'

import {
  mintMachine,
  GatewaySession,
  GatewayMachineContext,
  buildMintContextWithMap,
  isOpen,
  isAccepted,
  isSubmitted,
  isMinted,
  isCompleted,
  isConfirming,
  buildMintConfig,
  GatewayMachineEvent,
  OpenedGatewaySession,
  AllGatewayTransactions
// } from "@renproject/ren-tx";
// } from "./../build/main";
} from '../src';

import { lockChainMap, getMintChainMap } from './chainMaps'
import { ethereum } from './utils'


const useMintMachine =  (initialTx: any, provider: any) => {
  const mintChainMap = getMintChainMap(provider);
  console.log(initialTx);

  const context = useMemo(() => {

  });
  return useMachine(mintMachine, {
    context: {
      ...buildMintContextWithMap({
        tx: initialTx,
        // providers,
        sdk: new RenJS("testnet", {
          loadCompletedDeposits: true
        }),
        fromChainMap: lockChainMap,
        toChainMap: mintChainMap,
      }),
    },
    devTools: true,
  });
}

// classic way
const processMint = (initialTx: any, provider: any) => {
  const mintChainMap = getMintChainMap(provider);
  console.log(mintChainMap);
  const machine = mintMachine.withConfig(buildMintConfig()).withContext(
    buildMintContextWithMap({
      tx: initialTx,
      sdk: new RenJS("testnet"),
      fromChainMap: lockChainMap,
      toChainMap: mintChainMap,
    }),
  );

  // Interpret the machine, and add a listener for whenever a transition occurs.
  // The machine will detect which state the transaction should be in,
  // and perform the neccessary next actions
  let promptedGatewayAddress = false;
  let detectedDeposit = false;
  let claimed = false;
  const service = interpret<
    GatewayMachineContext<any>,
    any,
    GatewayMachineEvent<any>
    >(machine).onTransition((state) => {
    if (
      !promptedGatewayAddress &&
      isOpen(state.context.tx) &&
      state.context.tx.gatewayAddress
    ) {
      console.log(
        "Please deposit",
        initialTx.sourceAsset,
        "to",
        state.context.tx.gatewayAddress,
      );

      console.log(
        "Restore with this object",
        JSON.stringify(state.context.tx),
      );

      promptedGatewayAddress = true;
    }

    const deposit = Object.values(
      state.context.tx.transactions || {},
    )[0];

    if (!deposit) return;

    if (!detectedDeposit && deposit) {
      console.log("Detected deposit");
      console.log(
        "Restore with this object",
        JSON.stringify(state.context.tx),
      );
      detectedDeposit = true;
    }

    if (
      (state.context.mintRequests || []).includes(deposit?.sourceTxHash) &&
      isAccepted(deposit) &&
      !claimed
    ) {
      // implement logic to determine whether deposit is valid
      // In our case we take the first deposit to be the correct one
      // and immediately sign
      console.log("Signing transaction");
      claimed = true;
      service.send({
        type: "CLAIM" as any,
        data: { ...deposit, contractParams: {} },
        params: {},
        // hash: deposit.sourceTxHash,
      });
    }

    if (deposit && isCompleted(deposit)) {
      // If we have a destination txHash, we have successfully minted BTC
      console.log(
        "Your BTC has been minted! TxHash",
        deposit.destTxHash,
      );
      service.stop();
    }
  });

  // Start the service
  service.start();
}

export const MintExample: FunctionComponent = () => {
  const [account, setAccount] = useState("");
  const [provider] = useState(ethereum);
  const handleConnect = useCallback(async () => {
    const accounts = await ethereum.request({ method: 'eth_requestAccounts' });
    setAccount(accounts[0]);
  }, [ethereum, provider]);

  const [tx, setTx] = useState(null);

  console.log(account);
  const handleMint = useCallback(() => {
    const mintTransaction: GatewaySession<any, any> = {
      "id": "tx-31231132",
      "network": "testnet",
      "sourceAsset": "btc",
      "sourceChain": "bitcoin",
      "destAddress": account,
      "destChain": "ethereum",
      "userAddress": account,
      "transactions": {},
      "customParams": {},
      "nonce": "2020202020202020202020202020202020202020202020202020202034393331",
      "expiryTime": new Date().getTime() + 1000 * 60 * 60 * 24,
    }
    // processMint(mintTransaction, provider);
    setTx(mintTransaction);
  }, [account, provider]);

  const mintEnabled = Boolean(account);
  return <div>
    <h1>Mint example</h1>
    <button onClick={handleConnect}>Connect MetaMask</button>
    <p>Connected account: <strong>{account}</strong></p>
    <button disabled={!mintEnabled} onClick={handleMint}>Start Minting</button>
    <div>
      {tx !== null && provider ? <GatewaySessionProcessor tx={tx} provider={provider} /> : "mint session not initialized"}
    </div>
  </div>
}

const GatewaySessionProcessor: FunctionComponent<{tx: any, provider: any}> = ({tx, provider}) => {
  console.log(tx);
  const [current] = useMintMachine(tx, provider);
  const machineStateValue = current.value;
  console.log(machineStateValue);
  const [machineStates, setMachineStates] = useState([]);
  useEffect(() => {
    setMachineStates(states => {
      if (states.includes(machineStateValue)){
        return states;
      }
      return [...states, machineStateValue]
    })
  },  [machineStateValue]);
  console.log(current)
  console.log(current.context);
  const gatewaySession = current.context.tx as OpenedGatewaySession<any, any>
  const depositKeys = Object.keys(gatewaySession.transactions);
  return <>
    <p>Gateway address: <strong>{gatewaySession.gatewayAddress}</strong></p>
    <p>Gateway session machine states order: <strong>{machineStates.join(", ")}</strong></p>
    <p>Deposits: <strong>{depositKeys.length}</strong></p>
    {depositKeys.map(depositKey =>  {
      const deposit = gatewaySession.transactions[depositKey]
      const depositMachine = (current.context.depositMachines || {})[deposit.sourceTxHash]
      if  (!deposit || !depositMachine){
          return null
      }
      const {renResponse, renSignature, ...depositParams} = deposit as any;
      return <div key={depositKey}>
        <p>Deposit: <strong>{depositKey}</strong></p>
        <GatewayTransactionProcessor deposit={deposit} machine={depositMachine} />
        <pre>
          {JSON.stringify(depositParams, null, 2)}
        </pre>
        <hr/>
      </div>
    })}
    <pre>
      {JSON.stringify(current, null, 2)}
    </pre>
  </>
}

const GatewayTransactionProcessor: FunctionComponent<{deposit: AllGatewayTransactions<any>, machine: any}> = ({
  deposit, machine
}) => {
  console.log(machine);
  const machineStateValue = machine.state.value;
  console.log(machineStateValue);
  const [machineStates, setMachineStates] = useState([]);
  useEffect(() => {
    setMachineStates(states => {
      if (states.includes(machineStateValue)){
        return states;
      }
      return [...states, machineStateValue]
    })
  },  [machineStateValue]);
  const claimEnabled = isAccepted(deposit) && !isMinted(deposit);
  const handleClaim = useCallback(() => {
    machine.send({type: "CLAIM"});
  }, [machine])

  return <>
    <p>isConfirming: {isConfirming(deposit) ? "true" : "false"}</p>
    <p>isAccepted: {isAccepted(deposit) ? "true" : "false"}</p>
    <button onClick={handleClaim} disabled={!claimEnabled}>Claim</button>
    <p>isSubmitted: {isSubmitted(deposit) ? "true" : "false"}</p>
    <p>isMinted: {isMinted(deposit) ? "true" : "false"}</p>
    <p>isCompleted: {isCompleted(deposit) ? "true" : "false"}</p>
    <p>Deposit machine states order: <strong>{machineStates.join(", ")}</strong></p>
  </>
}
