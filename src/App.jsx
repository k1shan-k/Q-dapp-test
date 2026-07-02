import React, { useState, useEffect } from "react";
import { ethers } from "ethers";
import { 
  Wallet, 
  Search, 
  Clock, 
  RefreshCw, 
  AlertTriangle, 
  Layers, 
  BookOpen, 
  Settings, 
  Send,
  Copy,
  Check,
  ExternalLink
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

function App() {
  const walletProvider = getWalletProvider();

  // Config & Provider states
  const [contractAddress, setContractAddress] = useState(() => {
    try {
      return localStorage.getItem("notes_contract_address") || DEFAULT_CONTRACT_ADDRESS;
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
  const [notes, setNotes] = useState([]);
  const [inputText, setInputText] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [loadingNotes, setLoadingNotes] = useState(false);
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  
  // Transaction & Mining states
  const [isMining, setIsMining] = useState(false);
  const [miningMessage, setMiningMessage] = useState("");
  const [pendingTxHash, setPendingTxHash] = useState("");
  const [copySuccess, setCopySuccess] = useState("");

  // Store contract address locally when modified
  const handleContractAddressChange = (address) => {
    setContractAddress(address);
    try {
      localStorage.setItem("notes_contract_address", address);
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

  // Sync notes on contract address changes
  useEffect(() => {
    if (walletConnected) {
      loadNotes();
    }
  }, [walletConnected, contractAddress]);

  const handleAccountsChanged = (accounts) => {
    if (accounts && accounts.length > 0) {
      setWalletAddress(accounts[0]);
      updateBalance(accounts[0]);
    } else {
      setWalletConnected(false);
      setWalletAddress("");
      setWalletBalance("0.00");
      setNotes([]);
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
      contract.removeAllListeners("NoteCreated");
      
      contract.on("NoteCreated", (author, text, timestamp) => {
        setSuccessMessage("New note written to Quranium blockchain!");
        setTimeout(() => setSuccessMessage(""), 4000);
        loadNotes();
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
        loadNotes();
      }
    } catch (err) {
      setError(err.message || "Connection rejected.");
    }
  };

  // Load Notes from blockchain
  const loadNotes = async () => {
    if (!contractAddress) return;
    
    setLoadingNotes(true);
    setError("");
    
    try {
      // Try wallet provider first, fall back to direct RPC for read-only calls.
      // Some wallet extensions don't properly route eth_call through their provider.
      let provider;
      try {
        if (walletProvider) {
          provider = new ethers.BrowserProvider(walletProvider);
        } else {
          provider = new ethers.JsonRpcProvider(QURANIUM_TESTNET.rpcUrls[0]);
        }
      } catch {
        provider = new ethers.JsonRpcProvider(QURANIUM_TESTNET.rpcUrls[0]);
      }

      const cleanAddress = String(contractAddress).trim().toLowerCase();
      const contract = new ethers.Contract(cleanAddress, CONTRACT_ABI, provider);
      
      let totalNotes;
      try {
        totalNotes = await contract.getTotalNotes();
      } catch (walletReadErr) {
        // Wallet provider failed for read call — retry with direct RPC
        console.warn("Wallet provider read failed, retrying with direct RPC:", walletReadErr.message);
        const rpcProvider = new ethers.JsonRpcProvider(QURANIUM_TESTNET.rpcUrls[0]);
        const rpcContract = new ethers.Contract(cleanAddress, CONTRACT_ABI, rpcProvider);
        totalNotes = await rpcContract.getTotalNotes();
        // If this succeeds, use rpcContract for the rest
        const count = Number(totalNotes);
        const promises = [];
        for (let i = 0; i < count; i++) {
          promises.push(rpcContract.getNote(i));
        }
        const results = await Promise.all(promises);
        const formattedNotes = results.map(([author, text, timestamp], idx) => ({
          id: idx, author, text, timestamp: Number(timestamp) * 1000
        }));
        formattedNotes.sort((a, b) => b.timestamp - a.timestamp);
        setNotes(formattedNotes);
        setLoadingNotes(false);
        return;
      }

      const count = Number(totalNotes);
      const promises = [];
      for (let i = 0; i < count; i++) {
        promises.push(contract.getNote(i));
      }

      const results = await Promise.all(promises);
      const formattedNotes = results.map(([author, text, timestamp], idx) => ({
        id: idx,
        author,
        text,
        timestamp: Number(timestamp) * 1000
      }));

      // Show newest notes first
      formattedNotes.sort((a, b) => b.timestamp - a.timestamp);
      setNotes(formattedNotes);
    } catch (err) {
      console.error(err);
      setError("Could not read contract data. Ensure your contract address is correct and you are on the Quranium network.");
    } finally {
      setLoadingNotes(false);
    }
  };

  // Save Note (real blockchain transaction)
  const saveNote = async (e) => {
    e.preventDefault();
    if (!inputText.trim()) return;
    if (!walletConnected) {
      setError("Please connect your wallet first.");
      return;
    }
    setError("");
    setIsMining(true);
    setMiningMessage("Please sign the transaction in your Qsafe wallet...");
    setPendingTxHash("");

    try {
      const cleanAddress = String(contractAddress).trim().toLowerCase();
      
      // Encode transaction data to bypass ethers transaction response signature parsing
      const iface = new ethers.Interface(CONTRACT_ABI);
      const data = iface.encodeFunctionData("createNote", [inputText]);
      
      const txParams = {
        from: walletAddress,
        to: cleanAddress,
        data: data,
      };
      
      const txHash = await walletProvider.request({
        method: "eth_sendTransaction",
        params: [txParams],
      });

      setPendingTxHash(txHash);
      setMiningMessage("Broadcasting transaction to Quranium validator network...");
      
      // Quranium uses post-quantum SLH-DSA signatures instead of ECDSA.
      // ethers.js tx.wait() crashes because it expects r,s,v fields but gets a `sig` field.
      // So we poll the receipt via raw JSON-RPC to bypass ethers' signature parsing.
      let receipt = null;
      let attempts = 0;
      const maxAttempts = 60; // ~60 seconds max wait
      
      while (!receipt && attempts < maxAttempts) {
        await new Promise(resolve => setTimeout(resolve, 1000));
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

      if (receipt) {
        const blockNum = parseInt(receipt.blockNumber, 16);
        const success = receipt.status === "0x1";
        
        if (success) {
          setMiningMessage(`Success! Note stored in Block #${blockNum}`);
          setInputText("");
          updateBalance(walletAddress);
          setTimeout(() => {
            setIsMining(false);
            setSuccessMessage("Note permanently written to the Quranium blockchain!");
            setTimeout(() => setSuccessMessage(""), 4000);
            loadNotes();
          }, 1500);
        } else {
          setError("Transaction was mined but reverted on-chain. Check your contract.");
          setIsMining(false);
        }
      } else {
        // Timeout - tx may still be pending
        setMiningMessage("");
        setError(`Transaction sent (${txHash.slice(0, 10)}...) but receipt not received within timeout. It may still confirm — check the explorer.`);
        setIsMining(false);
      }
    } catch (err) {
      console.error(err);
      // Check if ethers threw during send (user rejected, gas issues, etc.)
      const msg = err?.info?.error?.message || err.reason || err.message || "Transaction failed";
      setError(msg);
      setIsMining(false);
    }
  };

  const copyAddress = (address, id) => {
    navigator.clipboard.writeText(address);
    setCopySuccess(id);
    setTimeout(() => setCopySuccess(""), 1500);
  };

  const filteredNotes = notes.filter(note => {
    const text = note.text ? String(note.text).toLowerCase() : "";
    const author = note.author ? String(note.author).toLowerCase() : "";
    const query = searchQuery ? searchQuery.toLowerCase() : "";
    return text.includes(query) || author.includes(query);
  });

  return (
    <div className="app-container">
      {/* Simple Header */}
      <header className="navbar">
        <div className="logo-container">
          <Layers size={24} color="var(--accent-cyan)" />
          <h1 className="logo-text">Quantum Notes</h1>
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
            <label className="field-label">Notes Contract Address</label>
            <input 
              type="text" 
              className="address-input"
              value={contractAddress}
              onChange={(e) => handleContractAddressChange(e.target.value)}
              placeholder="0x..."
            />
            <span className="field-hint">
              Paste the address of your deployed Solidity contract. Default Quranium address: <code>{DEFAULT_CONTRACT_ADDRESS}</code>
            </span>
          </div>
        </div>
      )}

      {/* Main Page Layout - Two Columns */}
      <div className="dashboard-grid">
        
        {/* Left Column: Create Note */}
        <section className="editor-section">
          <div className="editor-card">
            <h2 className="section-title">
              <Send size={16} /> New Note
            </h2>
            <form onSubmit={saveNote} className="editor-form">
              <textarea 
                className="note-textarea"
                placeholder="Write a permanent, on-chain note..."
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                maxLength={500}
                disabled={!walletConnected || isMining}
              />
              <div className="form-footer">
                <span className="char-count">{inputText.length}/500</span>
                <button 
                  type="submit" 
                  className="btn-submit"
                  disabled={!walletConnected || !inputText.trim() || isMining}
                >
                  {isMining ? "Confirming..." : "Save to Blockchain"}
                </button>
              </div>
            </form>
          </div>
        </section>

        {/* Right Column: Note Explorer */}
        <section className="explorer-section">
          <div className="section-header">
            <h2 className="section-title">
              <BookOpen size={16} /> Notes Explorer
              {loadingNotes && <RefreshCw size={12} className="spinner-small" />}
            </h2>
            
            <div className="search-bar">
              <Search size={14} color="var(--text-muted)" />
              <input 
                type="text" 
                placeholder="Search notes or wallet addresses..."
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
              <p className="desc">Please connect your Qsafe wallet in the header to view or write notes.</p>
              <button className="btn-connect" style={{ marginTop: "1rem" }} onClick={connectWallet}>
                Connect Wallet
              </button>
            </div>
          ) : loadingNotes && notes.length === 0 ? (
            <div className="status-placeholder">
              <RefreshCw size={32} className="spinner-large" />
              <p className="title">Reading Ledger Data</p>
              <p className="desc">Fetching notes from the contract...</p>
            </div>
          ) : filteredNotes.length === 0 ? (
            <div className="status-placeholder">
              <BookOpen size={32} className="icon-muted" />
              <p className="title">No notes found</p>
              <p className="desc">
                {searchQuery ? "No on-chain records match your search term." : "No notes are recorded on this contract address yet. Write the first note!"}
              </p>
            </div>
          ) : (
            <div className="notes-list">
              {filteredNotes.map((note) => (
                <article key={note.id} className="note-card">
                  <div className="note-body">{note.text}</div>
                  <div className="note-footer">
                    <div className="footer-row">
                      <span className="label">Author:</span>
                      <button 
                        className="author-badge"
                        onClick={() => copyAddress(note.author, `addr-${note.id}`)}
                        title="Copy Wallet Address"
                      >
                        {copySuccess === `addr-${note.id}` ? (
                          <>
                            <Check size={10} /> Copied
                          </>
                        ) : (
                          <>
                            <Copy size={10} /> {note.author ? `${note.author.substring(0, 6)}...${note.author.substring(note.author.length - 4)}` : "0x..."}
                          </>
                        )}
                      </button>
                    </div>
                    
                    <div className="footer-row">
                      <span className="label" style={{ display: "flex", alignItems: "center", gap: "0.25rem" }}>
                        <Clock size={10} /> Saved:
                      </span>
                      <span className="timestamp">
                        {new Date(note.timestamp).toLocaleString()}
                      </span>
                    </div>
                  </div>
                </article>
              ))}
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
