import React, { useState, useEffect } from "react";
import { ethers } from "ethers";
import {
  Wallet,
  Search,
  Clock,
  RefreshCw,
  AlertTriangle,
  Layers,
  Settings,
  PlusCircle,
  Copy,
  Check,
  ExternalLink,
  BarChart3,
  Users,
  CheckCircle2
} from "lucide-react";
import { CONTRACT_ABI, DEFAULT_CONTRACT_ADDRESS, QURANIUM_TESTNET } from "./contract";

// Helper to retrieve the injected Web3 wallet provider.
// We prioritize window.qsafe and window.quranium to target the Qsafe wallet directly,
// preventing other EVM wallets (like MetaMask) from intercepting provider calls.
// It also checks for nested providers (like providers.ql1evm or providers.ethereum)
// which multi-wallet extensions inject.
const getWalletProvider = () => {
  if (typeof window === "undefined") return null;

  let provider = window.qsafe || window.quranium || window.ethereum;
  if (!provider) return null;

  // If it's a multi-provider coordinator wrapper, extract the specific Qsafe/EVM provider
  if (provider.providers) {
    provider = provider.providers.ql1evm || provider.providers.ethereum || provider;
  }

  return provider;
};

// Reads every proposal (and, if a voter address is supplied, that voter's personal
// tally on each one) from a connected contract instance. Shared by both the primary
// read path and the direct-RPC fallback path so the two never drift apart.
const fetchAllProposals = async (contract, voterAddress) => {
  const total = await contract.getTotalProposals();
  const count = Number(total);

  const results = await Promise.all(
    Array.from({ length: count }, (_, i) => i).map(async (i) => {
      const [creator, title, description, createdAt, voteCount] = await contract.getProposal(i);

      let myVotes = 0;
      if (voterAddress) {
        try {
          myVotes = Number(await contract.getVotesCastBy(i, voterAddress));
        } catch {
          myVotes = 0;
        }
      }

      return {
        id: i,
        creator,
        title,
        description,
        createdAt: Number(createdAt) * 1000,
        voteCount: Number(voteCount),
        myVotes
      };
    })
  );

  // Live results: highest vote count leads, ties broken by newest proposal first.
  results.sort((a, b) => b.voteCount - a.voteCount || b.createdAt - a.createdAt);
  return results;
};

