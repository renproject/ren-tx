import { useMachine } from '@xstate/react'
import * as React from 'react'
import { FunctionComponent } from 'react'
import { createMachine, interpret } from 'xstate'

const lightMachine = createMachine({
  // Machine identifier
  id: 'light',

  // Initial state
  initial: 'green',

  // Local context for entire machine
  context: {
    elapsed: 0,
    direction: 'east'
  },

  // State definitions
  states: {
    green: {
      /* ... */
    },
    yellow: {
      /* ... */
    },
    red: {
      /* ... */
    }
  }
});

// // Edit your service(s) here
// const service = interpret(lightMachine, {devTools: true}).onTransition(state => {
//   console.log(state);
// });
//
// service.start();
//
// service.send("NEXT");


export const Empty: FunctionComponent = () => {
  const [state, send] = useMachine(lightMachine, {devTools: true});
  console.log(state);
  return <span>empty</span>;
}
