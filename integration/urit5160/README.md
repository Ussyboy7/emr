# URIT 5160 Middleware Service

> **Documentation:** This README is the canonical URIT integration doc. Older copies under `docs/URIT5160_*` were removed; everything lives here and in `integration/urit5160/`.

This directory contains the middleware service that integrates the URIT 5160 hematology analyzer with the EMR system.

## Overview

The middleware service:
- Listens for HL7 messages from the URIT 5160 analyzer
- Parses hematology results from HL7 format
- Validates and transforms data
- Sends results to the EMR API

## Directory Structure

```
urit5160/
├── middleware.js          # Main middleware service
├── package.json           # Node.js dependencies
├── Dockerfile            # Docker container definition
├── docker-compose.yml    # Docker Compose configuration
├── .env.example         # Environment configuration template
├── logs/                # Log files (created automatically)
└── README.md           # This file
```

## Quick Start

### Using Docker (Recommended)

1. **Configure environment**:
   ```bash
   cd integration/urit5160
   cp .env.example .env
   # Edit .env with your settings
   ```

2. **Start the service**:
   ```bash
   docker-compose up -d
   ```

3. **Check logs**:
   ```bash
   docker-compose logs -f middleware
   ```

### Manual Installation

1. **Install dependencies**:
   ```bash
   cd integration/urit5160
   npm install
   ```

2. **Configure environment**:
   ```bash
   cp .env.example .env
   # Edit .env with your settings
   ```

3. **Start the service**:
   ```bash
   npm start
   ```

## Configuration

### Environment Variables (.env)

```env
# HL7 Server Configuration
HL7_PORT=2575

# EMR API Configuration
EMR_API_URL=http://localhost:8000/api
EMR_API_KEY=your-emr-api-key-here

# Service Configuration
ANALYZER_ID=URIT5160-001
LOG_LEVEL=info
```

### EMR API Key

The middleware needs an API key to authenticate with the EMR system. Create an API key in the EMR admin panel or contact your system administrator.

## URIT 5160 Configuration

### Network Setup

1. **Connect the analyzer to your network**
2. **Assign a static IP address** to the URIT 5160
3. **Ensure the analyzer can reach the middleware server**

### Analyzer Settings

Configure the URIT 5160 to send results to the middleware:

1. **Access System Settings** on the analyzer
2. **Configure LIS Interface**:
   - Protocol: HL7
   - Host: [middleware server IP]
   - Port: 2575
   - Message Format: ORU^R01
3. **Enable Auto-Export** after each test
4. **Test the connection**

### Message Format

The middleware expects HL7 v2.5 messages with:
- Message Type: ORU^R01 (Observation Result)
- Observation segments (OBX) for each hematology parameter
- Standard LOINC codes for test identifiers

## Supported Tests

The middleware automatically processes:

### Complete Blood Count (CBC)
- WBC (White Blood Cell Count)
- RBC (Red Blood Cell Count)
- HGB (Hemoglobin)
- HCT (Hematocrit)
- MCV (Mean Corpuscular Volume)
- MCH (Mean Corpuscular Hemoglobin)
- MCHC (Mean Corpuscular Hemoglobin Concentration)
- RDW (Red Cell Distribution Width)
- PLT (Platelet Count)

### Differential Count
- Neutrophils
- Lymphocytes
- Monocytes
- Eosinophils
- Basophils

## Monitoring

### Health Checks

The service provides health check endpoints:
- `GET /health` - Service health status
- `GET /stats` - Processing statistics

### Logging

Logs are written to:
- Console output
- `logs/urit5160.log` file

Log levels: `error`, `warn`, `info`, `debug`

### Metrics

Track these key metrics:
- Messages received per hour
- Successful processing rate
- EMR API response times
- Error rates by type

## Troubleshooting

### Common Issues

#### Connection Problems
- **Check network connectivity** between analyzer and middleware
- **Verify IP addresses and ports**
- **Check firewall settings**

#### Message Parsing Errors
- **Verify HL7 message format** from analyzer
- **Check LOINC codes** used by the analyzer
- **Review log files** for parsing errors

#### EMR Integration Issues
- **Verify API key** is valid and has proper permissions
- **Check EMR API endpoint** URLs
- **Review EMR API logs** for authentication errors

### Debug Mode

Enable debug logging:
```env
LOG_LEVEL=debug
```

### Manual Testing

Test with sample HL7 message:
```bash
# Send test message to middleware
echo -e "MSH|^~\\&|URIT5160|LAB|EMR|HOSPITAL|202312011200||ORU^R01|MSG001|P|2.5\rPID|1||PAT001||Doe^John||19800101|M\rOBR|1||CBC001|1500^Complete Blood Count||202312011130\rOBX|1|NM|6690-2^WBC^LN||6.5|10^9/L|4.0-11.0||||F\r" | nc localhost 2575
```

## API Reference

### HL7 Message Structure

```
MSH|^~\&|URIT5160|LAB|EMR|HOSPITAL|timestamp||ORU^R01|message_id|P|2.5
PID|1||patient_id||last_name^first_name||dob|gender
OBR|1||order_id||test_code^test_name||ordered_date|||||||collected_date
OBX|1|NM|loinc_code^parameter_name||value|units|reference_range|flags||||status
OBX|2|NM|loinc_code^parameter_name||value|units|reference_range|flags||||status
...
```

### EMR Data Format

Results are sent to EMR as:
```json
{
  "patient_id": "PAT001",
  "tests": [{
    "template": "hematology-cbc",
    "sample_type": "whole-blood",
    "results": {
      "wbc": 6.5,
      "rbc": 4.8,
      "hgb": 14.2,
      // ... other parameters
    },
    "processed_by": "URIT5160-001",
    "status": "results_ready"
  }]
}
```

## Security

### Network Security
- Use TLS encryption for HL7 transmission
- Implement mutual TLS authentication
- Restrict network access to authorized devices

### Data Security
- Encrypt sensitive patient data
- Implement audit logging
- Comply with HIPAA/GDPR requirements

### Access Control
- API key authentication for EMR integration
- IP whitelisting for analyzer connections
- Role-based access for service management

## Maintenance

### Regular Tasks
- **Monitor log files** for errors
- **Check analyzer connectivity** daily
- **Review processing statistics** weekly
- **Update analyzer firmware** as needed

### Backup and Recovery
- **Log file rotation** to prevent disk space issues
- **Configuration backups** for quick recovery
- **Test failover procedures** regularly

## Support

### Documentation
- [HL7 v2.5 Specification](https://www.hl7.org/implement/standards/product_brief.cfm?product_id=185)
- [LOINC Code System](https://loinc.org/)
- [URIT 5160 User Manual](https://www.urit.com/)

### Contact Information
- **EMR Support**: Contact your system administrator
- **URIT Support**: Contact URIT Medical Electronic Co., Ltd.
- **Integration Issues**: Check middleware logs and EMR API logs

## Version History

### v1.0.0
- Initial release
- HL7 message parsing
- EMR API integration
- Basic hematology result processing
- Docker containerization