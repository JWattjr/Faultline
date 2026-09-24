"use client";

import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { createTransactionKit, type PolicyQuote, type SubmitInput, type TrackedStatus, type TransactionKit } from "@genlayer/transaction-kit";
import { studioDevnet } from "genlayer-js/chains";
import { CHAIN_ID, CONTRACT_ADDRESS, RPC_URL } from "./contract";

type Eip1193 = {
  request(args: { method: string; params?: unknown[] }): Promise<unknown>;
  on?(event: string, handler: (...args: unknown[]) => void): void;
  removeListener?(event: string, handler: (...args: unknown[]) => void): void;
};

declare global {
  interface Window { ethereum?: Eip1193 }
}

export type PreparedWrite = { quote: PolicyQuote; input: SubmitInput };
export type WriteProgress = TrackedStatus & { genlayerTxId: `0x${string}` };
export type StudioWallet = {
  available: boolean;
  address?: `0x${string}`;
  chainId?: number;
  connecting: boolean;
  error?: string;
  kit?: TransactionKit;
  connect: () => Promise<void>;
  switchNetwork: () => Promise<void>;
  requestTestFunds: () => Promise<string>;
  prepareWrite: (method: string, args: unknown[]) => Promise<PreparedWrite>;
  signWrite: (prepared: PreparedWrite, onUpdate: (progress: WriteProgress) => void) => Promise<WriteProgress>;
};

const subscribeToMount = () => () => undefined;
const getClientMountState = () => true;
const getServerMountState = () => false;

const CHAIN_ID_HEX = `0x${CHAIN_ID.toString(16)}`;
const NETWORK = {
  chainId: CHAIN_ID_HEX,
  chainName: "GenLayer Studio Next",
  rpcUrls: [RPC_URL],
  nativeCurrency: { name: "GEN Token", symbol: "GEN", decimals: 18 },
  blockExplorerUrls: ["https://explorer-studio-dev.genlayer.com"],
};

function errorMessage(error: unknown): string {
  if (error && typeof error === "object" && "message" in error) return String((error as { message: unknown }).message);
  return String(error);
}

