import RenJS from '@renproject/ren';
import { FunctionComponent, useCallback } from 'react'
(window as any).global = window;
import { Bitcoin } from "@renproject/chains-bitcoin";
import { Ethereum } from "@renproject/chains-ethereum";
import { ethers } from 'ethers';
import { RenNetwork } from '@renproject/interfaces';

const getEthereum = () => (window as any).ethereum;

const mint = async () => {
  await getEthereum().enable();
  const network = RenNetwork.Testnet;
  const asset = Bitcoin.assets.BTC;
  const from = new Bitcoin(network);
  const ethProvider = new ethers.providers.Web3Provider(getEthereum(), network);
  const to = new Ethereum(network, ethProvider);

  const renJS = new RenJS(network).withChains(from, to);

  const gateway = await renJS.gateway({
    asset,
    from: from.GatewayAddress(),
    to: to.Account(),
    nonce: 1,
  });

  const minimumAmount = gateway.fees.minimumAmount.shiftedBy(
    -from.assetDecimals(asset),
  );
  const receivedAmount = gateway.fees
    .estimateOutput(gateway.fees.minimumAmount)
    .shiftedBy(-from.assetDecimals(asset));

  console.log(
    `Deposit at least ${minimumAmount.toFixed()} ${asset} to ${
      gateway.gatewayAddress
    } (to receive at least ${receivedAmount.toFixed()})`,
  );

  // await sendFunds(asset, gateway.gatewayAddress, minimumAmount.times(5));

  let foundDeposits = 0;

  await new Promise<void>((resolve, reject) => {
    gateway.on("transaction", (tx) => {
      (async () => {
        foundDeposits += 1;

        await RenJS.defaultDepositHandler(tx);

        foundDeposits -= 1;

        console.log(
          `[${(from.chain)}⇢${(
            to.chain
          )}][${tx.hash.slice(
            0,
            6,
          )}] Done. (${foundDeposits} other deposits remaining)`,
        );
        if (foundDeposits === 0) {
          resolve();
        }
      })().catch(reject);
    });
  });

};

export const MintPage: FunctionComponent = () => {
    const handleMint = useCallback(() => {
      mint().catch(console.error)
    }, [])
    return <main>
      <h1>RenJS Mint</h1>
      <button onClick={handleMint}>Mint</button>
    </main>
}