function App() {
  const walletProvider = getWalletProvider();

  // Config & Provider states
  const [contractAddress, setContractAddress] = useState(() => {
    try {
      return localStorage.getItem("voting_contract_address") || DEFAULT_CONTRACT_ADDRESS;
    } catch (e) {
      return DEFAULT_CONTRACT_ADDRESS;
    }
  });
  const [showSettings, setShowSettings] = useState(false);

  // Wallet states
  const [walletConnected, setWalletConnected] = useState(false);
  const [walletAddress, setWalletAddress] = useState("");
  const [walletBalance, setWalletBalance] = useState("0.00");
  const [isCorrectNetwork, setIsCorrectNetwork] = useState(true);
  const [currentChainId, setCurrentChainId] = useState(null);
  const [showNetworkWarning, setShowNetworkWarning] = useState(true);

  // App logic states
  const [proposals, setProposals] = useState([]);
  const [newTitle, setNewTitle] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [loadingProposals, setLoadingProposals] = useState(false);
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  // Transaction & Mining states
  const [isMining, setIsMining] = useState(false);
  const [miningMessage, setMiningMessage] = useState("");
  const [pendingTxHash, setPendingTxHash] = useState("");
  const [votingProposalId, setVotingProposalId] = useState(null);
  const [copySuccess, setCopySuccess] = useState("");

  // Store contract address locally when modified
  const handleContractAddressChange = (address) => {
    setContractAddress(address);
    try {
      localStorage.setItem("voting_contract_address", address);
    } catch (e) {
      console.warn("localStorage access denied:", e);
    }
  };

  // Check if wallet is already connected and setup event listeners
  useEffect(() => {
    checkWalletConnection();

    if (walletProvider && typeof walletProvider.on === "function") {
      // Listen for account switches
      walletProvider.on("accountsChanged", handleAccountsChanged);
      // Listen for network switches
      walletProvider.on("chainChanged", () => {
        window.location.reload();
      });
    }

    return () => {
      if (walletProvider && typeof walletProvider.removeListener === "function") {
        walletProvider.removeListener("accountsChanged", handleAccountsChanged);
      }
    };
  }, [contractAddress, walletProvider]);

  // Sync proposals on contract address changes
  useEffect(() => {
    if (walletConnected) {
      loadProposals();
    }
  }, [walletConnected, contractAddress]);

  const handleAccountsChanged = (accounts) => {
    if (accounts && accounts.length > 0) {
      setWalletAddress(accounts[0]);
      updateBalance(accounts[0]);
      loadProposals();
    } else {
      setWalletConnected(false);
      setWalletAddress("");
      setWalletBalance("0.00");
      setProposals([]);
    }
  };

  // Check initial connection
  const checkWalletConnection = async () => {
    if (!walletProvider) return;

    try {
      const provider = new ethers.BrowserProvider(walletProvider);
      const accounts = await provider.listAccounts();
      if (accounts.length > 0) {
        const address = await accounts[0].getAddress();
        setWalletAddress(address);
        setWalletConnected(true);
        await checkNetwork(provider);
        await updateBalance(address);
        setupContractEventListener();
      }
    } catch (err) {
      console.error("Auto-connection check failed:", err);
    }
  };

  // Verify network chain
  const checkNetwork = async (provider) => {
    try {
      const network = await provider.getNetwork();
      const chainIdNum = Number(network.chainId);
      setCurrentChainId(chainIdNum);
      const targetChainId = Number(BigInt(QURANIUM_TESTNET.chainId));
      const correct = chainIdNum === targetChainId;
      setIsCorrectNetwork(correct);
      return correct;
    } catch (err) {
      console.error(err);
      return false;
    }
  };

  // Switch network helper
  const switchNetwork = async () => {
    if (!walletProvider) return;

    try {
      setError("");
      await walletProvider.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: QURANIUM_TESTNET.chainId }],
      });
    } catch (switchError) {
      // If network doesn't exist, try to add it
      if (switchError.code === 4902) {
        try {
          await walletProvider.request({
            method: "wallet_addEthereumChain",
            params: [QURANIUM_TESTNET],
          });
        } catch (addError) {
          setError("Failed to add Quranium Testnet to your wallet.");
        }
      } else {
        setError("Failed to switch network: " + (switchError.message || ""));
      }
    }
  };

  // Update balance helper
  const updateBalance = async (address) => {
    if (!walletProvider) return;
    try {
      const provider = new ethers.BrowserProvider(walletProvider);
      const balanceWei = await provider.getBalance(address);
      setWalletBalance(parseFloat(ethers.formatEther(balanceWei)).toFixed(4));
    } catch (err) {
      console.error("Failed to load balance:", err);
    }
  };

  // Setup live event listening
  const setupContractEventListener = async () => {
    if (!walletProvider) return;
    try {
      const provider = new ethers.BrowserProvider(walletProvider);
      const cleanAddress = String(contractAddress).trim().toLowerCase();
      const contract = new ethers.Contract(cleanAddress, CONTRACT_ABI, provider);

      // Clean up previous listeners
      contract.removeAllListeners("ProposalCreated");
      contract.removeAllListeners("VoteCast");

      contract.on("ProposalCreated", () => {
        setSuccessMessage("New proposal created on the Quranium blockchain!");
        setTimeout(() => setSuccessMessage(""), 4000);
        loadProposals();
      });

      contract.on("VoteCast", () => {
        loadProposals();
      });
    } catch (err) {
      console.error("Event listener setup failed:", err);
    }
  };

  // Connect wallet action
  const connectWallet = async () => {
    setError("");
    if (!walletProvider) {
      setError("Qsafe wallet extension or Quranium compatible provider not found. Please install the Qsafe wallet extension.");
      return;
    }

    try {
      const provider = new ethers.BrowserProvider(walletProvider);
      const accounts = await walletProvider.request({ method: "eth_requestAccounts" });

      if (accounts.length > 0) {
        const address = accounts[0];
        setWalletAddress(address);
        setWalletConnected(true);

        const correctNet = await checkNetwork(provider);
        if (!correctNet) {
          await switchNetwork();
        }

        await updateBalance(address);
        setupContractEventListener();
        loadProposals();
      }
    } catch (err) {
      setError(err.message || "Connection rejected.");
    }
  };

  // Load Proposals from blockchain
  const loadProposals = async () => {
    if (!contractAddress) return;

    setLoadingProposals(true);
    setError("");

    try {
      // Try wallet provider first, fall back to direct RPC for read-only calls.
      // Some wallet extensions don't properly route eth_call through their provider.
      let provider;
      try {
        provider = walletProvider
          ? new ethers.BrowserProvider(walletProvider)
          : new ethers.JsonRpcProvider(QURANIUM_TESTNET.rpcUrls[0]);
      } catch {
        provider = new ethers.JsonRpcProvider(QURANIUM_TESTNET.rpcUrls[0]);
      }

      const cleanAddress = String(contractAddress).trim().toLowerCase();
      const voterAddress = walletConnected ? walletAddress : null;

      let formatted;
      try {
        const contract = new ethers.Contract(cleanAddress, CONTRACT_ABI, provider);
        formatted = await fetchAllProposals(contract, voterAddress);
      } catch (walletReadErr) {
        // Wallet provider failed for read calls — retry with direct RPC
        console.warn("Wallet provider read failed, retrying with direct RPC:", walletReadErr.message);
        const rpcProvider = new ethers.JsonRpcProvider(QURANIUM_TESTNET.rpcUrls[0]);
        const rpcContract = new ethers.Contract(cleanAddress, CONTRACT_ABI, rpcProvider);
        formatted = await fetchAllProposals(rpcContract, voterAddress);
      }

      setProposals(formatted);
    } catch (err) {
      console.error(err);
      setError("Could not read contract data. Ensure your contract address is correct and you are on the Quranium network.");
    } finally {
      setLoadingProposals(false);
    }
  };

  // Encodes calldata and sends a raw eth_sendTransaction, then manually polls for the
  // receipt via raw JSON-RPC.
  //
  // Quranium uses post-quantum SLH-DSA signatures instead of ECDSA. Going through
  // ethers' normal Signer.sendTransaction()/ContractTransactionResponse.wait() flow
  // crashes because ethers expects r,s,v fields on the tx response but the wallet
  // returns a `sig` field instead. So every write here bypasses ethers' signature
  // parsing entirely: encode calldata ourselves, hand it to the wallet's raw
  // eth_sendTransaction, and poll eth_getTransactionReceipt directly.
  const sendContractTx = async (functionName, args, broadcastMessage) => {
    const cleanAddress = String(contractAddress).trim().toLowerCase();

    const iface = new ethers.Interface(CONTRACT_ABI);
    const data = iface.encodeFunctionData(functionName, args);

    const txParams = {
      from: walletAddress,
      to: cleanAddress,
      data,
    };

    const txHash = await walletProvider.request({
      method: "eth_sendTransaction",
      params: [txParams],
    });

    setPendingTxHash(txHash);
    setMiningMessage(broadcastMessage);

    let receipt = null;
    let attempts = 0;
    const maxAttempts = 60; // ~60 seconds max wait

    while (!receipt && attempts < maxAttempts) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      attempts++;
      try {
        receipt = await walletProvider.request({
          method: "eth_getTransactionReceipt",
          params: [txHash],
        });
      } catch (rpcErr) {
        console.warn("Receipt poll attempt", attempts, rpcErr);
      }
    }

    return { txHash, receipt };
  };

  // Create Proposal (real blockchain transaction)
  const createProposal = async (e) => {
    e.preventDefault();
    if (!newTitle.trim()) return;
    if (!walletConnected) {
      setError("Please connect your wallet first.");
      return;
    }
    setError("");
    setIsMining(true);
    setMiningMessage("Please sign the transaction in your Qsafe wallet...");
    setPendingTxHash("");

    try {
      const { txHash, receipt } = await sendContractTx(
        "createProposal",
        [newTitle, newDescription],
        "Broadcasting proposal to Quranium validator network..."
      );

      if (receipt) {
        const blockNum = parseInt(receipt.blockNumber, 16);
        const success = receipt.status === "0x1";

        if (success) {
          setMiningMessage(`Success! Proposal recorded in Block #${blockNum}`);
          setNewTitle("");
          setNewDescription("");
          updateBalance(walletAddress);
          setTimeout(() => {
            setIsMining(false);
            setSuccessMessage("Proposal permanently written to the Quranium blockchain!");
            setTimeout(() => setSuccessMessage(""), 4000);
            loadProposals();
          }, 1500);
        } else {
          setError("Transaction was mined but reverted on-chain. Check your contract.");
          setIsMining(false);
        }
      } else {
        setMiningMessage("");
        setError(`Transaction sent (${txHash.slice(0, 10)}...) but receipt not received within timeout. It may still confirm — check the explorer.`);
        setIsMining(false);
      }
    } catch (err) {
      console.error(err);
      const msg = err?.info?.error?.message || err.reason || err.message || "Transaction failed";
      setError(msg);
      setIsMining(false);
    }
  };

  // Cast Vote (real blockchain transaction). Testnet-only design: a single wallet may
  // vote on the same proposal as many times as it wants — every vote is a fresh
  // on-chain transaction and the live results reflect it immediately.
  const castVote = async (proposalId) => {
    if (!walletConnected) {
      setError("Please connect your wallet first.");
      return;
    }
    setError("");
    setIsMining(true);
    setVotingProposalId(proposalId);
    setMiningMessage("Please sign the transaction in your Qsafe wallet...");
    setPendingTxHash("");

    try {
      const { txHash, receipt } = await sendContractTx(
        "vote",
        [proposalId],
        "Broadcasting vote to Quranium validator network..."
      );

      if (receipt) {
        const blockNum = parseInt(receipt.blockNumber, 16);
        const success = receipt.status === "0x1";

        if (success) {
          setMiningMessage(`Success! Vote recorded in Block #${blockNum}`);
          updateBalance(walletAddress);
          setTimeout(() => {
            setIsMining(false);
            setVotingProposalId(null);
            setSuccessMessage("Vote permanently written to the Quranium blockchain!");
            setTimeout(() => setSuccessMessage(""), 4000);
            loadProposals();
          }, 1500);
        } else {
          setError("Transaction was mined but reverted on-chain. Check your contract.");
          setIsMining(false);
          setVotingProposalId(null);
        }
      } else {
        setMiningMessage("");
        setError(`Transaction sent (${txHash.slice(0, 10)}...) but receipt not received within timeout. It may still confirm — check the explorer.`);
        setIsMining(false);
        setVotingProposalId(null);
      }
    } catch (err) {
      console.error(err);
      const msg = err?.info?.error?.message || err.reason || err.message || "Transaction failed";
      setError(msg);
      setIsMining(false);
      setVotingProposalId(null);
    }
  };

  const copyAddress = (address, id) => {
    navigator.clipboard.writeText(address);
    setCopySuccess(id);
    setTimeout(() => setCopySuccess(""), 1500);
  };

  const filteredProposals = proposals.filter((p) => {
    const title = p.title ? String(p.title).toLowerCase() : "";
    const description = p.description ? String(p.description).toLowerCase() : "";
    const creator = p.creator ? String(p.creator).toLowerCase() : "";
    const query = searchQuery ? searchQuery.toLowerCase() : "";
    return title.includes(query) || description.includes(query) || creator.includes(query);
  });

  const totalVotes = proposals.reduce((sum, p) => sum + p.voteCount, 0);

  return (
    <div className="app-container">
      {/* Simple Header */}
      <header className="navbar">
        <div className="logo-container">
          <Layers size={24} color="var(--accent-cyan)" />
          <h1 className="logo-text">Quranium Votes</h1>
        </div>

        <div className="nav-actions">
          {/* Settings trigger */}
          <button
            className="settings-btn"
            onClick={() => setShowSettings(!showSettings)}
            style={{
              background: "transparent",
              border: "none",
              color: showSettings ? "var(--accent-cyan)" : "var(--text-secondary)",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              padding: "0.5rem"
            }}
            title="Contract Settings"
          >
            <Settings size={18} />
          </button>

          {/* Connect Button */}
          {walletConnected ? (
            <div className="wallet-pill">
              <span className="balance">{walletBalance} QRN</span>
              <span className="address">
                {walletAddress ? `${walletAddress.substring(0, 6)}...${walletAddress.substring(walletAddress.length - 4)}` : ""}
              </span>
            </div>
          ) : (
            <button className="btn-connect" onClick={connectWallet}>
              <Wallet size={15} /> Connect Wallet
            </button>
          )}
        </div>
      </header>

      {/* Network Alert Banner */}
      {walletConnected && !isCorrectNetwork && showNetworkWarning && (
        <div className="alert-banner warning" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
            <AlertTriangle size={18} style={{ flexShrink: 0 }} />
            <span>
              Connected to Chain ID <strong>{currentChainId}</strong>. Expected Quranium Testnet (Chain ID <strong>{Number(BigInt(QURANIUM_TESTNET.chainId))}</strong>).
            </span>
          </div>
          <div style={{ display: "flex", gap: "0.5rem", flexShrink: 0 }}>
            <button onClick={switchNetwork} className="btn-small">Switch Network</button>
            <button onClick={() => setShowNetworkWarning(false)} className="btn-small" style={{ opacity: 0.7 }}>Ignore & Proceed</button>
          </div>
        </div>
      )}

      {/* General error feedback */}
      {error && (
        <div className="alert-banner error">
          <AlertTriangle size={18} />
          <span>{error}</span>
        </div>
      )}

      {/* General success message */}
      {successMessage && (
        <div className="alert-banner success">
          <Check size={18} />
          <span>{successMessage}</span>
        </div>
      )}

      {/* Deployed Contract Configuration Panel */}
      {showSettings && (
        <div className="settings-panel">
          <div className="panel-title">
            <Settings size={16} /> Deployed Smart Contract Setup
          </div>
          <div className="panel-body">
            <label className="field-label">Voting Contract Address</label>
            <input
              type="text"
              className="address-input"
              value={contractAddress}
              onChange={(e) => handleContractAddressChange(e.target.value)}
              placeholder="0x..."
            />
            <span className="field-hint">
              Paste the address of your deployed Voting.sol contract (see README for deploy steps).
            </span>
          </div>
        </div>
      )}

      {/* Main Page Layout - Two Columns */}
      <div className="dashboard-grid">

        {/* Left Column: Create Proposal */}
        <section className="editor-section">
          <div className="editor-card">
            <h2 className="section-title">
              <PlusCircle size={16} /> New Proposal
            </h2>
            <form onSubmit={createProposal} className="editor-form">
              <input
                type="text"
                className="proposal-title-input"
                placeholder="Proposal title..."
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                maxLength={120}
                disabled={!walletConnected || isMining}
              />
              <textarea
                className="note-textarea"
                placeholder="Describe the proposal (optional)..."
                value={newDescription}
                onChange={(e) => setNewDescription(e.target.value)}
                maxLength={500}
                disabled={!walletConnected || isMining}
              />
              <div className="form-footer">
                <span className="char-count">{newDescription.length}/500</span>
                <button
                  type="submit"
                  className="btn-submit"
                  disabled={!walletConnected || !newTitle.trim() || isMining}
                >
                  {isMining ? "Confirming..." : "Create Proposal"}
                </button>
              </div>
            </form>

            <div className="stats-card">
              <div className="stat-row">
                <span className="stat-label"><Layers size={12} /> Proposals</span>
                <span className="stat-value">{proposals.length}</span>
              </div>
              <div className="stat-row">
                <span className="stat-label"><Users size={12} /> Total Votes Cast</span>
                <span className="stat-value">{totalVotes}</span>
              </div>
            </div>
          </div>
        </section>

        {/* Right Column: Proposal Explorer */}
        <section className="explorer-section">
          <div className="section-header">
            <h2 className="section-title">
              <BarChart3 size={16} /> Live Results
              {loadingProposals && <RefreshCw size={12} className="spinner-small" />}
            </h2>

            <div className="search-bar">
              <Search size={14} color="var(--text-muted)" />
              <input
                type="text"
                placeholder="Search proposals or wallet addresses..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="search-input"
              />
            </div>
          </div>

          {!walletConnected ? (
            <div className="status-placeholder">
              <Wallet size={32} className="icon-muted" />
              <p className="title">Wallet Disconnected</p>
              <p className="desc">Please connect your Qsafe wallet in the header to view proposals or vote.</p>
              <button className="btn-connect" style={{ marginTop: "1rem" }} onClick={connectWallet}>
                Connect Wallet
              </button>
            </div>
          ) : loadingProposals && proposals.length === 0 ? (
            <div className="status-placeholder">
              <RefreshCw size={32} className="spinner-large" />
              <p className="title">Reading Ledger Data</p>
              <p className="desc">Fetching proposals from the contract...</p>
            </div>
          ) : filteredProposals.length === 0 ? (
            <div className="status-placeholder">
              <BarChart3 size={32} className="icon-muted" />
              <p className="title">No proposals found</p>
              <p className="desc">
                {searchQuery ? "No on-chain records match your search term." : "No proposals are recorded on this contract address yet. Create the first one!"}
              </p>
            </div>
          ) : (
            <div className="notes-list">
              {filteredProposals.map((proposal) => {
                const sharePct = totalVotes > 0 ? (proposal.voteCount / totalVotes) * 100 : 0;
                const isVotingThis = isMining && votingProposalId === proposal.id;

                return (
                  <article key={proposal.id} className="note-card">
                    <div className="proposal-header">
                      <h3 className="proposal-title">{proposal.title}</h3>
                      <span className="vote-count-badge">{proposal.voteCount} {proposal.voteCount === 1 ? "vote" : "votes"}</span>
                    </div>

                    {proposal.description && (
                      <div className="note-body">{proposal.description}</div>
                    )}

                    <div className="progress-track">
                      <div className="progress-fill" style={{ width: `${sharePct}%` }} />
                    </div>
                    <div className="progress-label">{sharePct.toFixed(1)}% of all votes cast</div>

                    <div className="note-footer">
                      <div className="footer-row">
                        <span className="label">Created by:</span>
                        <button
                          className="author-badge"
                          onClick={() => copyAddress(proposal.creator, `addr-${proposal.id}`)}
                          title="Copy Wallet Address"
                        >
                          {copySuccess === `addr-${proposal.id}` ? (
                            <>
                              <Check size={10} /> Copied
                            </>
                          ) : (
                            <>
                              <Copy size={10} /> {proposal.creator ? `${proposal.creator.substring(0, 6)}...${proposal.creator.substring(proposal.creator.length - 4)}` : "0x..."}
                            </>
                          )}
                        </button>
                      </div>

                      <div className="footer-row">
                        <span className="label" style={{ display: "flex", alignItems: "center", gap: "0.25rem" }}>
                          <Clock size={10} /> Created:
                        </span>
                        <span className="timestamp">
                          {new Date(proposal.createdAt).toLocaleString()}
                        </span>
                      </div>

                      {proposal.myVotes > 0 && (
                        <div className="footer-row">
                          <span className="label">Your votes:</span>
                          <span className="my-votes-badge">{proposal.myVotes}</span>
                        </div>
                      )}
                    </div>

                    <button
                      className="btn-vote"
                      onClick={() => castVote(proposal.id)}
                      disabled={isMining}
                    >
                      <CheckCircle2 size={14} /> {isVotingThis ? "Confirming..." : "Cast Vote"}
                    </button>
                  </article>
                );
              })}
            </div>
          )}
        </section>

      </div>

      {/* Standard Transaction Mining Overlay */}
      {isMining && (
        <div className="modal-overlay">
          <div className="mining-modal">
            <RefreshCw size={36} className="spinner-large" color="var(--accent-cyan)" />
            <h3 className="modal-title">Writing to Blockchain</h3>
            <p className="modal-message">{miningMessage}</p>
            {pendingTxHash && (
              <a
                href={`${QURANIUM_TESTNET.blockExplorerUrls[0]}/tx/${pendingTxHash}`}
                target="_blank"
                rel="noreferrer"
                className="tx-link"
              >
                View Transaction <ExternalLink size={12} />
              </a>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// React Error Boundary to catch render errors gracefully
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error("ErrorBoundary caught runtime crash:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          padding: "2.5rem 1.5rem",
          maxWidth: "480px",
          margin: "6rem auto",
          background: "var(--bg-card, #121216)",
          border: "1px solid var(--accent-red, #ef4444)",
          borderRadius: "12px",
          color: "var(--text-primary, #fafafa)",
          fontFamily: "var(--font-sans), system-ui, sans-serif",
          boxShadow: "0 10px 30px rgba(239, 68, 68, 0.15)",
          textAlign: "center"
        }}>
          <AlertTriangle size={42} style={{ color: "var(--accent-red, #ef4444)", marginBottom: "1rem" }} />
          <h2 style={{ fontSize: "1.25rem", fontWeight: "700", marginBottom: "0.75rem" }}>Client Interface Crashed</h2>
          <p style={{ color: "var(--text-secondary, #a1a1aa)", fontSize: "0.85rem", marginBottom: "1.25rem", lineHeight: "1.5" }}>
            A client-side runtime exception occurred during rendering. This usually happens when the Web3 wallet provider fails to return expected data structure:
          </p>
          <pre style={{
            background: "var(--bg-input, #18181c)",
            border: "1px solid var(--border-color, #26262b)",
            padding: "1rem",
            borderRadius: "8px",
            fontSize: "0.8rem",
            fontFamily: "var(--font-mono), monospace",
            color: "#fca5a5",
            overflowX: "auto",
            marginBottom: "1.5rem",
            textAlign: "left"
          }}>
            {this.state.error?.toString()}
          </pre>
          <button
            onClick={() => window.location.reload()}
            style={{
              background: "var(--accent-cyan, #06b6d4)",
              color: "var(--bg-main, #0a0a0c)",
              border: "none",
              padding: "0.6rem 1.25rem",
              borderRadius: "6px",
              fontWeight: "600",
              cursor: "pointer",
              fontSize: "0.85rem"
            }}
          >
            Reload DApp
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

export default function AppWrapper() {
  return (
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  );
}
