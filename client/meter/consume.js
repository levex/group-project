const blockchain = require("./blockchain");
const recorder = require("./recorder");
const buy = require("./buy");
const BigNumber = require("bignumber.js");

const PROCESS_INTERVAL = 10000;
const PREBUY_COEF = 2;
const consumeRequests = [];
let prebuyLimit = 0;
let preferRenewables = false;
let leftover = new BigNumber(0);

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function getRenewables() {
  return preferRenewables;
}

function setRenewables(r) {
  preferRenewables = r;
}

function getPreBuyLimit() {
  return prebuyLimit;
}

function setPreBuyLimit(x) {
  prebuyLimit = x;
}

async function consumeEnergyFromContract(contractAddress, amount) {
  if (!blockchain.isInited()) return Promise.reject({ msg: "Blockchain unsynced" });
  const contract = blockchain.makeEnergyContract(contractAddress);
  const price = await contract.unitPrice();
  const cost = price.mul(amount);
  blockchain.log({
    action: "consume",
    amount: amount,
    contract: contractAddress
  });
  return contract.consume(amount, {value: cost}).transactionPromise;
}

function consumeEnergy(amount) {
  if (!blockchain.isInited() || amount < 0) return false;

  consumeRequests.push(amount);
  return true;
}

function processConsumption() {
  if (consumeRequests.length === 0) {
    recorder.record_consumed_energy(0);
    return;
  }

  const amount = consumeRequests.reduce((acc, x) => acc.add(x), new BigNumber(0));
  consumeRequests.length = 0;
  if (amount > 0) {
    recorder.record_consumed_energy(amount);
    consumeEnergyFromChain(amount.add(leftover)).catch(console.log);
    leftover = new BigNumber(0);
  }
}

async function consumeEnergyFromChain(amount) {
  const amountBigNumber = new BigNumber(amount);
  let energyBalance = await blockchain.myEnergyBalance();
  if (energyBalance.lt(amountBigNumber)) {
    try {
      const buyAmount = (amountBigNumber.minus(energyBalance)).mul(PREBUY_COEF);
      await buy.autoBuy(buyAmount);

      let count = 0;
      while (energyBalance.lt(amountBigNumber)) {
        await blockchain.updateNow();
        energyBalance = await blockchain.myEnergyBalance();
        count++;
        if (count == 100) {
          return Promise.reject({ msg: "failed to autoBuy", value: amount });
        }
      }
    } catch(e) {
      return Promise.reject(e);
    }
  }

  const contracts = await blockchain.myBuyerContracts();
  let toConsume = amount;
  // cheapest first
  contracts.sort((a, b) => {
    if (preferRenewables) {
      if (a.renewable) {
        console.log(a.renewable);
        return -1;
      } else if (b.renewable) {
        console.log(b.renewable);
        return 1;
      }
    }

    return a.unitPrice - b.unitPrice;
  });

  let txs = [];
  for (const contract of contracts) {
    if (toConsume === 0) break;
    const deduction = Math.min(toConsume, contract.remainingAmount);
    txs.push({ address: contract.address, amount: deduction});
    toConsume -= deduction;
  }

  if (toConsume > 0) {
    return Promise.reject({ msg: "Unable to consume energy", value: toConsume });
  }

  const promises = txs.map((tx) => consumeEnergyFromContract(tx.address, tx.amount).catch(() => leftover = leftover.add(tx.amount)));
  return Promise.all(promises);
}

// Every PROCESS_INTERVAL record the consumption in the blockchain and update the contracts
setInterval(processConsumption, PROCESS_INTERVAL);

module.exports = {
  consumeEnergy,
  getPreBuyLimit,
  setPreBuyLimit,
  setRenewables,
  getRenewables,
};
