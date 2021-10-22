import 'react-app-polyfill/ie11';
import * as React from 'react';
import * as ReactDOM from 'react-dom';
import { BurnExample } from './BurnExample'
// import { MintExample } from './MintExample'

if (typeof (window as any).ethereum !== 'undefined') {
  console.log('MetaMask is installed!');
} else {
  console.error("This app requires Metamask Installed");
}

const App = () => {
  return (
    <div>
      {/*<MintExample/>*/}
      <BurnExample/>
    </div>
  );
};

ReactDOM.render(<App />, document.getElementById('root'));
