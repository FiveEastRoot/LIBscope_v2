const fs = require('fs');
const path = require('path');

const files = [
  'district_age_gender_population.csv',
  'district_data_combined.csv',
  'library_dong_mapping.json',
  'dong_coordinates.json',
  'dong_code_mapping.json',
  '2_population_and_senior.csv',
  '3_gender.csv',
  '5_number_of_recipients.csv'
];

const rootDir = process.cwd();
const dataDir = path.resolve(rootDir, 'functions/_data');
const outputPath = path.resolve(rootDir, 'functions/_shared/static-data.cjs');

fs.mkdirSync(dataDir, { recursive: true });

const data = {};
for (const file of files) {
  const sourcePath = path.resolve(rootDir, file);
  const bundledPath = path.resolve(dataDir, file);
  if (!fs.existsSync(sourcePath)) {
    throw new Error(`Missing source data file: ${file}`);
  }
  fs.copyFileSync(sourcePath, bundledPath);
  data[file] = fs.readFileSync(bundledPath, 'utf-8');
}

const output = `// Generated from functions/_data. Do not edit by hand.\nmodule.exports = ${JSON.stringify(data)};\n`;
fs.writeFileSync(outputPath, output, 'utf-8');

console.log(`Generated ${files.length} static function data files (${Buffer.byteLength(output)} bytes).`);
