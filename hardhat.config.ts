import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import "@nomicfoundation/hardhat-network-helpers";

const config: HardhatUserConfig = {
  solidity: "0.8.18",
  networks: {
    hardhat: {},
    axon_local_devnet: {
      url: "http://127.0.0.1:8000",
      accounts: [
        "0x383fcff8683b8115e31613949be24254b4204ffbe43c227408a76334a2e3fb32",
        "0x37aa0f893d05914a4def0460c0a984d3611546cfb26924d7a7ca6e0db9950a2d"],
      chainId: 2022,
    },
    axon_devnet: {
      url: "http://34.216.103.183:8000/",
      accounts: ["0x383fcff8683b8115e31613949be24254b4204ffbe43c227408a76334a2e3fb32"],
      chainId: 2022,
    },
    gw_devnet: {
      url: `http://localhost:8024/instant-finality-hack`,
      accounts: [
        "0x383fcff8683b8115e31613949be24254b4204ffbe43c227408a76334a2e3fb32",
        "0x1390c30e5d5867ee7246619173b5922d3b04009cab9e9d91e14506231281a997"],
    },
  }
};

export default config;
