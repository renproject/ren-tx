import * as React from "react";
import * as ReactDOM from "react-dom";
// import { MintExample } from './MintExample'
// import { BurnExample } from './BurnExample'
import { TransactionExample } from "./TransactionExample";

if (typeof (window as any).ethereum !== "undefined") {
  console.log("MetaMask is installed!");
} else {
  console.error("This app requires Metamask Installed");
}

const App = () => {
  return (
    <div>
      <TransactionExample />
    </div>
  );
};

ReactDOM.render(<App />, document.getElementById("root"));
