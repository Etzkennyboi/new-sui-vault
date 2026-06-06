const fs = require('fs');
const path = require('path');

function processDir(dir) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    if (fs.statSync(fullPath).isDirectory()) {
      processDir(fullPath);
    } else if (fullPath.endsWith('.ts')) {
      let content = fs.readFileSync(fullPath, 'utf8');
      content = content.replace(/@mysten\/sui\.js\/client/g, '@mysten/sui/client');
      content = content.replace(/@mysten\/sui\.js\/transactions/g, '@mysten/sui/transactions');
      content = content.replace(/@mysten\/sui\.js\/cryptography/g, '@mysten/sui/cryptography');
      content = content.replace(/@mysten\/sui\.js\/keypairs\/ed25519/g, '@mysten/sui/keypairs/ed25519');
      content = content.replace(/TransactionBlock/g, 'Transaction');
      content = content.replace(/txb\./g, 'tx.');
      content = content.replace(/txb =/g, 'tx =');
      fs.writeFileSync(fullPath, content);
      console.log('Migrated:', fullPath);
    }
  }
}

processDir(path.join(__dirname, '../sdk'));
processDir(path.join(__dirname, '../agent'));
processDir(path.join(__dirname, '../scripts'));
