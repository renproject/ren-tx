import detectEthereumProvider from '@metamask/detect-provider'

let metamask:any = null;

detectEthereumProvider()
  .then(provider => {metamask = provider; return provider})
  .then(provider => {
      if (provider) {
        console.log('Ethereum successfully detected!');

        // From now on, this should always be true:
        // provider === window.ethereum

        // Access the decentralized web!

        // Legacy providers may only have ethereum.sendAsync
          (provider as any).request({
          method: 'eth_chainId'
        }).then(chainId => {

        })
      } else {
        // if the provider is not detected, detectEthereumProvider resolves to null
        console.error('Please install MetaMask!')
      }
})

export const ethereum = (window as any).ethereum;
