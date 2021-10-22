import { Bitcoin } from '@renproject/chains-bitcoin'
import { Ethereum } from '@renproject/chains-ethereum'
import RenJS from '@renproject/ren'
import * as React from 'react'
import { FunctionComponent, useCallback, useEffect, useState } from 'react'
import { interpret } from 'xstate'
import {
  burnMachine,
  BurnSession,
  isBurnCompleted,
  isReleased,
  isBurnConfirmed,
  isBurnErroring,
  buildBurnContextWithMap
} from "@renproject/ren-tx"; // this "works", but wont "submit"
// those "flicker", sometimes works, stucked at "creating"
// } from "./../src";

// } from "ren-tx-local";
// } from "./../build/main";

console.log(require("@renproject/ren-tx/package.json").version);

import { useMachine } from "@xstate/react";
import { getBurnChainMap, releaseChainMap } from './chainMaps'
import { ethereum } from './utils'

const useBurnMachine = (initialTx: any, provider: any) => {
  console.log('generating burnChainMap');
  const burnChainMap = getBurnChainMap(provider);
  return useMachine(burnMachine,
    {
      context: {
        ...buildBurnContextWithMap({
          tx: {...initialTx},
          sdk: new RenJS("testnet", {
            useV2TransactionFormat: true,
            // @ts-ignore
            logger: {
              level: 1,
              debug: console.debug
            }
          }),
          fromChainMap: burnChainMap,
          toChainMap: releaseChainMap,
          // If we already have a transaction, we need to autoSubmit
          // to check the tx status
        }),
        autoSubmit: false,
      },
      devTools: true
    }
  );
}

const processBurn = (initialTx: any) => {
  const machine = burnMachine.withContext({
    tx: initialTx,
    sdk: new RenJS("testnet"),
    autoSubmit: true,
    to: () => Bitcoin().Address(initialTx.destAddress),
    from: () =>
      Ethereum(ethereum, initialTx.network).Account({
        address: initialTx.userAddress,
        value: initialTx.targetAmount,
      }),
  });

  let shownRestore = false;
  // Interpret the machine, and add a listener for whenever a transition occurs.
  // The machine will detect which state the transaction should be in,
  // and perform the necessary next actions
  const service = interpret(machine).onTransition((state) => {
    console.log(state.value);
    console.log(state.context.tx);
    if (!shownRestore && state.context.tx.transaction) {
      console.log("Restore with", JSON.stringify(state.context.tx));
      shownRestore = true;
    }
    if(state.context.tx.transaction){
      const burnTx = state.context.tx.transaction;
      if (isBurnCompleted(burnTx)) {
        // If we have a destination txHash, we have successfully released BTC
        console.log(
          "Your BTC has been released! TxHash",
          burnTx.destTxHash,
        );
      }
    }
    service.stop();
  });

  // Start the service
  service.start();
}

export const BurnExample: FunctionComponent = () => {
  const [provider, setProvider] = useState(undefined);

  useEffect(() => {
    console.log("updatingProvider");
    ethereum.enable();
    setProvider(ethereum);
  }, [ethereum]);

  const [account, setAccount] = useState("");

  const handleConnect = useCallback(async () => {
    const accounts = await ethereum.request({ method: 'eth_requestAccounts' });
    setAccount(accounts[0]);
  }, [ethereum]);

  const [btcAddress, setBtcAddress] = useState("mrJkKkLV3zpEqd27TagynFMUphPfiJkwXg");
  const handleBtcAddressChange = useCallback((event) => {
    setBtcAddress(event.target.value);
  }, []);

  const btcDecimals = 8;
  const [btcAmount, setBtcAmount] = useState(0.003);
  const handleBtcAmountChange = useCallback((event) => {
    setBtcAmount(Number(event.target.value));
  }, []);
  const [tx, setTx] = useState(null);

  const handleBurn = useCallback(() => {
    const burnTransaction: BurnSession<any, any> = {
      id: "tx-371446342176709",
      network: "testnet",
      sourceAsset: "btc",
      sourceChain: "ethereum",
      destAddress: btcAddress,
      destChain: "bitcoin",
      // @ts-ignore
      targetAmount: Number(btcAmount),
      userAddress: account,
      customParams: {},
      // @ts-ignore
      // transaction: {}
    };
    setTx(burnTransaction);
    // processBurn(burnTransaction);
  }, [account, btcAddress, btcAmount, btcDecimals]);

  console.log(burnMachine);
  const addressEnabled = Boolean(account);
  const amountEnabled = addressEnabled && Boolean(btcAddress);
  const burnEnabled = amountEnabled && Boolean(btcAmount);

  const [toggle, setToggle] = useState(true);

  return <div>
    <h1>Burn example</h1>
    <p>Connected account: <strong>{account}</strong></p>
    <button onClick={handleConnect}>Connect MetaMask</button>
    <fieldset disabled={!addressEnabled}>
      <label>BTC address:</label>
      <input type="text" onChange={handleBtcAddressChange} value={btcAddress}/>
    </fieldset>
    <fieldset disabled={!amountEnabled}>
      <label>Amount:</label>
      <input type="text" onChange={handleBtcAmountChange} value={btcAmount}/>
    </fieldset>
    <button disabled={!burnEnabled} onClick={handleBurn}>Burn {btcAmount} BTC</button>
    <button onClick={() => setToggle(!toggle)}>Toggle</button>
    {(tx !== null && provider && toggle) ? <BurnSessionProcessor tx={tx} provider={provider} /> : "burn session not initialized"}
  </div>
}


const BurnSessionProcessor: FunctionComponent<{tx: any, provider: any}> = ({tx:initialTx, provider}) => {
  useEffect(() => {
    console.log("rendering first time", initialTx, provider);
  }, [initialTx, provider])
  const [current, send, service] = useBurnMachine(initialTx, provider);
  useEffect(
    () => () => {
      console.log("stopping");
      service.stop();
    },
    [service]
  );
  const machineStateValue = current.value;
  const [machineStates, setMachineStates] = useState([]);
  console.log("msv", machineStateValue);
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
  const burnSession = current.context.tx;
  const tx = burnSession.transaction;
  const handleBurn = useCallback(() => {
    send({type: "SUBMIT" as any});
  }, [send, tx]);
  return <>
    <p>Burn machine states order: <strong>{machineStates.join(", ")}</strong></p>
    {
      typeof tx !== 'undefined' && <>
        <p>isBurnConfirmed: {isBurnConfirmed(tx) ? "true" : "false"}</p>
        <p>isBurnCompleted: {isBurnCompleted(tx) ? "true" : "false"}</p>
        <p>isReleased: {isReleased(tx) ? "true" : "false"}</p>
        <p>isBurnErroring: {isBurnErroring(tx as any) ? "true" : "false"}</p>
      </>
    }
    <button onClick={handleBurn}>Burn</button>
    <pre>
      {JSON.stringify(current.context, null, 2)}
    </pre>
  </>
}
