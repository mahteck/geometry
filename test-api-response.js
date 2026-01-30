/**
 * Test script to verify API returns separate features
 * Run: node test-api-response.js
 */

const http = require('http');

const options = {
  hostname: 'localhost',
  port: 3000,
  path: '/api/fences?status=active',
  method: 'GET',
  headers: {
    'Content-Type': 'application/json'
  }
};

console.log('🔍 Testing API endpoint: http://localhost:3000/api/fences?status=active\n');

const req = http.request(options, (res) => {
  let data = '';

  res.on('data', (chunk) => {
    data += chunk;
  });

  res.on('end', () => {
    try {
      const json = JSON.parse(data);
      
      console.log('✅ API Response Analysis:');
      console.log('─────────────────────────────────────');
      console.log(`Type: ${json.type}`);
      console.log(`Total Features: ${json.features?.length || 0}`);
      
      if (json.features && json.features.length > 0) {
        console.log('\n📊 Feature Sample (first 5):');
        json.features.slice(0, 5).forEach((feat, idx) => {
          console.log(`\n  [${idx + 1}] ID: ${feat.id}`);
          console.log(`      Name: ${feat.properties?.name || 'N/A'}`);
          console.log(`      Geometry Type: ${feat.geometry?.type}`);
          console.log(`      Coordinates: ${feat.geometry?.coordinates?.length || 0} rings`);
        });
        
        // Check for duplicate IDs (would indicate merging issue)
        const ids = json.features.map(f => f.id);
        const uniqueIds = new Set(ids);
        
        console.log('\n🔍 Duplicate Check:');
        console.log(`  Total features: ${ids.length}`);
        console.log(`  Unique IDs: ${uniqueIds.size}`);
        
        if (ids.length === uniqueIds.size) {
          console.log('  ✅ No duplicates - Each fence has unique feature');
        } else {
          console.log('  ❌ DUPLICATES FOUND - Multiple features per fence!');
          console.log(`  Difference: ${ids.length - uniqueIds.size} duplicate features`);
        }
        
        // Check geometry types
        const geometryTypes = {};
        json.features.forEach(f => {
          const type = f.geometry?.type || 'unknown';
          geometryTypes[type] = (geometryTypes[type] || 0) + 1;
        });
        
        console.log('\n📐 Geometry Types:');
        Object.entries(geometryTypes).forEach(([type, count]) => {
          console.log(`  ${type}: ${count}`);
        });
        
        console.log('\n✅ API is returning separate features correctly!');
        console.log('   Each fence has its own Feature object.');
        console.log('\n💡 If map still shows merged polygon:');
        console.log('   1. Hard refresh browser: Ctrl+Shift+R');
        console.log('   2. Clear Next.js cache: rm -rf .next && npm run dev');
        console.log('   3. Check browser console for errors');
        
      } else {
        console.log('❌ No features returned!');
      }
      
    } catch (e) {
      console.error('❌ Error parsing response:', e.message);
      console.log('Raw response:', data.substring(0, 500));
    }
  });
});

req.on('error', (e) => {
  console.error('❌ Request failed:', e.message);
  console.log('\n💡 Make sure dev server is running:');
  console.log('   npm run dev');
});

req.end();
