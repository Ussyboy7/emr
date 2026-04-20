#!/usr/bin/env node

/**
 * URIT 5160 Integration Test Script
 *
 * This script sends sample HL7 messages to test the middleware integration
 * with the URIT 5160 hematology analyzer.
 */

const net = require('net');

const MIDDLEWARE_HOST = process.env.MIDDLEWARE_HOST || 'localhost';
const MIDDLEWARE_PORT = process.env.MIDDLEWARE_PORT || 2575;

// Sample HL7 CBC message from URIT 5160
const SAMPLE_CBC_MESSAGE = `MSH|^~\\&|URIT5160|LAB|EMR|HOSPITAL|${new Date().toISOString().replace(/[:-]/g, '').substring(0, 14)}||ORU^R01|MSG${Date.now()}|P|2.5\r
PID|1||PAT001||Doe^John||19800101|M\r
PV1|1|O|LAB||||Dr.Smith|||||||||PAT001\r
OBR|1||CBC${Date.now()}|1500^Complete Blood Count||${new Date().toISOString().replace(/[:-]/g, '').substring(0, 14)}|||||||${new Date().toISOString().replace(/[:-]/g, '').substring(0, 14)}\r
OBX|1|NM|6690-2^WBC^LN||6.5|10^9/L|4.0-11.0||||F\r
OBX|2|NM|789-8^RBC^LN||4.8|10^12/L|4.2-5.4||||F\r
OBX|3|NM|718-7^HGB^LN||14.2|g/dL|12.0-16.0||||F\r
OBX|4|NM|4544-3^HCT^LN||42.1|%|36.0-46.0||||F\r
OBX|5|NM|787-2^MCV^LN||87.7|fL|80.0-100.0||||F\r
OBX|6|NM|785-6^MCH^LN||29.6|pg|27.0-32.0||||F\r
OBX|7|NM|786-4^MCHC^LN||33.7|g/dL|32.0-36.0||||F\r
OBX|8|NM|21000-5^RDW^LN||12.8|%|11.5-14.5||||F\r
OBX|9|NM|777-3^PLT^LN||285|10^9/L|150-450||||F\r
OBX|10|NM|32209-9^Neutrophils^LN||65.2|%|50.0-70.0||||F\r
OBX|11|NM|731-0^Lymphocytes^LN||28.1|%|20.0-40.0||||F\r
OBX|12|NM|742-7^Monocytes^LN||4.8|%|2.0-8.0||||F\r
OBX|13|NM|711-2^Eosinophils^LN||1.6|%|1.0-4.0||||F\r
OBX|14|NM|704-7^Basophils^LN||0.3|%|0.0-1.0||||F\r`;

// Sample message with abnormal results
const SAMPLE_ABNORMAL_MESSAGE = `MSH|^~\\&|URIT5160|LAB|EMR|HOSPITAL|${new Date().toISOString().replace(/[:-]/g, '').substring(0, 14)}||ORU^R01|MSG${Date.now()}|P|2.5\r
PID|1||PAT002||Smith^Jane||19900101|F\r
PV1|1|O|LAB||||Dr.Jones|||||||||PAT002\r
OBR|1||CBC${Date.now()}|1500^Complete Blood Count||${new Date().toISOString().replace(/[:-]/g, '').substring(0, 14)}|||||||${new Date().toISOString().replace(/[:-]/g, '').substring(0, 14)}\r
OBX|1|NM|6690-2^WBC^LN||15.2|10^9/L|4.0-11.0|H|||F\r
OBX|2|NM|789-8^RBC^LN||3.8|10^12/L|4.2-5.4|L|||F\r
OBX|3|NM|718-7^HGB^LN||9.8|g/dL|12.0-16.0|L|||F\r
OBX|4|NM|4544-3^HCT^LN||29.1|%|36.0-46.0|L|||F\r
OBX|5|NM|777-3^PLT^LN||95|10^9/L|150-450|L|||F\r`;

// Sample message with critical values
const SAMPLE_CRITICAL_MESSAGE = `MSH|^~\\&|URIT5160|LAB|EMR|HOSPITAL|${new Date().toISOString().replace(/[:-]/g, '').substring(0, 14)}||ORU^R01|MSG${Date.now()}|P|2.5\r
PID|1||PAT003||Critical^Patient||19750101|M\r
PV1|1|E|ER||||Dr.Emergency|||||||||PAT003\r
OBR|1||CBC${Date.now()}|1500^Complete Blood Count||${new Date().toISOString().replace(/[:-]/g, '').substring(0, 14)}|||||||${new Date().toISOString().replace(/[:-]/g, '').substring(0, 14)}\r
OBX|1|NM|6690-2^WBC^LN||1.2|10^9/L|4.0-11.0|LL|||F\r
OBX|2|NM|718-7^HGB^LN||6.1|g/dL|12.0-16.0|LL|||F\r
OBX|3|NM|777-3^PLT^LN||15|10^9/L|150-450|LL|||F\r`;

