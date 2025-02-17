import { ethers } from 'ethers';
import {
  EIP_1271_INTERFACE,
  EIP_1271_BYTES_INTERFACE,
  MAGIC_VALUE_BYTES,
  MAGIC_VALUE,
  calculateMessageHash,
} from './signatures';
import { Methods } from '../communication/methods';
import { RPC_CALLS } from '../eth/constants';
import { Communicator, SafeInfo, SafeBalances, GetBalanceParams, RPCPayload, TransactionConfig } from '../types';

class Safe {
  private readonly communicator: Communicator;

  constructor(communicator: Communicator) {
    this.communicator = communicator;
  }

  async getInfo(): Promise<SafeInfo> {
    const response = await this.communicator.send<Methods.getSafeInfo, undefined, SafeInfo>(
      Methods.getSafeInfo,
      undefined,
    );

    return response.data;
  }

  // There is a possibility that this method will change because we may add pagination to the endpoint
  async experimental_getBalances({ currency = 'usd' }: GetBalanceParams = {}): Promise<SafeBalances> {
    const response = await this.communicator.send<Methods.getSafeBalances, { currency: string }, SafeBalances>(
      Methods.getSafeBalances,
      {
        currency,
      },
    );

    return response.data;
  }

  private async check1271Signature(messageHash: string, signature = '0x'): Promise<boolean> {
    const safeInfo = await this.getInfo();

    const encodedIsValidSignatureCall = EIP_1271_INTERFACE.encodeFunctionData('isValidSignature', [
      messageHash,
      signature,
    ]);

    const payload = {
      call: RPC_CALLS.eth_call,
      params: [
        {
          to: safeInfo.safeAddress,
          data: encodedIsValidSignatureCall,
        },
        'latest',
      ],
    };
    try {
      const response = await this.communicator.send<Methods.rpcCall, RPCPayload<[TransactionConfig, string]>, string>(
        Methods.rpcCall,
        payload,
      );

      return response.data.slice(0, 10).toLowerCase() === MAGIC_VALUE;
    } catch (err) {
      return false;
    }
  }

  private async check1271SignatureBytes(messageHash: string, signature = '0x'): Promise<boolean> {
    const safeInfo = await this.getInfo();
    const msgBytes = ethers.utils.arrayify(messageHash);

    const encodedIsValidSignatureCall = EIP_1271_BYTES_INTERFACE.encodeFunctionData('isValidSignature', [
      msgBytes,
      signature,
    ]);

    const payload = {
      call: RPC_CALLS.eth_call,
      params: [
        {
          to: safeInfo.safeAddress,
          data: encodedIsValidSignatureCall,
        },
        'latest',
      ],
    };

    try {
      const response = await this.communicator.send<Methods.rpcCall, RPCPayload<[TransactionConfig, string]>, string>(
        Methods.rpcCall,
        payload,
      );

      return response.data.slice(0, 10).toLowerCase() === MAGIC_VALUE_BYTES;
    } catch (err) {
      return false;
    }
  }

  async isMessageSigned(message: string, signature = '0x'): Promise<boolean> {
    const messageHash = calculateMessageHash(message);
    const messageHashSigned = await this.isMessageHashSigned(messageHash, signature);

    return messageHashSigned;
  }

  async isMessageHashSigned(messageHash: string, signature = '0x'): Promise<boolean> {
    const checks = [this.check1271Signature.bind(this), this.check1271SignatureBytes.bind(this)];

    for (const check of checks) {
      const isValid = await check(messageHash, signature);
      if (isValid) {
        return true;
      }
    }

    return false;
  }
}

export { Safe };
