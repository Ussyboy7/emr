# URIT 5160 Hematology Analyzer Integration

## Overview

This document outlines the integration plan for connecting the URIT 5160 hematology analyzer to the EMR system, enabling automatic import of CBC (Complete Blood Count) and differential results.

## URIT 5160 Specifications

### Device Information
- **Manufacturer**: URIT Medical Electronic Co., Ltd.
- **Model**: URIT 5160
- **Type**: 5-part differential hematology analyzer
- **Throughput**: Up to 60 samples/hour

### Test Parameters
The URIT 5160 measures:
- **WBC** (White Blood Cell Count)
- **RBC** (Red Blood Cell Count)
- **HGB** (Hemoglobin)
- **HCT** (Hematocrit)
- **MCV** (Mean Corpuscular Volume)
- **MCH** (Mean Corpuscular Hemoglobin)
- **MCHC** (Mean Corpuscular Hemoglobin Concentration)
- **RDW-CV** (Red Cell Distribution Width)
- **PLT** (Platelet Count)
- **PCT** (Plateletcrit)
- **MPV** (Mean Platelet Volume)
- **PDW** (Platelet Distribution Width)
- **5-Part WBC Differential**: Neutrophils, Lymphocytes, Monocytes, Eosinophils, Basophils

## Integration Architecture

### Communication Protocols

The URIT 5160 supports multiple communication protocols:

1. **HL7 Protocol** - Industry standard for healthcare data exchange
2. **ASTM Protocol** - Legacy laboratory instrument protocol
3. **LIS Interface** - Laboratory Information System connectivity
4. **Serial/RS-232** - Direct serial communication
5. **Ethernet/TCP/IP** - Network connectivity

### Recommended Approach

**Option 1: HL7 Interface (Recommended)**
- Industry standard protocol
- Reliable and widely supported
- Structured data format
- Future-proof solution

**Option 2: ASTM Protocol**
- Legacy protocol still supported by URIT 5160
- Simpler implementation
- Limited to basic functionality

**Option 3: Direct API Integration**
- Custom integration if device supports modern APIs
- Most flexible but requires vendor cooperation

## Implementation Plan

### Phase 1: Infrastructure Setup

#### 1.1 Network Configuration
```
EMR Server ──── LAN ──── URIT 5160 Analyzer
   │                       │
   └─ Middleware Service ──┘
```

#### 1.2 Middleware Service
Create a Node.js/Python service to:
- Listen for HL7/ASTM messages from analyzer
- Parse and validate incoming data
- Transform data to EMR format
- Send results to EMR API

### Phase 2: Data Mapping

#### HL7 Message Structure
```
MSH|^~\&|URIT5160|LAB|EMR|Hospital|202312011200||ORU^R01|MSG001|P|2.5
PID|1||PAT001||Doe^John||19800101|M
PV1|1|O|LAB||||Dr.Smith|||||||||PAT001
OBR|1||CBC001|1500^Complete Blood Count||202312011130|||||||202312011200
OBX|1|NM|6690-2^WBC^LN||6.5|10^9/L|4.0-11.0||||F
OBX|2|NM|789-8^RBC^LN||4.8|10^12/L|4.2-5.4||||F
OBX|3|NM|718-7^HGB^LN||14.2|g/dL|12.0-16.0||||F
...
```

#### EMR Data Mapping
```typescript
interface HematologyResult {
  testCode: 'CBC' | 'DIFF';
  parameters: {
    wbc: number;      // 10^9/L
    rbc: number;      // 10^12/L
    hgb: number;      // g/dL
    hct: number;      // %
    mcv: number;      // fL
    mch: number;      // pg
    mchc: number;     // g/dL
    rdw: number;      // %
    plt: number;      // 10^9/L
    neutrophils: number;  // %
    lymphocytes: number;  // %
    monocytes: number;    // %
    eosinophils: number;  // %
    basophils: number;    // %
  };
  flags: string[];   // Abnormal flags
  referenceRanges: Record<string, {min: number, max: number}>;
}
```

### Phase 3: Integration Components

#### 3.1 Device Configuration
```typescript
interface AnalyzerConfig {
  id: string;
  name: 'URIT 5160';
  ipAddress: string;
  port: number;
  protocol: 'HL7' | 'ASTM';
  enabled: boolean;
  autoImport: boolean;
  labLocation: string;
}
```

#### 3.2 Result Processor
```typescript
class URIT5160Processor {
  async processMessage(message: HL7Message): Promise<void> {
    // Extract patient and sample information
    const patientId = this.extractPatientId(message);
    const sampleId = this.extractSampleId(message);

    // Parse hematology results
    const results = this.parseHematologyResults(message);

    // Validate results
    const validation = await this.validateResults(results);

    if (validation.isValid) {
      // Create or update lab test in EMR
      await this.createLabTest(patientId, sampleId, results);
    } else {
      // Log validation errors
      await this.logValidationError(validation.errors);
    }
  }
}
```

