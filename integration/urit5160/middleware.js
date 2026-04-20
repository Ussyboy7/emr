#!/usr/bin/env node

/**
 * URIT 5160 Hematology Analyzer Integration Middleware
 *
 * This service receives HL7 messages from URIT 5160 analyzers,
 * parses the hematology results, and forwards them to the EMR system.
 */

const net = require('net');
const axios = require('axios');
const fs = require('fs');
const path = require('path');

// Configuration
const CONFIG = {
  hl7Port: process.env.HL7_PORT || 2575,
  emrApiUrl: process.env.EMR_API_URL || 'http://localhost:8000/api',
  emrApiKey: process.env.EMR_API_KEY, // For authentication
  logFile: path.join(__dirname, 'logs', 'urit5160.log'),
  analyzerId: 'URIT5160-001'
};

// Ensure log directory exists
if (!fs.existsSync(path.dirname(CONFIG.logFile))) {
  fs.mkdirSync(path.dirname(CONFIG.logFile), { recursive: true });
}

// Logger
class Logger {
  static log(level, message, data = null) {
    const timestamp = new Date().toISOString();
    const logEntry = `[${timestamp}] [${level.toUpperCase()}] ${message}`;
    console.log(logEntry);

    if (data) {
      console.log(JSON.stringify(data, null, 2));
    }

    // Write to file
    const fileEntry = `${logEntry}${data ? '\n' + JSON.stringify(data, null, 2) : ''}\n`;
    fs.appendFileSync(CONFIG.logFile, fileEntry);
  }

  static info(message, data = null) { this.log('info', message, data); }
  static warn(message, data = null) { this.log('warn', message, data); }
  static error(message, data = null) { this.log('error', message, data); }
}

// HL7 Message Parser
class HL7Parser {
  static parse(message) {
    try {
      Logger.info('Parsing HL7 message', { messageLength: message.length });

      // Split message into segments
      const segments = message.split('\r').filter(seg => seg.trim());

      const parsed = {
        messageType: '',
        patient: {},
        order: {},
        observations: []
      };

      segments.forEach(segment => {
        const fields = segment.split('|');
        const segmentType = fields[0];

        switch (segmentType) {
          case 'MSH':
            parsed.messageType = `${fields[8]} ${fields[9]}`;
            break;

          case 'PID':
            parsed.patient = {
              id: fields[3], // Patient ID
              name: this.parseName(fields[5]), // Patient Name
              dob: fields[7], // Date of Birth
              gender: fields[8] // Gender
            };
            break;

          case 'PV1':
            parsed.order = {
              visitNumber: fields[1],
              patientClass: fields[2],
              location: fields[3]
            };
            break;

          case 'OBR':
            parsed.order = {
              ...parsed.order,
              placerOrderNumber: fields[2],
              fillerOrderNumber: fields[3],
              universalServiceId: this.parseUniversalServiceId(fields[4]),
              priority: fields[5],
              requestedDateTime: fields[6],
              observationDateTime: fields[7],
              collectionVolume: fields[9],
              collectorIdentifier: fields[10]
            };
            break;

          case 'OBX':
            const observation = {
              setId: fields[1],
              valueType: fields[2],
              observationIdentifier: this.parseObservationIdentifier(fields[3]),
              observationValue: fields[5],
              units: fields[6],
              referenceRange: fields[7],
              abnormalFlags: fields[8],
              probability: fields[9],
              natureOfAbnormalTest: fields[10],
              observationResultStatus: fields[11]
            };
            parsed.observations.push(observation);
            break;
        }
      });

      Logger.info('Successfully parsed HL7 message', {
        messageType: parsed.messageType,
        patientId: parsed.patient.id,
        observationCount: parsed.observations.length
      });

      return parsed;
    } catch (error) {
      Logger.error('Failed to parse HL7 message', { error: error.message, message });
      throw error;
    }
  }

  static parseName(nameField) {
    if (!nameField) return '';
    const components = nameField.split('^');
    return `${components[0]} ${components[1] || ''}`.trim();
  }

  static parseUniversalServiceId(serviceId) {
    if (!serviceId) return '';
    const components = serviceId.split('^');
    return components[1] || components[0]; // Use descriptive name if available
  }

  static parseObservationIdentifier(identifier) {
    if (!identifier) return '';
    const components = identifier.split('^');
    return {
      identifier: components[0],
      text: components[1],
      codingSystem: components[2],
      alternateIdentifier: components[3],
      alternateText: components[4]
    };
  }
}

