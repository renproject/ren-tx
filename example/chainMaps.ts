// A mapping of how to construct parameters for host chains,
import { Bitcoin, BitcoinCash, Zcash } from '@renproject/chains-bitcoin'
// based on the destination network
import { BinanceSmartChain, Ethereum } from '@renproject/chains-ethereum'
import { RenNetwork } from '@renproject/interfaces'
import RenJS from '@renproject/ren'
import { RenJSConfig } from '@renproject/ren/build/main/config'
import {
  GatewayMachineContext,
  BurnMachineContext
} from "./../build/main";

export const getMintChainMap = (provider: any) => ({
  binanceSmartChain: (context: GatewayMachineContext<any>) => {
    const { destAddress, network } = context.tx;
    return new BinanceSmartChain(provider, network).Account({
      address: destAddress,
    });
  },
  ethereum: (context: GatewayMachineContext<any>) => {
    const { destAddress, network } = context.tx;
    return Ethereum(provider, network).Account({
      address: destAddress,
    });
  },
});

export const releaseChainMap = {
  bitcoin: () => Bitcoin(),
  zcash: () => Zcash(),
  bitcoinCash: () => BitcoinCash(),
};

export const getBurnChainMap: any = (provider: any) => ({
  ethereum: (context: BurnMachineContext<any, any>) => {
    console.log("yy", context, context.tx);
    // const amount = String(
    //   Math.floor(Number(context.tx.targetAmount) * Math.pow(10, 9))
    // );
    // const amount = String(Math.floor(Number(context.tx.targetAmount) * 1e8));
    return Ethereum(provider, context.tx.network).Account({
      address: context.tx.userAddress,
      value: context.tx.targetAmount,
      // @ts-ignore
      // amount
    }) as any;
  },
  binanceSmartChain: (context: BurnMachineContext<any, any>) => {
    const { network } = context.tx;
    return new BinanceSmartChain(provider, network).Account({
      address: context.tx.userAddress,
      value: String(Math.floor(Number(context.tx.targetAmount) * 1e8)),
    }) as any;
  },
})

export const lockChainMap = {
  bitcoin: () => Bitcoin(),
  // zcash: () => Zcash(),
  // bitcoinCash: () => BitcoinCash(),
};

const renJsConfig: RenJSConfig = {
  loadCompletedDeposits: true,
};

type RenJSCache = Record<RenNetwork, RenJS>;
const renJsCache: Partial<RenJSCache> = {};
const renJsV2Cache: Partial<RenJSCache> = {};
export const getRenJs = (network: RenNetwork) => {
  const forceV2 = true;
  const cache = forceV2 ? renJsV2Cache : renJsCache;
  if (!cache[network]) {
    cache[network] = new RenJS(network, {
      ...renJsConfig,
      useV2TransactionFormat: false,
      // @ts-ignore
      // logger: {
      //   level: 1,
      //   debug: console.debug,
      // },
    });
  }
  (window as any).renJS = cache[network];
  return cache[network] as RenJS;
};