export function useStudioWallet(): StudioWallet {
  const mounted = useSyncExternalStore(subscribeToMount, getClientMountState, getServerMountState);
  const [address, setAddress] = useState<`0x${string}`>();
  const [chainId, setChainId] = useState<number>();
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string>();

  useEffect(() => {
    if (!mounted || !window.ethereum) return;
    const provider = window.ethereum;
    const updateAccounts = (value: unknown) => {
      const accounts = value as string[];
      setAddress(accounts?.[0] ? accounts[0] as `0x${string}` : undefined);
    };
    const updateChain = (value: unknown) => setChainId(Number.parseInt(String(value), 16));
    void provider.request({ method: "eth_accounts" }).then(updateAccounts).catch(() => undefined);
    void provider.request({ method: "eth_chainId" }).then(updateChain).catch(() => undefined);
    provider.on?.("accountsChanged", updateAccounts);
    provider.on?.("chainChanged", updateChain);
    return () => {
      provider.removeListener?.("accountsChanged", updateAccounts);
      provider.removeListener?.("chainChanged", updateChain);
    };
  }, [mounted]);

  const switchNetwork = useCallback(async () => {
    const provider = window.ethereum;
    if (!provider) throw new Error("No browser wallet is available.");
    setError(undefined);
    try {
      await provider.request({ method: "wallet_switchEthereumChain", params: [{ chainId: CHAIN_ID_HEX }] });
    } catch (switchError) {
      if ((switchError as { code?: number })?.code !== 4902) throw switchError;
      await provider.request({ method: "wallet_addEthereumChain", params: [NETWORK] });
    }
    const activeChain = await provider.request({ method: "eth_chainId" });
    setChainId(Number.parseInt(String(activeChain), 16));
  }, []);

  const connect = useCallback(async () => {
    const provider = window.ethereum;
    if (!provider) {
      setError("No injected wallet was found. Install an EIP-1193 wallet to sign Studio Next transactions.");
      return;
    }
    setConnecting(true);
    setError(undefined);
    try {
      const accounts = await provider.request({ method: "eth_requestAccounts" }) as string[];
      if (!accounts?.[0]) throw new Error("The wallet did not return an account.");
      setAddress(accounts[0] as `0x${string}`);
      const activeChain = await provider.request({ method: "eth_chainId" });
      setChainId(Number.parseInt(String(activeChain), 16));
    } catch (connectError) {
      setError(errorMessage(connectError));
    } finally {
      setConnecting(false);
    }
  }, []);

  const kit = useMemo(() => {
    if (!mounted || !address || chainId !== CHAIN_ID || !window.ethereum) return undefined;
    return createTransactionKit({ chain: studioDevnet, provider: window.ethereum, account: address });
  }, [address, chainId, mounted]);

  const requestTestFunds = useCallback(async () => {
    if (!address) throw new Error("Connect a wallet before requesting test GEN.");
    const faucet = await fetch(RPC_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: Date.now(), method: "sim_fundAccount", params: [address, 10 * 1e18] }),
    });
    if (!faucet.ok) throw new Error(`Studio Next faucet returned HTTP ${faucet.status}`);
    const faucetBody = await faucet.json() as { result?: unknown; error?: { message?: string } };
    if (faucetBody.error?.message) throw new Error(faucetBody.error.message);
    const balanceResponse = await fetch(RPC_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: Date.now(), method: "eth_getBalance", params: [address, "latest"] }),
    });
    const balanceBody = await balanceResponse.json() as { result?: string; error?: { message?: string } };
    if (!balanceResponse.ok || balanceBody.error?.message || !balanceBody.result) throw new Error(balanceBody.error?.message ?? "Could not verify the test GEN balance.");
    return `${(Number(BigInt(balanceBody.result) / 10n ** 14n) / 1e4).toFixed(4)} GEN`;
  }, [address]);

  const prepareWrite = useCallback(async (method: string, args: unknown[]): Promise<PreparedWrite> => {
    if (!kit) throw new Error("Connect a wallet on Studio Next before preparing a transaction.");
    if (!/^0x[\da-fA-F]{40}$/.test(CONTRACT_ADDRESS)) throw new Error("A deployed Faultline address is not configured.");
    const input: SubmitInput = { kind: "write", address: CONTRACT_ADDRESS as `0x${string}`, method, args };
    const quote = await kit.estimate({ preset: "standard" }, input);
    if (quote.verification.status === "mismatch") throw new Error("Studio Next fee settings changed during the quote. Prepare a fresh transaction before signing.");
    return { quote, input };
  }, [kit]);

  const signWrite = useCallback(async (prepared: PreparedWrite, onUpdate: (progress: WriteProgress) => void): Promise<WriteProgress> => {
    if (!kit) throw new Error("Connect a wallet on Studio Next before signing.");
    const submitted = await kit.submit(prepared.quote, prepared.input);
    const final = await kit.track(submitted.genlayerTxId, (progress) => {
      onUpdate({ ...progress, genlayerTxId: submitted.genlayerTxId });
    }, { until: "finalized" });
    const result: WriteProgress = { ...final, genlayerTxId: submitted.genlayerTxId };
    onUpdate(result);
    if (result.phase !== "finalized") throw new Error(`Transaction stopped in ${result.phase}; no final state change is shown.`);
    if (result.successful !== true) throw new Error(`Transaction finalized with execution ${result.executionResultName ?? "unknown"}; the state change failed.`);
    return result;
  }, [kit]);

  return {
    available: mounted && typeof window !== "undefined" && Boolean(window.ethereum),
    address,
    chainId,
    connecting,
    error,
    kit,
    connect,
    switchNetwork: async () => {
      try { await switchNetwork(); } catch (switchError) { setError(errorMessage(switchError)); throw switchError; }
    },
    requestTestFunds,
    prepareWrite,
    signWrite,
  };
}