function sendMessage(message, description) {
  return new Promise((resolve, reject) => {
    console.log(`\n📤 Sending ${description}...`);

    const client = new net.Socket();

    client.connect(MIDDLEWARE_PORT, MIDDLEWARE_HOST, () => {
      console.log(`✅ Connected to middleware at ${MIDDLEWARE_HOST}:${MIDDLEWARE_PORT}`);
      client.write(message);
    });

    client.on('data', (data) => {
      const response = data.toString();
      console.log(`📥 Received ACK: ${response.trim()}`);

      if (response.includes('MSA|AA|')) {
        console.log(`✅ Message accepted by middleware`);
      } else if (response.includes('MSA|AE|')) {
        console.log(`❌ Message rejected by middleware`);
      }

      client.end();
      resolve();
    });

    client.on('error', (error) => {
      console.error(`❌ Connection error: ${error.message}`);
      reject(error);
    });

    client.on('close', () => {
      console.log(`🔌 Connection closed`);
    });

    // Timeout after 10 seconds
    setTimeout(() => {
      client.destroy();
      reject(new Error('Connection timeout'));
    }, 10000);
  });
}

async function runTests() {
  console.log('🧪 URIT 5160 Integration Test Script');
  console.log('=====================================');
  console.log(`Target: ${MIDDLEWARE_HOST}:${MIDDLEWARE_PORT}`);

  try {
    // Test 1: Normal CBC results
    console.log('\n🩸 Test 1: Normal CBC Results');
    await sendMessage(SAMPLE_CBC_MESSAGE, 'Normal CBC Results');

    // Wait 2 seconds between tests
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Test 2: Abnormal results
    console.log('\n⚠️  Test 2: Abnormal Results');
    await sendMessage(SAMPLE_ABNORMAL_MESSAGE, 'Abnormal CBC Results');

    // Wait 2 seconds between tests
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Test 3: Critical values
    console.log('\n🚨 Test 3: Critical Values');
    await sendMessage(SAMPLE_CRITICAL_MESSAGE, 'Critical CBC Results');

    console.log('\n✅ All tests completed!');
    console.log('\n📋 Next steps:');
    console.log('1. Check middleware logs for message processing');
    console.log('2. Verify lab orders created in EMR');
    console.log('3. Check result display in laboratory module');
    console.log('4. Test critical value alerts');

  } catch (error) {
    console.error(`\n❌ Test failed: ${error.message}`);
    process.exit(1);
  }
}

// Command line interface
const args = process.argv.slice(2);

if (args.includes('--help') || args.includes('-h')) {
  console.log(`
URIT 5160 Integration Test Script

Usage:
  node test-integration.js [options]

Options:
  --normal     Send normal CBC results only
  --abnormal   Send abnormal results only
  --critical   Send critical values only
  --all        Send all test messages (default)
  --host HOST  Middleware host (default: localhost)
  --port PORT  Middleware port (default: 2575)

Examples:
  node test-integration.js --all
  node test-integration.js --normal --host 192.168.1.100
  node test-integration.js --critical --port 2576
`);
  process.exit(0);
}

if (args.includes('--host')) {
  const hostIndex = args.indexOf('--host');
  if (hostIndex + 1 < args.length) {
    process.env.MIDDLEWARE_HOST = args[hostIndex + 1];
  }
}

if (args.includes('--port')) {
  const portIndex = args.indexOf('--port');
  if (portIndex + 1 < args.length) {
    process.env.MIDDLEWARE_PORT = args[portIndex + 1];
  }
}

async function runSpecificTest() {
  try {
    if (args.includes('--normal')) {
      await sendMessage(SAMPLE_CBC_MESSAGE, 'Normal CBC Results');
    } else if (args.includes('--abnormal')) {
      await sendMessage(SAMPLE_ABNORMAL_MESSAGE, 'Abnormal CBC Results');
    } else if (args.includes('--critical')) {
      await sendMessage(SAMPLE_CRITICAL_MESSAGE, 'Critical CBC Results');
    } else {
      // Default: run all tests
      await runTests();
    }
  } catch (error) {
    console.error(`\n❌ Test failed: ${error.message}`);
    process.exit(1);
  }
}

runSpecificTest();