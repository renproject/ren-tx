import { RenNetwork } from '@renproject/interfaces'
import { useMachine } from "@xstate/react";
import * as React from "react";
import { FunctionComponent, useMemo, useState } from 'react'
import { createTransactionMachine } from "../src";
import { Debug } from './Helpers'

// const lightMachine = createMachine({
//   // Machine identifier
//   id: "light",
//
//   // Initial state
//   initial: "green",
//
//   // Local context for entire machine
//   context: {
//     elapsed: 0,
//     direction: "east",
//   },
//
//   // State definitions
//   states: {
//     green: {
//       /* ... */
//     },
//     yellow: {
//       /* ... */
//     },
//     red: {
//       /* ... */
//     },
//   },
// });

// // Edit your service(s) here
// const service = interpret(lightMachine, {devTools: true}).onTransition(state => {
//   console.log(state);
// });
//
// service.start();
//
// service.send("NEXT");

const NETWORK = RenNetwork.Testnet;

export const TransactionExample: FunctionComponent = () => {
  const [enabled, setEnabled] = useState(false);

  return <div>
    <h1>RenJS 3.0 transaction machine</h1>
    <fieldset>
      <button onClick={() => setEnabled(!enabled)}>Enable</button>
      {enabled && <TransactionProcessor />}
    </fieldset>
  </div>;
};

export type TransactionProcessorProps = {
  network: RenNetwork
}

export const TransactionProcessor: FunctionComponent<TransactionProcessorProps> = ({network}) => {
  const transactionMachine = useMemo(() => createTransactionMachine(), []);
  const [state, send] = useMachine(transactionMachine, { devTools: true });

  console.log(state);
  
  return <Debug it={state} />
}
