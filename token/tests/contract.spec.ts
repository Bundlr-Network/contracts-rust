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

import { deploy, connect, TokenState, TokenContract } from "./contract";

jest.setTimeout(30000);

describe("Test Token", () => {
  let wallets: { wallet: JWKInterface; address: string }[];

  let initialState: TokenState;

  let arweave: Arweave;
  let arlocal: ArLocal;
  let smartweave: SmartWeave;
  let connections: TokenContract[];

  let contractTxId: string;

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

    // Create wallets, fund them and get address
    wallets = await Promise.all(
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

    [initialState, contractTxId] = await deploy(smartweave, wallets[0]);

    console.log(`TokenContract TX ID: ${contractTxId}`);

    connections = await Promise.all(
      wallets.map(({ wallet }) => {
        return connect(smartweave, contractTxId, wallet);
      })
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

  it("should get token name", async () => {
    expect(await connections[0].currentState()).toEqual(initialState);
    expect(await connections[0].name()).toEqual("Test Token");
  });

  it("should get token symbol", async () => {
    expect(await connections[0].currentState()).toEqual(initialState);

    expect(await connections[0].symbol()).toEqual("TST");
  });

  it("should get token decimals", async () => {
    expect(await connections[0].currentState()).toEqual(initialState);

    expect(await connections[0].decimals()).toEqual(10);
  });

  it("should get token total supply", async () => {
    expect(await connections[0].currentState()).toEqual(initialState);

    expect(await connections[0].totalSupply()).toEqual(
      BigInt("10000000000000000000")
    );
  });

  it("should get token balance for an address", async () => {
    expect(await connections[0].currentState()).toEqual(initialState);

    expect(
      (await connections[0].balanceOf(wallets[0].address)).balance
    ).toEqual(BigInt("10000000000000000000"));
  });

  it("should properly transfer tokens", async () => {
    // FIXME: why reading balance from balances returns a string?
    let balanceBefore = BigInt(
      (await connections[0].currentState()).balances[wallets[0].address]
    );
    let amount = BigInt("555");

    let balanceAfter = balanceBefore - amount;

    await connections[0].transfer(
      "uhE-QeYS8i4pmUtnxQyHD7dzXFNaJ9oMK-IM-QPNY6M",
      amount
    );
    await mineBlock(arweave);

    expect(
      BigInt((await connections[0].currentState()).balances[wallets[0].address])
    ).toEqual(balanceAfter);
    expect(
      BigInt(
        (await connections[0].currentState()).balances[
          "uhE-QeYS8i4pmUtnxQyHD7dzXFNaJ9oMK-IM-QPNY6M"
        ]
      )
    ).toEqual(amount);
  });

  it("should properly transfer tokens using allowance", async () => {
    let to_address = "uhE-QeYS8i4pmUtnxQyHD7dzXFNaJ9oMK-IM-QPNY6M";

    // FIXME: why reading balance from balances returns a string?
    let balancesBefore = [
      (await connections[0].balanceOf(wallets[0].address)).balance,
      (await connections[0].balanceOf(wallets[1].address)).balance,
      (await connections[0].balanceOf(to_address)).balance,
    ];
    let allowance = BigInt("555");
    let transferAmount = BigInt("111");

    let expectedBalancesAfter = [
      balancesBefore[0] - transferAmount,
      balancesBefore[1],
      balancesBefore[2] + transferAmount,
    ];

    let expectedAllowanceAfter = BigInt("555") - BigInt("111");

    await connections[0].approve(wallets[1].address, allowance);
    await mineBlock(arweave);

    expect(
      (await connections[0].allowance(wallets[0].address, wallets[1].address))
        .allowance
    ).toEqual(allowance);

    await connections[1].transferFrom(
      wallets[0].address,
      to_address,
      transferAmount
    );
    await mineBlock(arweave);

    expect(
      (await connections[0].balanceOf(wallets[0].address)).balance
    ).toEqual(expectedBalancesAfter[0]);

    expect((await connections[0].balanceOf(to_address)).balance).toEqual(
      expectedBalancesAfter[2]
    );

    expect(
      (await connections[1].allowance(wallets[0].address, wallets[1].address))
        .allowance
    ).toEqual(expectedAllowanceAfter);
  });

  it("transferFrom should fail when allowance is not set", async () => {
    let to_address = "uhE-QeYS8i4pmUtnxQyHD7dzXFNaJ9oMK-IM-QPNY6M";

    // Make sure earlier tests are not affecting here and set the allowance to zero
    await connections[0].approve(wallets[1].address, BigInt(0));
    await mineBlock(arweave);

    expect(
      (await connections[1].allowance(wallets[0].address, wallets[1].address))
        .allowance
    ).toEqual(BigInt(0));

    // FIXME: why reading balance from balances returns a string?
    let balancesBefore = [
      (await connections[0].balanceOf(wallets[0].address)).balance,
      (await connections[0].balanceOf(wallets[1].address)).balance,
      (await connections[0].balanceOf(to_address)).balance,
    ];

    await connections[1].transferFrom(
      wallets[0].address,
      to_address,
      BigInt("555")
    );
    await mineBlock(arweave);

    expect(
      (await connections[0].balanceOf(wallets[0].address)).balance
    ).toEqual(balancesBefore[0]);

    expect((await connections[0].balanceOf(to_address)).balance).toEqual(
      balancesBefore[2]
    );
  });
});