// Hematology Result Processor
class HematologyProcessor {
  static processHematologyResults(parsedMessage) {
    try {
      Logger.info('Processing hematology results');

      const results = {
        analyzer: CONFIG.analyzerId,
        sampleId: parsedMessage.order.placerOrderNumber || parsedMessage.order.fillerOrderNumber,
        patientId: parsedMessage.patient.id,
        testDate: parsedMessage.order.observationDateTime,
        parameters: {},
        flags: [],
        referenceRanges: {}
      };

      // Map HL7 observations to hematology parameters
      parsedMessage.observations.forEach(obs => {
        const paramCode = obs.observationIdentifier.identifier;
        const value = parseFloat(obs.observationValue);
        const unit = obs.units;
        const refRange = this.parseReferenceRange(obs.referenceRange);
        const abnormalFlags = obs.abnormalFlags;

        // Map common hematology parameters
        switch (paramCode) {
          case '6690-2': // WBC
            results.parameters.wbc = { value, unit: unit || '10^9/L', refRange };
            break;
          case '789-8': // RBC
            results.parameters.rbc = { value, unit: unit || '10^12/L', refRange };
            break;
          case '718-7': // HGB
            results.parameters.hgb = { value, unit: unit || 'g/dL', refRange };
            break;
          case '4544-3': // HCT
            results.parameters.hct = { value, unit: unit || '%', refRange };
            break;
          case '787-2': // MCV
            results.parameters.mcv = { value, unit: unit || 'fL', refRange };
            break;
          case '785-6': // MCH
            results.parameters.mch = { value, unit: unit || 'pg', refRange };
            break;
          case '786-4': // MCHC
            results.parameters.mchc = { value, unit: unit || 'g/dL', refRange };
            break;
          case '21000-5': // RDW
            results.parameters.rdw = { value, unit: unit || '%', refRange };
            break;
          case '777-3': // PLT
            results.parameters.plt = { value, unit: unit || '10^9/L', refRange };
            break;
          case '32209-9': // Neutrophils
            results.parameters.neutrophils = { value, unit: unit || '%', refRange };
            break;
          case '731-0': // Lymphocytes
            results.parameters.lymphocytes = { value, unit: unit || '%', refRange };
            break;
          case '742-7': // Monocytes
            results.parameters.monocytes = { value, unit: unit || '%', refRange };
            break;
          case '711-2': // Eosinophils
            results.parameters.eosinophils = { value, unit: unit || '%', refRange };
            break;
          case '704-7': // Basophils
            results.parameters.basophils = { value, unit: unit || '%', refRange };
            break;
        }

        // Collect abnormal flags
        if (abnormalFlags && abnormalFlags !== 'N') {
          results.flags.push(`${obs.observationIdentifier.text}: ${abnormalFlags}`);
        }
      });

      Logger.info('Processed hematology results', {
        sampleId: results.sampleId,
        parameterCount: Object.keys(results.parameters).length,
        flagCount: results.flags.length
      });

      return results;
    } catch (error) {
      Logger.error('Failed to process hematology results', { error: error.message });
      throw error;
    }
  }

  static parseReferenceRange(rangeString) {
    if (!rangeString) return null;

    // Parse formats like "4.0-11.0" or "4.0 - 11.0"
    const match = rangeString.match(/(\d+\.?\d*)\s*-\s*(\d+\.?\d*)/);
    if (match) {
      return {
        min: parseFloat(match[1]),
        max: parseFloat(match[2])
      };
    }

    return null;
  }
}

// EMR Integration Service
class EMRService {
  static async sendResultsToEMR(hematologyResults) {
    try {
      Logger.info('Sending results to EMR', { sampleId: hematologyResults.sampleId });

      // First, find or create lab order
      const orderData = {
        patient_id: hematologyResults.patientId,
        tests: [{
          template: 'hematology-cbc',
          sample_type: 'whole-blood',
          priority: 'routine',
          lab_number: hematologyResults.sampleId
        }],
        clinical_notes: `Auto-imported from ${hematologyResults.analyzer} at ${hematologyResults.testDate}`,
        ordered_by: 'system-auto-import'
      };

      const orderResponse = await axios.post(
        `${CONFIG.emrApiUrl}/laboratory/orders/`,
        orderData,
        {
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${CONFIG.emrApiKey}`
          }
        }
      );

      const orderId = orderResponse.data.id;
      const testId = orderResponse.data.tests[0].id;

      Logger.info('Created lab order', { orderId, testId });

      // Update test with results
      const resultData = {
        status: 'results_ready',
        results: hematologyResults.parameters,
        processed_by: hematologyResults.analyzer,
        processed_at: new Date().toISOString(),
        verification_notes: hematologyResults.flags.length > 0
          ? `Abnormal flags: ${hematologyResults.flags.join(', ')}`
          : 'Results within normal ranges'
      };

      await axios.patch(
        `${CONFIG.emrApiUrl}/laboratory/tests/${testId}/`,
        resultData,
        {
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${CONFIG.emrApiKey}`
          }
        }
      );

      Logger.info('Successfully sent results to EMR', {
        orderId,
        testId,
        sampleId: hematologyResults.sampleId
      });

      return { orderId, testId };

    } catch (error) {
      Logger.error('Failed to send results to EMR', {
        error: error.message,
        response: error.response?.data,
        sampleId: hematologyResults.sampleId
      });
      throw error;
    }
  }
}

