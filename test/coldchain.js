const { expectEvent, BN } = require("@openzeppelin/test-helpers");
const HDWalletProvider = require("@truffle/hdwallet-provider");
const Web3 = require("web3");

const ColdChain = artifacts.require("ColdChain");

contract("ColdChain", (accounts) => {
  before(async () => {
    this.coldChainInstance = {};
    this.owner = accounts[0];

    this.VACCINE_BRANDS = {
      Pfizer: "Pfizer-BioNTech",
      Moderna: "Moderna",
      Janssen: "Johnson & Johnson's Janssen",
      Sputnik: "Sputnik V",
    };

    // enums
    this.ModeEnums = {
      ISSUER: { val: "ISSUER", pos: 0 },
      PROVER: { val: "PROVER", pos: 1 },
      VERIFIER: { val: "VERIFIER", pos: 2 },
    };

    this.StatusEnums = {
      MANUFACTURED: { val: "MANUFACTURED", pos: 0 },
      DELIVERING_INTERNATIONAL: { val: "DELIVERING_INTERNATIONAL", pos: 1 },
      STORED: { val: "STORED", pos: 2 },
      DELIVERING_LOCAL: { val: "DELIVERING_LOCAL", pos: 3 },
      DELIVERED: { val: "DELIVERED", pos: 4 },
    };

    this.defaultEntities = {
      manufacturerA: { id: accounts[1], mode: this.ModeEnums.PROVER.val },
      manufacturerB: { id: accounts[2], mode: this.ModeEnums.PROVER.val },
      inspector: { id: accounts[3], mode: this.ModeEnums.ISSUER.val },
      distributorGlobal: { id: accounts[4], mode: this.ModeEnums.VERIFIER.val },
      distributorLocal: { id: accounts[5], mode: this.ModeEnums.VERIFIER.val },
      immunizer: { id: accounts[6], mode: this.ModeEnums.ISSUER.val },
      traveler: { id: accounts[7], mode: this.ModeEnums.PROVER.val },
      borderAgent: { id: accounts[7], mode: this.ModeEnums.VERIFIER.val },
    };

    this.defaultVaccineBatches = {
      0: {
        brand: this.VACCINE_BRANDS.Pfizer,
        manufacturer: this.defaultEntities.manufacturerA.id,
      },
      1: {
        brand: this.VACCINE_BRANDS.Moderna,
        manufacturer: this.defaultEntities.manufacturerA.id,
      },
      2: {
        brand: this.VACCINE_BRANDS.Janssen,
        manufacturer: this.defaultEntities.manufacturerB.id,
      },
      3: {
        brand: this.VACCINE_BRANDS.Sputnik,
        manufacturer: this.defaultEntities.manufacturerB.id,
      },
      4: {
        brand: this.VACCINE_BRANDS.Pfizer,
        manufacturer: this.defaultEntities.manufacturerB.id,
      },
      5: {
        brand: this.VACCINE_BRANDS.Pfizer,
        manufacturer: this.defaultEntities.manufacturerA.id,
      },
      6: {
        brand: this.VACCINE_BRANDS.Moderna,
        manufacturer: this.defaultEntities.manufacturerA.id,
      },
      7: {
        brand: this.VACCINE_BRANDS.Moderna,
        manufacturer: this.defaultEntities.manufacturerB.id,
      },
      8: {
        brand: this.VACCINE_BRANDS.Sputnik,
        manufacturer: this.defaultEntities.manufacturerB.id,
      },
      9: {
        brand: this.VACCINE_BRANDS.Janssen,
        manufacturer: this.defaultEntities.manufacturerA.id,
      },
    };

    this.coldChainInstance = await ColdChain.deployed();
  });

  it("should add entities successfully", async () => {
    for (const entity in this.defaultEntities) {
      const { id, mode } = this.defaultEntities[entity];
      const result = await this.coldChainInstance.addEntity(id, mode, {
        from: this.owner,
      });

      expectEvent(result.receipt, "AddEntity", {
        entityId: id,
        entityMode: mode,
      });
      const retreivedEntity = await this.coldChainInstance.entities.call(id);
      assert.equal(id, retreivedEntity.id, "entity id is not correct");
      assert.equal(
        this.ModeEnums[mode].pos,
        retreivedEntity.mode.toString(),
        "mode is not correct"
      );
    }
  });
  it("should add vaccine batches successfully", async () => {
    for (let i = 0; i < Object.keys(this.defaultVaccineBatches).length; i++) {
      const { brand, manufacturer } = this.defaultVaccineBatches[i];
      const result = await this.coldChainInstance.addVaccineBatch(
        brand,
        manufacturer,
        {
          from: this.owner,
        }
      );

      expectEvent(result.receipt, "AddVaccineBatch", {
        vaccineBatchId: String(i),
        manufacturer: manufacturer,
      });
      const retreivedVaccineBatch =
        await this.coldChainInstance.vaccineBatches.call(i);
      assert.equal(
        i,
        retreivedVaccineBatch.id,
        "vaccine batch id is not correct"
      );
      assert.equal(
        brand,
        retreivedVaccineBatch.brand,
        "vaccine batch brand is not correct"
      );
      assert.equal(
        manufacturer,
        retreivedVaccineBatch.manufacturer,
        "vaccine batch manufacturer is not correct"
      );
      assert.equal(
        undefined,
        retreivedVaccineBatch.certificateIds,
        "vaccine batch certificate is not correct"
      );
    }
  });

  it("should sign a message and store as a certificate from the issuer to the prover", async () => {
    const mnemonic =
      "candy maple cake sugar pudding cream honey rich smooth crumble sweet treat";
    const providerOrUrl = "http://127.0.0.1:8545";
    const provider = new HDWalletProvider({ mnemonic, providerOrUrl });
    this.web3 = new Web3(provider);

    const { inspector, manufacturerA } = this.defaultEntities;
    const vaccineBatchId = 0;
    const message = `Inspector (${inspector.id}) has certifies vaccine batch #${vaccineBatchId} is manufactured by ${manufacturerA.id}`;
    const signature = await this.web3.eth.sign(
      this.web3.utils.keccak256(message),
      inspector.id
    );

    const result = await this.coldChainInstance.issueCertificate(
      inspector.id,
      manufacturerA.id,
      this.StatusEnums.MANUFACTURED.val,
      signature,
      {
        from: this.owner,
      }
    );

    expectEvent(result.receipt, "IssueCertificate", {
      issuer: inspector.id,
      prover: manufacturerA.id,
      certificatedIds: new BN(0),
    });

    const retrievedCertificate = await this.coldChainInstance.certificates.call(
      0
    );
    assert.equal(retrievedCertificate.id, 0);
    assert.equal(retrievedCertificate.issuer["id"], inspector.id);
    assert.equal(retrievedCertificate.prover["id"], manufacturerA.id);
    assert.equal(retrievedCertificate.signature, signature);
    assert.equal(
      retrievedCertificate.status,
      this.StatusEnums.MANUFACTURED.pos.toString()
    );
  });

  it("should verify that certificate signature matches the issuer", async () => {
    const { inspector, manufacturerA } = this.defaultEntities;
    const vaccineBatchId = 0;
    const message = `Inspector (${inspector.id}) has certifies vaccine batch #${vaccineBatchId} is manufactured by ${manufacturerA.id}`;

    const certificate = await this.coldChainInstance.certificates.call(0);

    const signerMatches = await this.coldChainInstance.isMatchingSignature(
      this.web3.utils.keccak256(message),
      certificate.id,
      inspector.id,
      { from: this.owner }
    );
    assert.equal(signerMatches, true);
  });
});
