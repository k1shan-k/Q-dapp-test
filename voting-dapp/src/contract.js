// Contract ABI and Blockchain configurations for the Quranium Testnet Voting DApp

export const CONTRACT_ABI = [
  "function createProposal(string title, string description) external",
  "function vote(uint256 proposalId) external",
  "function getProposal(uint256 index) external view returns (address creator, string title, string description, uint256 createdAt, uint256 voteCount)",
  "function getTotalProposals() external view returns (uint256)",
  "function getVotesCastBy(uint256 proposalId, address voter) external view returns (uint256)",
  "event ProposalCreated(uint256 indexed proposalId, address indexed creator, string title, uint256 timestamp)",
  "event VoteCast(uint256 indexed proposalId, address indexed voter, uint256 voteCount, uint256 timestamp)"
];

// Deployed Voting contract address on Quranium Testnet.
// Deploy contracts/Voting.sol (see README) and paste the resulting address here,
// or paste it into the in-app Settings panel — it is stored in localStorage either way.
export const DEFAULT_CONTRACT_ADDRESS = "";

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