#### 3.3 Quality Control
- **Delta Checks**: Compare results with previous values
- **Critical Value Alerts**: Flag abnormal results
- **Instrument Validation**: Verify analyzer calibration
- **Result Verification**: Require manual review for critical values

### Phase 4: EMR Integration

#### 4.1 Lab Test Creation
```typescript
async function createHematologyTest(
  patientId: number,
  sampleId: string,
  results: HematologyResult
): Promise<LabTest> {
  // Create lab order if it doesn't exist
  const order = await labService.createOrder({
    patient_id: patientId,
    tests: [{
      template: 'hematology-cbc',
      sample_type: 'whole-blood',
      priority: 'routine'
    }],
    clinical_notes: `Auto-imported from URIT 5160 (${sampleId})`
  });

  // Update test with results
  const test = order.tests[0];
  await labService.updateTestResults(test.id, {
    status: 'results_ready',
    results: results.parameters,
    processed_by: 'URIT5160-AUTO',
    processed_at: new Date().toISOString()
  });

  return test;
}
```

#### 4.2 Result Display
- Integrate results into existing lab result views
- Add analyzer information to result metadata
- Show quality control flags and alerts

## Configuration Requirements

### Device Settings
1. **Network Configuration**:
   - IP Address: Assign static IP to analyzer
   - Subnet Mask: Match network settings
   - Gateway: Configure network gateway

2. **Communication Settings**:
   - Protocol: HL7 v2.5
   - Port: 2575 (standard HL7 port)
   - Message Format: ORU^R01 (Observation Result Unsolicited)
   - Character Set: UTF-8

3. **Auto-Export Settings**:
   - Enable automatic result transmission
   - Configure destination IP (middleware service)
   - Set transmission triggers (after each sample)

### EMR Settings
1. **Analyzer Registration**:
   - Add URIT 5160 to analyzer list
   - Configure connection parameters
   - Set up result mapping rules

2. **Quality Control Rules**:
   - Define acceptable ranges
   - Set up delta check parameters
   - Configure critical value thresholds

## Security Considerations

### Data Transmission
- **Encryption**: Use TLS 1.3 for HL7 transmission
- **Authentication**: Mutual TLS certificates
- **Access Control**: Restrict analyzer-to-EMR communication

### Audit Trail
- **Message Logging**: Log all incoming messages
- **Result Tracking**: Track who imported what results
- **Change History**: Maintain audit trail of result modifications

## Testing and Validation

### Test Scenarios
1. **Normal Results**: Verify standard CBC parameters
2. **Abnormal Results**: Test flagging and alerting
3. **Critical Values**: Validate panic value handling
4. **Network Issues**: Test reconnection and data recovery
5. **Data Validation**: Check range limits and delta checks

### Validation Checklist
- [ ] Device connectivity established
- [ ] Sample data transmission working
- [ ] Result parsing accurate
- [ ] EMR integration functional
- [ ] Quality control rules applied
- [ ] User notifications working
- [ ] Audit trail maintained

## Implementation Timeline

### Week 1-2: Infrastructure Setup
- Network configuration
- Middleware service development
- Basic HL7 parsing

### Week 3-4: Data Integration
- Result mapping and validation
- EMR API integration
- Quality control implementation

### Week 5-6: Testing and Validation
- End-to-end testing
- Performance optimization
- User acceptance testing

### Week 7-8: Deployment and Training
- Production deployment
- Staff training
- Go-live support

## Maintenance and Support

### Ongoing Tasks
- **Calibration Verification**: Monthly analyzer calibration checks
- **Quality Control**: Daily QC sample processing
- **Software Updates**: Keep analyzer firmware current
- **Network Monitoring**: Ensure stable connectivity

### Support Contacts
- **URIT Support**: Contact manufacturer for device issues
- **EMR Support**: Internal IT team for software issues
- **Integration Support**: Middleware service monitoring

## Success Metrics

### Performance Indicators
- **Result Turnaround Time**: < 5 minutes from analyzer to EMR
- **Data Accuracy**: > 99.9% result transmission accuracy
- **System Uptime**: > 99.5% analyzer connectivity
- **User Satisfaction**: > 95% staff satisfaction rating

### Business Benefits
- **Efficiency**: Reduced manual data entry by 90%
- **Accuracy**: Eliminated transcription errors
- **Speed**: Faster result availability to clinicians
- **Cost Savings**: Reduced laboratory operational costs