'use client';

import { useCallback, useState } from 'react';
import { useAccount, usePublicClient, useWriteContract } from 'wagmi';
import type { Abi, Address } from 'viem';
import { erc20Abi } from '../config/contracts';

export type ActionStatus = 'idle' | 'approving' | 'pending' | 'success' | 'error';

export interface ContractCall {
  address: Address;
  abi: Abi | readonly unknown[];
  functionName: string;
  args: readonly unknown[];
}

/** An ERC-20 allowance the action requires before it can succeed. */
export interface ApprovalNeed {
  token: Address;
  spender: Address;
  amount: bigint;
}

/**
 * Runs an optional ERC-20 approval followed by a contract call, waiting for each
 * receipt so callers can refetch balances only once the chain has actually
 * settled. Approval is skipped when the existing allowance already covers the
 * amount, so repeat deposits cost one transaction instead of two.
 */
export function useVaultAction(onSettled?: () => void) {
  const { address } = useAccount();
  const publicClient = usePublicClient();
  const { writeContractAsync } = useWriteContract();

  const [status, setStatus] = useState<ActionStatus>('idle');
  const [message, setMessage] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);

  const reset = useCallback(() => {
    setStatus('idle');
    setMessage(null);
    setTxHash(null);
  }, []);

  const execute = useCallback(
    async (call: ContractCall, approval?: ApprovalNeed, successMessage?: string) => {
      if (!address || !publicClient) {
        setStatus('error');
        setMessage('Connect a wallet first.');
        return false;
      }

      try {
        setMessage(null);
        setTxHash(null);

        if (approval && approval.amount > 0n) {
          const allowance = await publicClient.readContract({
            address: approval.token,
            abi: erc20Abi,
            functionName: 'allowance',
            args: [address, approval.spender],
          });

          if (allowance < approval.amount) {
            setStatus('approving');
            const approveHash = await writeContractAsync({
              address: approval.token,
              abi: erc20Abi,
              functionName: 'approve',
              args: [approval.spender, approval.amount],
            });
            await publicClient.waitForTransactionReceipt({ hash: approveHash });
          }
        }

        setStatus('pending');
        const hash = await writeContractAsync({
          address: call.address,
          abi: call.abi as Abi,
          functionName: call.functionName,
          args: call.args,
        });
        setTxHash(hash);

        const receipt = await publicClient.waitForTransactionReceipt({ hash });
        if (receipt.status !== 'success') throw new Error('Transaction reverted');

        setStatus('success');
        setMessage(successMessage ?? 'Transaction confirmed.');
        onSettled?.();
        return true;
      } catch (error: unknown) {
        const err = error as { shortMessage?: string; message?: string };
        setStatus('error');
        setMessage(err.shortMessage ?? err.message ?? 'Transaction failed.');
        return false;
      }
    },
    [address, publicClient, writeContractAsync, onSettled]
  );

  return {
    execute,
    reset,
    status,
    message,
    txHash,
    isBusy: status === 'approving' || status === 'pending',
  };
}
