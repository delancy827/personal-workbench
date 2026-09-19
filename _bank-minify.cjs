const fs = require('fs');
const source = 'published-quiz-banks\\中国石化思想素质新清洗库_20260919.json';
const target = 'quiz_bank.json';
const document = JSON.parse(fs.readFileSync(source, 'utf8'));
fs.writeFileSync(target, JSON.stringify(document), 'utf8');
console.log('minified: ' + fs.statSync(target).size + ' bytes, questions=' + document.questions.length + ', bank_id=' + document.bank.bank_id);
