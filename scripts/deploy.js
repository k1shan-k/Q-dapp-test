const hre = require("hardhat");

async function main() {
  const Notes = await hre.ethers.getContractFactory("Notes");
  const notes = await Notes.deploy();

  await notes.waitForDeployment();

  console.log(`Notes contract deployed to: ${await notes.getAddress()}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