// HL7 Server
class HL7Server {
  constructor() {
    this.server = net.createServer(this.handleConnection.bind(this));
  }

  start() {
    this.server.listen(CONFIG.hl7Port, () => {
      Logger.info(`HL7 Server listening on port ${CONFIG.hl7Port}`);
    });

    this.server.on('error', (error) => {
      Logger.error('HL7 Server error', { error: error.message });
    });
  }

  handleConnection(socket) {
    Logger.info('New HL7 connection established', {
      remoteAddress: socket.remoteAddress,
      remotePort: socket.remotePort
    });

    let buffer = '';

    socket.on('data', async (data) => {
      try {
        buffer += data.toString();

        // Check for message boundaries (HL7 messages end with \r\n)
        const messageEndIndex = buffer.indexOf('\r\n');
        if (messageEndIndex !== -1) {
          const message = buffer.substring(0, messageEndIndex);
          buffer = buffer.substring(messageEndIndex + 2);

          // Process the complete message
          await this.processMessage(message);

          // Send ACK response
          const ack = this.createACK(message);
          socket.write(ack);
        }
      } catch (error) {
        Logger.error('Error processing HL7 message', { error: error.message });
        const nak = this.createNAK(error.message);
        socket.write(nak);
      }
    });

    socket.on('end', () => {
      Logger.info('HL7 connection closed');
    });

    socket.on('error', (error) => {
      Logger.error('HL7 socket error', { error: error.message });
    });
  }

  async processMessage(message) {
    try {
      Logger.info('Processing HL7 message', { messageLength: message.length });

      // Parse HL7 message
      const parsedMessage = HL7Parser.parse(message);

      // Check if it's a hematology result message
      if (parsedMessage.messageType.includes('ORU^R01') &&
          parsedMessage.order.universalServiceId.toLowerCase().includes('cbc')) {

        Logger.info('Detected hematology CBC message');

        // Process hematology results
        const hematologyResults = HematologyProcessor.processHematologyResults(parsedMessage);

        // Send to EMR
        await EMRService.sendResultsToEMR(hematologyResults);

        Logger.info('Successfully processed hematology message', {
          sampleId: hematologyResults.sampleId
        });

      } else {
        Logger.info('Ignoring non-hematology message', {
          messageType: parsedMessage.messageType,
          serviceId: parsedMessage.order.universalServiceId
        });
      }

    } catch (error) {
      Logger.error('Failed to process message', { error: error.message });
      throw error;
    }
  }

  createACK(originalMessage) {
    // Create HL7 ACK message
    const now = new Date();
    const timestamp = now.toISOString().replace(/[:-]/g, '').substring(0, 14);

    return `MSH|^~\\&|EMR|HOSPITAL|URIT5160|LAB|${timestamp}||ACK|ACK001|P|2.5\rMSA|AA|MSG001\r`;
  }

  createNAK(errorMessage) {
    // Create HL7 NAK message
    const now = new Date();
    const timestamp = now.toISOString().replace(/[:-]/g, '').substring(0, 14);

    return `MSH|^~\\&|EMR|HOSPITAL|URIT5160|LAB|${timestamp}||ACK|NAK001|P|2.5\rMSA|AE|MSG001|${errorMessage}\r`;
  }
}

// Main application
function main() {
  Logger.info('Starting URIT 5160 Integration Middleware', {
    hl7Port: CONFIG.hl7Port,
    emrApiUrl: CONFIG.emrApiUrl,
    analyzerId: CONFIG.analyzerId
  });

  // Validate configuration
  if (!CONFIG.emrApiKey) {
    Logger.error('EMR_API_KEY environment variable is required');
    process.exit(1);
  }

  // Start HL7 server
  const server = new HL7Server();
  server.start();

  // Graceful shutdown
  process.on('SIGINT', () => {
    Logger.info('Shutting down URIT 5160 Integration Middleware');
    server.server.close(() => {
      process.exit(0);
    });
  });

  process.on('SIGTERM', () => {
    Logger.info('Received SIGTERM, shutting down gracefully');
    server.server.close(() => {
      process.exit(0);
    });
  });
}

// Start the application
if (require.main === module) {
  main();
}

module.exports = { HL7Parser, HematologyProcessor, EMRService, HL7Server };