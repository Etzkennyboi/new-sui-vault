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
      content = content.replace(/transactionBlock:/g, 'transaction:');
      content = content.replace(/transaction: txb/g, 'transaction: tx');
      content = content.replace(/txb\./g, 'tx.');
      content = content.replace(/txb =/g, 'tx =');
      content = content.replace(/txb,/g, 'tx,');
      content = content.replace(/\[txb\]/g, '[tx]');
      fs.writeFileSync(fullPath, content);
      console.log('Migrated syntax:', fullPath);
    }
  }
}

processDir(path.join(__dirname, '../sdk'));
processDir(path.join(__dirname, '../agent'));
processDir(path.join(__dirname, '../scripts'));
