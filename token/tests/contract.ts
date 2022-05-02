import fs from "fs";

import Arweave from "arweave";
import { JWKInterface } from "arweave/node/lib/wallet";
import {
  ArWallet,
  Contract,
  HandlerBasedContract,
  SmartWeave,
} from "redstone-smartweave";
import path from "path";
import Transaction from "arweave/node/lib/transaction";

export class TokenState {
  ticker: string;
  name: string | null | unknown;
  decimals: number;
  totalSupply: bigint;
  owner: string;
  balances: {
    [key: string]: bigint;
  };
  allowances: {
    [key: string]: {
      [key: string]: bigint;
    };
  };
}

export class Balance {
  balance: bigint;
  target: string;
  ticker: string;

  constructor({
    balance,
    ticker,
    target,
  }: {
    balance: string;
    ticker: string;
    target: string;
  }) {
    this.balance = BigInt(balance);
    this.ticker = ticker;
    this.target = target;
  }
}

export class Allowance {
  allowance: bigint;
  ticker: string;
  owner: string;
  spender: string;

  constructor({
    allowance,
    ticker,
    owner,
    spender,
  }: {
    allowance: string;
    ticker: string;
    owner: string;
    spender: string;
  }) {
    this.allowance = BigInt(allowance);
    this.ticker = ticker;
    this.owner = owner;
    this.spender = spender;
  }
}

export interface TokenContract extends Contract<TokenState> {
  allowance(owner: string, spender: string): Promise<Allowance>;
  balanceOf(target: string): Promise<Balance>;
  currentState(): Promise<TokenState>;
  decimals(): Promise<number>;
  name(): Promise<string | null | unknown>;
  symbol(): Promise<string>;
  totalSupply(): Promise<bigint>;

  approve(spender: string, value: bigint): Promise<string | null>;
  transfer(to: string, value: bigint): Promise<string | null>;
  transferFrom(from: string, to: string, value: bigint): Promise<string | null>;
}

class TokenContractImpl
  extends HandlerBasedContract<TokenState>
  implements TokenContract
{
  async currentState() {
    return (await super.readState()).state as TokenState;
  }
  async name() {
    const interactionResult = await this.viewState({
      function: "name",
    });
    if (interactionResult.type !== "ok") {
      throw Error(interactionResult.errorMessage);
    }
    return interactionResult.result as string;
  }
  async symbol() {
    const interactionResult = await this.viewState({
      function: "symbol",
    });
    if (interactionResult.type !== "ok") {
      throw Error(interactionResult.errorMessage);
    }
    return interactionResult.result as string;
  }
  async decimals() {
    const interactionResult = await this.viewState({
      function: "decimals",
    });
    if (interactionResult.type !== "ok") {
      throw Error(interactionResult.errorMessage);
    }
    return interactionResult.result as number;
  }
  async totalSupply() {
    const interactionResult = await this.viewState({
      function: "totalSupply",
    });
    if (interactionResult.type !== "ok") {
      throw Error(interactionResult.errorMessage);
    }
    return BigInt(interactionResult.result as string);
  }
  async balanceOf(target) {
    const interactionResult = await this.viewState({
      function: "balanceOf",
      target,
    });
    if (interactionResult.type !== "ok") {
      throw Error(interactionResult.errorMessage);
    }
    return new Balance(
      interactionResult.result as {
        ticker: string;
        target: string;
        balance: string;
      }
    );
  }
  async transfer(to: string, value: bigint) {
    return await this.writeInteraction({
      function: "transfer",
      to,
      amount: value.toString(),
    });
  }
  async transferFrom(from: string, to: string, value: BigInt) {
    return await this.writeInteraction({
      function: "transferFrom",
      from,
      to,
      amount: value.toString(),
    });
  }
  async approve(spender: string, value: BigInt) {
    return await this.writeInteraction({
      function: "approve",
      spender,
      amount: value.toString(),
    });
  }
  async allowance(owner: string, spender: string) {
    const interactionResult = await this.viewState({
      function: "allowance",
      owner,
      spender,
    });
    if (interactionResult.type !== "ok") {
      throw Error(interactionResult.errorMessage);
    }
    return new Allowance(
      interactionResult.result as {
        allowance: string;
        ticker: string;
        owner: string;
        spender: string;
      }
    );
  }
}

export function deploy(
  smartweave: SmartWeave,
  owner: { address: string; wallet: ArWallet }
): Promise<[TokenState, string]> {
  let contractSrc = fs.readFileSync(
    path.join(__dirname, "../pkg/rust-contract_bg.wasm")
  );
  const stateFromFile: TokenState = JSON.parse(
    fs.readFileSync(path.join(__dirname, "./data/token.json"), "utf8")
  );

  let initialState = {
    ...stateFromFile,
    ...{
      owner: owner.address,
      balances: {
        [owner.address]: stateFromFile.totalSupply,
      },
    },
  };

  // deploying contract using the new SDK.
  return smartweave.createContract
    .deploy({
      wallet: owner.wallet,
      initState: JSON.stringify(initialState),
      src: contractSrc,
      wasmSrcCodeDir: path.join(__dirname, "../src"),
      wasmGlueCode: path.join(__dirname, "../pkg/rust-contract.js"),
    })
    .then((txId) => [initialState, txId]);
}

export async function connect(
  smartweave: SmartWeave,
  contractTxId: string,
  wallet: ArWallet
): Promise<TokenContract> {
  let contract = new TokenContractImpl(
    contractTxId,
    smartweave
  ).setEvaluationOptions({
    internalWrites: true,
  }) as TokenContract;

  return contract.connect(wallet) as TokenContract;
}