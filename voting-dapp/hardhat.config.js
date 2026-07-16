require("@nomicfoundation/hardhat-toolbox");
require("dotenv").config();

const PRIVATE_KEY = process.env.PRIVATE_KEY;

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: "0.8.20",
  paths: {
    sources: "./contracts",
    tests: "./test",
    cache: "./cache",
    artifacts: "./artifacts"
  },
  networks: {
    quraniumTestnet: {
      url: "https://tqrn-node1.quranium.org/node",
      chainId: 4062024,
      accounts: PRIVATE_KEY ? [PRIVATE_KEY] : []
    }
  }
};
