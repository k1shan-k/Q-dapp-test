// Contract ABI and Blockchain configurations for the Quranium Testnet DApp

export const CONTRACT_ABI = [
  "function createNote(string text) external",
  "function getNote(uint256 index) external view returns (address author, string text, uint256 timestamp)",
  "function getTotalNotes() external view returns (uint256)",
  "event NoteCreated(address indexed author, string text, uint256 timestamp)"
];

// Default contract address for the deployed Notes contract on Quranium Testnet
export const DEFAULT_CONTRACT_ADDRESS = "0xa7dcc8a0a0358039fd31e8bd419497ed8088f048";

// Quranium Testnet RPC details
export const QURANIUM_TESTNET = {
  chainId: "0x3dfb48", // Quranium Testnet Chain ID: 4062024
  chainName: "Quranium Testnet",
  nativeCurrency: {
    name: "Quranium",
    symbol: "QRN",
    decimals: 18,
  },
  rpcUrls: ["https://tqrn-node1.quranium.org/node"],
  blockExplorerUrls: ["https://testnet.qrnscan.com"],
};
