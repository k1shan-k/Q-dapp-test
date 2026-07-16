# Quranium Votes

An on-chain voting DApp for the Quranium Testnet: create proposals, cast votes, and watch
results update live — all real transactions, no mocked data. Sibling project to the
`quantum-notes-dapp` in the parent folder; built on the same wallet/network patterns.

Testnet-only design note: `vote()` has no one-address-one-vote restriction, so a single
connected wallet can vote on the same proposal as many times as it wants. Each click is a
real transaction and immediately moves the live results.

## 1. Install

```bash
npm install
```

## 2. Deploy `Voting.sol`

You need a wallet with testnet QRN for gas.

```bash
cp .env.example .env
# edit .env and set PRIVATE_KEY=<your funded testnet wallet's private key>

npm run compile
npm run deploy
```

`npm run deploy` runs `hardhat run scripts/deploy.js --network quraniumTestnet` against
`https://tqrn-node1.quranium.org/node` (chain ID `4062024`) and prints the deployed
contract address. This uses a plain ethers/Hardhat signer over JSON-RPC, which is a
separate code path from the browser wallet extension and is unaffected by the
post-quantum-signature quirk described below.

Never commit `.env` — it's already in `.gitignore`.

## 3. Point the frontend at your contract

Either:
- Paste the deployed address into `src/contract.js` as `DEFAULT_CONTRACT_ADDRESS`, or
- Leave it blank, run the app, and paste the address into the in-app **Settings** panel
  (gear icon in the header) — it's saved to `localStorage` so you only do this once per
  browser.

## 4. Run

```bash
npm run dev
```

Open the app, install/unlock the **Qsafe** wallet extension (or any injected provider
exposing `window.qsafe` / `window.quranium` / `window.ethereum`), click **Connect
Wallet**, and switch to Quranium Testnet when prompted.

## Quranium-specific gotcha carried over from the Notes DApp

Quranium signs transactions with post-quantum **SLH-DSA** signatures, not ECDSA. If you
send a transaction the normal ethers.js way —
`contract.connect(signer).someMethod()` followed by `tx.wait()` — ethers throws trying to
parse the transaction response, because it expects `r`/`s`/`v` fields and instead gets a
`sig` field.

This app never goes through that path for writes. `sendContractTx()` in `src/App.jsx`:
1. Encodes calldata itself with `ethers.Interface().encodeFunctionData()`.
2. Sends it via the wallet's raw `eth_sendTransaction` RPC call.
3. Polls `eth_getTransactionReceipt` manually instead of calling `tx.wait()`.

Reads (`eth_call`) can also fail through some wallet providers, so `loadProposals()`
falls back to a direct `ethers.JsonRpcProvider` against the public RPC endpoint if the
wallet-routed read throws.

If you extend this contract with new write functions, route them through
`sendContractTx()` rather than calling contract methods directly on a signer-connected
`ethers.Contract` — that's what will resurface the "missing r" crash.

## Network details

| | |
|---|---|
| Chain name | Quranium Testnet |
| Chain ID | `4062024` (`0x3dfb48`) |
| RPC URL | `https://tqrn-node1.quranium.org/node` |
| Currency | QRN (18 decimals) |
| Explorer | https://testnet.qrnscan.com |
