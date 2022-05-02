import ArLocal from "arlocal";
import Arweave from "arweave";
import { JWKInterface } from "arweave/node/lib/wallet";
import {
  getTag,
  LoggerFactory,
  SmartWeave,
  SmartWeaveNodeFactory,
  SmartWeaveTags,
} from "redstone-smartweave";
import { addFunds, mineBlock } from "../utils";

import {
  connect as connectTokenContract,
  deploy as deployTokenContract,
  TokenContract,
  TokenState,
} from "../../token/tests/contract";

import { connect, deploy, State, BundlersContract } from "./contract";

jest.setTimeout(30000);

describe("Bundlers Contract", () => {
  let accounts: { wallet: JWKInterface; address: string }[];

  let initialState: State;
  let initialTokenContractState: TokenState;

  let arweave: Arweave;
  let arlocal: ArLocal;
  let smartweave: SmartWeave;
  let connections: { token: TokenContract; bundlers: BundlersContract }[];

  let contractTxId: string;
  let tokenContractTxId: string;

  beforeAll(async () => {
    // note: each tests suit (i.e. file with tests that Jest is running concurrently
    // with another files has to have ArLocal set to a different port!)
    arlocal = new ArLocal(1820, false);
    await arlocal.start();

    arweave = Arweave.init({
      host: "localhost",
      port: 1820,
      protocol: "http",
    });

    LoggerFactory.INST.logLevel("error");
    LoggerFactory.INST.logLevel("debug", "WASM:Rust");
    LoggerFactory.INST.logLevel("debug", "WasmContractHandlerApi");

    smartweave = SmartWeaveNodeFactory.memCached(arweave);

    // Create accounts, fund them and get address
    accounts = await Promise.all(
      [0, 1].map(async (_) => {
        let wallet = await arweave.wallets.generate();
        await addFunds(arweave, wallet);
        let address = await arweave.wallets.jwkToAddress(wallet);
        return {
          wallet,
          address,
        };
      })
    );

    [initialTokenContractState, tokenContractTxId] = await deployTokenContract(
      smartweave,
      accounts[0]
    );
    [initialState, contractTxId] = await deploy(
      smartweave,
      tokenContractTxId,
      BigInt(10) ** BigInt(initialTokenContractState.decimals),
      accounts[0]
    );
    await mineBlock(arweave);

    console.log(`Contract TX ID: ${contractTxId}`);
    console.log(`Token Contract TX ID: ${tokenContractTxId}`);

    connections = await Promise.all(
      accounts.map(async (account) => {
        let [token, bundlers] = await Promise.all([
          connectTokenContract(smartweave, tokenContractTxId, account.wallet),
          connect(smartweave, contractTxId, account.wallet),
        ]);
        token.connect(account.wallet);
        bundlers.connect(account.wallet);
        return { token, bundlers };
      })
    );

    await connections[0].token.transfer(
      accounts[1].address,
      BigInt(200) * BigInt(10) ** BigInt(await connections[0].token.decimals())
    );

    await mineBlock(arweave);
  });

  afterAll(async () => {
    await arlocal.stop();
  });

  it("should properly deploy contract", async () => {
    const contractTx = await arweave.transactions.get(contractTxId);

    expect(contractTx).not.toBeNull();

    const contractSrcTx = await arweave.transactions.get(
      getTag(contractTx, SmartWeaveTags.CONTRACT_SRC_TX_ID)
    );
    expect(getTag(contractSrcTx, SmartWeaveTags.CONTENT_TYPE)).toEqual(
      "application/wasm"
    );
    expect(getTag(contractSrcTx, SmartWeaveTags.WASM_LANG)).toEqual("rust");
  });

  it("join should fail when allowance is not properly set", async () => {
    let balancesBefore = await Promise.all(
      [accounts[1].address, contractTxId].map((address) =>
        connections[0].token.balanceOf(address).then(({ balance }) => balance)
      )
    );

    await connections[1].bundlers.join();
    await mineBlock(arweave);

    let bundlers = await connections[1].bundlers.bundlers();
    expect(Object.keys(bundlers)).not.toContain(accounts[1].address);

    let bundlerBalanceBefore = BigInt(balancesBefore[0]);
    let bundlerBalanceAfter = BigInt(
      (await connections[0].token.balanceOf(accounts[1].address)).balance
    );
    expect(bundlerBalanceAfter).toEqual(bundlerBalanceBefore);

    let contractBalanceBefore = BigInt(balancesBefore[1]);
    let contractBalanceAfter = BigInt(
      (await connections[0].token.balanceOf(contractTxId)).balance
    );
    expect(contractBalanceAfter).toEqual(contractBalanceBefore);
  });

  it("join should succeed after approving allowance for the stake", async () => {
    let balancesBefore = await Promise.all(
      [accounts[1].address, contractTxId].map((address) =>
        connections[0].token.balanceOf(address).then(({ balance }) => balance)
      )
    );

    let stake = BigInt(await connections[1].bundlers.stake());

    await connections[1].token.approve(contractTxId, stake);
    await mineBlock(arweave);

    await connections[1].bundlers.join();
    await mineBlock(arweave);

    expect(await connections[0].bundlers.bundlers()).toEqual(
      expect.objectContaining({ [accounts[1].address]: null })
    );

    let bundlerBalanceBefore = BigInt(balancesBefore[0]);
    let bundlerBalanceAfter = BigInt(
      (await connections[0].token.balanceOf(accounts[1].address)).balance
    );
    expect(bundlerBalanceAfter).toEqual(bundlerBalanceBefore - stake);

    let contractBalanceBefore = BigInt(balancesBefore[1]);
    let contractBalanceAfter = BigInt(
      (await connections[0].token.balanceOf(contractTxId)).balance
    );
    expect(contractBalanceAfter).toEqual(contractBalanceBefore + stake);
  });

  it("leave should register bundler as leaving with block number", async () => {
    let balancesBefore = await Promise.all(
      [accounts[1].address, contractTxId].map((address) =>
        connections[0].token.balanceOf(address).then(({ balance }) => balance)
      )
    );

    let withdrawDelay = await connections[1].bundlers.withdrawDelay();

    await connections[1].bundlers.leave();
    await mineBlock(arweave);

    // FIXME: is there any better way to sync the state after mining?
    await connections[1].bundlers.currentState();

    let networkInfo = connections[1].bundlers.getNetworkInfo();
    expect(await connections[0].bundlers.bundlers()).toEqual(
      expect.objectContaining({
        // FIXME: why the bundlers map has strings as values instead of bigints
        [accounts[1].address]: (networkInfo.height + withdrawDelay).toString(),
      })
    );

    let bundlerBalanceBefore = BigInt(balancesBefore[0]);
    let bundlerBalanceAfter = BigInt(
      (await connections[0].token.balanceOf(accounts[1].address)).balance
    );
    expect(bundlerBalanceAfter).toEqual(bundlerBalanceBefore);

    let contractBalanceBefore = BigInt(balancesBefore[1]);
    let contractBalanceAfter = BigInt(
      (await connections[0].token.balanceOf(contractTxId)).balance
    );
    expect(contractBalanceAfter).toEqual(contractBalanceBefore);
  });

  it("withdraw should succeed after withdraw delay", async () => {
    // NOTE: pulling current state makes sure we are in-sync
    await connections[1].bundlers.currentState();

    let balancesBefore = await Promise.all(
      [accounts[1].address, contractTxId].map((address) =>
        connections[1].token.balanceOf(address).then(({ balance }) => balance)
      )
    );

    let stake = BigInt(await connections[1].bundlers.stake());

    // FIXME: why does this map return strings instead of bigints?
    let withdrawAllowedAt = BigInt(
      (await connections[1].bundlers.bundlers())[accounts[1].address]
    );

    let networkInfo = connections[1].bundlers.getNetworkInfo();

    let blocksNeeded = Math.max(
      0,
      Number(withdrawAllowedAt - BigInt(networkInfo.height))
    );

    // Mine enought blocks so that withdraw should become available
    for (let i = 0; i < blocksNeeded; ++i) {
      await mineBlock(arweave);
    }

    await connections[1].bundlers.withdraw();
    await mineBlock(arweave);

    let bundlers = await connections[0].bundlers.bundlers();
    expect(Object.keys(bundlers)).not.toContain(accounts[1].address);

    let contractBalanceBefore = BigInt(balancesBefore[1]);
    let contractBalanceAfter = BigInt(
      (await connections[0].token.balanceOf(contractTxId)).balance
    );
    expect(contractBalanceAfter).toEqual(contractBalanceBefore - stake);

    let bundlerBalanceBefore = BigInt(balancesBefore[0]);
    let bundlerBalanceAfter = BigInt(
      (await connections[0].token.balanceOf(accounts[1].address)).balance
    );
    expect(bundlerBalanceAfter).toEqual(bundlerBalanceBefore + stake);
  });
});