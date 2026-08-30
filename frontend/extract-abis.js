import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const outDir = path.resolve(__dirname, '../out');
const abisDir = path.resolve(__dirname, './src/lib/web3');

if (!fs.existsSync(abisDir)) {
    fs.mkdirSync(abisDir, { recursive: true });
}

const contractsToExtract = [
    'MRLVToken.sol/MRLVToken.json',
    'LoyaltyManager.sol/LoyaltyManager.json',
    'RewardVault.sol/RewardVault.json',
    'MRLVHook.sol/MRLVHook.json',
    'MEVScoutLeague.sol/MEVScoutLeague.json',
    'LoyaltyNFT.sol/LoyaltyNFT.json',
    'MEVDetector.sol/MEVDetector.json',
    'DynamicFeeManager.sol/DynamicFeeManager.json',
    'AnalyticsEmitter.sol/AnalyticsEmitter.json',
    'ScoutRoster.sol/ScoutRoster.json',
    'ScoutPointsOracle.sol/ScoutPointsOracle.json',
    'MockERC20.sol/MockERC20.json'
];

let exportCode = '';

for (const contract of contractsToExtract) {
    const fullPath = path.join(outDir, contract);
    if (fs.existsSync(fullPath)) {
        const data = JSON.parse(fs.readFileSync(fullPath, 'utf8'));
        const name = contract.split('/')[0].replace('.sol', '');
        exportCode += `export const ${name}ABI = ${JSON.stringify(data.abi, null, 2)} as const;\n\n`;
        console.log(`Extracted ABI for ${name}`);
    } else {
        console.log(`File not found: ${fullPath}`);
    }
}

fs.writeFileSync(path.join(abisDir, 'abis.ts'), exportCode);
console.log('Successfully wrote abis.ts');
