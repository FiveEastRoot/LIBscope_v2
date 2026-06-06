const fs = require('fs');
const path = require('path');
const axios = require('axios');

const KEY = '556654646967657535346574744646';
const CSV_PATH = path.resolve(__dirname, '2_population_and_senior.csv');
const OUTPUT_PATH = path.resolve(__dirname, 'dong_code_mapping.json');

function parseCSVLine(line) {
  const values = [];
  let currentVal = '';
  let inQuotes = false;
  for (let j = 0; j < line.length; j++) {
    const char = line[j];
    if (char === '"') inQuotes = !inQuotes;
    else if (char === ',' && !inQuotes) {
      values.push(currentVal.trim().replace(/^"|"$/g, ''));
      currentVal = '';
    } else currentVal += char;
  }
  values.push(currentVal.trim().replace(/^"|"$/g, ''));
  return values;
}

async function main() {
  // 1. API에서 행정동 코드 목록
  console.log('Fetching SPOP_LOCAL_RESD_DONG...');
  const res = await axios.get(
    `http://openapi.seoul.go.kr:8088/${KEY}/json/SPOP_LOCAL_RESD_DONG/1/1000/20260601/00/`,
    { timeout: 15000 }
  );
  const apiRows = res.data.SPOP_LOCAL_RESD_DONG.row;
  const apiCodes = [...new Set(apiRows.map(r => r.ADSTRD_CODE_SE))].sort();
  console.log(`API codes: ${apiCodes.length}`);

  // 2. CSV에서 행정동 목록
  let csvContent = fs.readFileSync(CSV_PATH, 'utf-8');
  if (csvContent.startsWith('\uFEFF')) csvContent = csvContent.slice(1);
  const lines = csvContent.split(/\r?\n/).filter(l => l.trim());
  
  const csvDongs = [];
  for (let i = 1; i < lines.length; i++) {
    const vals = parseCSVLine(lines[i]);
    if (vals[0] && vals[1]) csvDongs.push({ gu: vals[0], dong: vals[1] });
  }
  console.log(`CSV dongs: ${csvDongs.length}`);

  // 3. 시군구코드 → 구 이름 매핑
  const guCodeMap = {
    '11110': '종로구', '11140': '중구', '11170': '용산구', '11200': '성동구',
    '11215': '광진구', '11230': '동대문구', '11260': '중랑구', '11290': '성북구',
    '11305': '강북구', '11320': '도봉구', '11350': '노원구', '11380': '은평구',
    '11410': '서대문구', '11440': '마포구', '11470': '양천구', '11500': '강서구',
    '11530': '구로구', '11545': '금천구', '11560': '영등포구', '11590': '동작구',
    '11620': '관악구', '11650': '서초구', '11680': '강남구', '11710': '송파구',
    '11740': '강동구'
  };

  // API 코드를 구별로 그루핑
  const apiByGu = {};
  apiCodes.forEach(code => {
    const guCode = code.substring(0, 5);
    const guName = guCodeMap[guCode] || '알수없음';
    if (!apiByGu[guName]) apiByGu[guName] = [];
    apiByGu[guName].push(code);
  });

  // CSV 행정동도 구별로 그루핑
  const csvByGu = {};
  csvDongs.forEach(d => {
    if (!csvByGu[d.gu]) csvByGu[d.gu] = [];
    csvByGu[d.gu].push(d.dong);
  });

  // 4. 구별로 순서 매핑
  const codeToName = {};
  const nameToCode = {};
  let matchedCount = 0;

  Object.keys(guCodeMap).forEach(guCode => {
    const guName = guCodeMap[guCode];
    const codesInGu = (apiByGu[guName] || []).sort();
    const dongsInGu = csvByGu[guName] || [];

    console.log(`[${guName}] API: ${codesInGu.length}, CSV: ${dongsInGu.length}`);

    const minLen = Math.min(codesInGu.length, dongsInGu.length);
    for (let i = 0; i < minLen; i++) {
      codeToName[codesInGu[i]] = { gu: guName, dong: dongsInGu[i] };
      nameToCode[`${guName} ${dongsInGu[i]}`] = codesInGu[i];
      matchedCount++;
    }

    if (codesInGu.length !== dongsInGu.length) {
      console.log(`  ⚠ MISMATCH: ${codesInGu.length} vs ${dongsInGu.length}`);
    }
  });

  console.log(`\n=== MATCHED: ${matchedCount} ===`);

  fs.writeFileSync(OUTPUT_PATH, JSON.stringify({ codeToName, nameToCode }, null, 2), 'utf-8');
  console.log(`Saved to ${OUTPUT_PATH}`);
}

main().catch(err => console.error('Error:', err.message));
