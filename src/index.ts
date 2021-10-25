import { buildBurnConfig } from "./configs/genericBurn";
import { buildMintConfig } from "./configs/genericMint";
import { buildBurnMachine as burnMachineCreator } from "./machines/burn";
import { buildMintMachine as mintMachineCreator } from "./machines/mint";

export * from "./machines/burn";
export * from "./machines/mint";
export * from "./machines/deposit";

export * from "./configs/genericMint";
export * from "./configs/genericBurn";

export * from "./types/mint";
export * from "./types/burn";

// We can pre-configure these as it is easy to override the config
export const mintMachine = mintMachineCreator().withConfig(buildMintConfig());
export const burnMachine = burnMachineCreator().withConfig(buildBurnConfig());
