# URIT 5160 Hematology Analyzer Setup Guide

This guide provides step-by-step instructions for setting up and configuring the URIT 5160 hematology analyzer integration with your EMR system.

## Prerequisites

- URIT 5160 analyzer connected to your network
- EMR system running and accessible
- Administrative access to both systems
- Network connectivity between analyzer and EMR server

## Step 1: Prepare the EMR System

### 1.1 Create Hematology Lab Template

Access the Django admin panel and create a new lab template:

1. Navigate to **Admin Panel** > **Laboratory** > **Lab Templates**
2. Click **Add Lab Template**
3. Fill in the details:
   ```
   Name: Complete Blood Count (CBC)
   Code: HEMATOLOGY-CBC
   Category: Hematology
   Sample Type: Whole Blood
   Turnaround Time: 30 minutes
   ```
4. Define normal ranges in the **Normal Range** JSON field:
   ```json
   {
     "wbc": {"min": 4.0, "max": 11.0, "unit": "10^9/L"},
     "rbc": {"min": 4.2, "max": 5.4, "unit": "10^12/L"},
     "hgb": {"min": 12.0, "max": 16.0, "unit": "g/dL"},
     "hct": {"min": 36.0, "max": 46.0, "unit": "%"},
     "mcv": {"min": 80.0, "max": 100.0, "unit": "fL"},
     "mch": {"min": 27.0, "max": 32.0, "unit": "pg"},
     "mchc": {"min": 32.0, "max": 36.0, "unit": "g/dL"},
     "rdw": {"min": 11.5, "max": 14.5, "unit": "%"},
     "plt": {"min": 150.0, "max": 450.0, "unit": "10^9/L"},
     "neutrophils": {"min": 50.0, "max": 70.0, "unit": "%"},
     "lymphocytes": {"min": 20.0, "max": 40.0, "unit": "%"},
     "monocytes": {"min": 2.0, "max": 8.0, "unit": "%"},
     "eosinophils": {"min": 1.0, "max": 4.0, "unit": "%"},
     "basophils": {"min": 0.0, "max": 1.0, "unit": "%"}
   }
   ```
5. Set **Is Active** to **Yes**
6. Click **Save**

### 1.2 Configure API Access

Create an API key for the middleware service:

1. Navigate to **Admin Panel** > **API Keys** (or create if not available)
2. Create a new API key with permissions for:
   - Laboratory orders (create, update)
   - Laboratory tests (create, update)
   - Patient data (read)

### 1.3 Set Up Quality Control Rules

Configure automatic quality control checks:

1. Navigate to **Admin Panel** > **Laboratory** > **Quality Control Rules**
2. Create rules for:
   - Delta checks (compare with previous results)
   - Critical value alerts
   - Result validation ranges

## Step 2: Configure Network Connectivity

### 2.1 Network Setup

Ensure the URIT 5160 can communicate with the EMR server:

1. **Assign static IP** to the URIT 5160 analyzer
2. **Configure network settings**:
   - IP Address: [static IP]
   - Subnet Mask: [network subnet]
   - Gateway: [network gateway]
   - DNS Servers: [DNS servers]

3. **Test connectivity**:
   ```bash
   ping [middleware-server-ip]
   ```

### 2.2 Firewall Configuration

Open the required ports on your firewall:

- **Port 2575** (HL7/TCP) - for analyzer to middleware communication
- Ensure the EMR server can reach the middleware service

## Step 3: Configure the URIT 5160 Analyzer

### 3.1 Access Analyzer Settings

1. Power on the URIT 5160 analyzer
2. Log in with administrator credentials
3. Navigate to **System Settings** > **Communication**

### 3.2 Configure HL7 Interface

Set up the HL7 communication parameters:

1. **Protocol**: Select **HL7**
2. **Host Address**: Enter the IP address of your middleware server
3. **Port**: **2575**
4. **Facility Name**: Your hospital/clinic name
5. **Department**: **Laboratory**
6. **Message Format**: **ORU^R01** (Observation Result Unsolicited)

### 3.3 Configure Message Settings

1. **Character Set**: **UTF-8**
2. **Date Format**: **YYYYMMDDHHMMSS**
3. **Message Delimiter**: **\r** (Carriage Return)

### 3.4 Enable Auto-Export

Configure automatic result transmission:

1. **Auto-Export**: **Enabled**
2. **Trigger**: **After each test completion**
3. **Retry Attempts**: **3**
4. **Retry Interval**: **30 seconds**

### 3.5 Test Connection

1. Save the configuration
2. Run a test sample
3. Check the analyzer's communication log for successful transmission
4. Verify the middleware service receives the message

## Step 4: Deploy the Middleware Service

### 4.1 Environment Setup

1. Navigate to the middleware directory:
   ```bash
   cd /path/to/emr/integration/urit5160
   ```

2. Copy the environment template:
   ```bash
   cp .env.example .env
   ```

3. Configure the environment variables:
   ```env
   HL7_PORT=2575
   EMR_API_URL=http://your-emr-server:8000/api
   EMR_API_KEY=your-api-key-here
   ANALYZER_ID=URIT5160-001
   ```

### 4.2 Start the Service

Using Docker (recommended):
```bash
docker-compose up -d
```

Or manually:
```bash
npm install
npm start
```

### 4.3 Verify Service Health

1. Check the service is running:
   ```bash
   docker-compose ps
   ```

2. View logs:
   ```bash
   docker-compose logs -f middleware
   ```

3. Test health endpoint (if implemented):
   ```bash
   curl http://localhost:2575/health
   ```

## Step 5: Test the Integration

### 5.1 Run Test Sample

1. Prepare a test blood sample
2. Run CBC analysis on the URIT 5160
3. Monitor the middleware logs for message reception
4. Check the EMR system for the new lab order

### 5.2 Verify Data Flow

1. **Middleware Logs**: Confirm HL7 message parsing
2. **EMR API**: Verify lab order creation
3. **EMR UI**: Check result display in laboratory module
4. **Audit Trail**: Review system logs for the transaction

### 5.3 Test Edge Cases

- Abnormal results (should trigger alerts)
- Critical values (should flag for immediate attention)
- Network interruptions (should retry transmission)
- Invalid data (should log errors appropriately)

## Step 6: Go-Live Preparation

### 6.1 Staff Training

Train laboratory staff on:
- New workflow with automatic result import
- How to handle system alerts
- Manual result entry when needed
- Troubleshooting common issues

### 6.2 Backup Procedures

Establish procedures for:
- System downtime scenarios
- Manual result entry fallbacks
- Data synchronization after outages

### 6.3 Monitoring Setup

Configure monitoring for:
- Service uptime and performance
- Message transmission success rates
- Error rates and alert thresholds
- Daily QC sample results

## Maintenance Procedures

### Daily Checks
- Verify analyzer connectivity
- Check middleware service status
- Review overnight QC results
- Monitor disk space and logs

### Weekly Tasks
- Review integration logs for anomalies
- Update analyzer firmware if available
- Clean analyzer per manufacturer guidelines
- Backup configuration settings

### Monthly Tasks
- Calibrate analyzer with control materials
- Review quality control data
- Update normal reference ranges if needed
- Audit integration performance metrics

## Troubleshooting Guide

### Connection Issues

**Problem**: Analyzer cannot connect to middleware
**Solutions**:
1. Verify IP addresses and ports
2. Check network firewall settings
3. Test connectivity with ping/telnet
4. Restart middleware service

**Problem**: Messages not being processed
**Solutions**:
1. Check middleware logs for errors
2. Verify HL7 message format
3. Validate analyzer configuration
4. Test with sample HL7 message

### Data Issues

**Problem**: Results not appearing in EMR
**Solutions**:
1. Verify API key permissions
2. Check EMR API endpoint URLs
3. Review middleware-to-EMR communication
4. Validate patient ID mapping

**Problem**: Abnormal results not flagged
**Solutions**:
1. Review quality control rule configuration
2. Check normal range definitions
3. Verify delta check settings

### Performance Issues

**Problem**: High latency in result delivery
**Solutions**:
1. Monitor network performance
2. Check middleware resource usage
3. Optimize EMR API response times
4. Consider message batching for high volume

## Support Resources

### Documentation
- [URIT 5160 User Manual](https://www.urit.com/)
- [HL7 v2.5 Specification](https://www.hl7.org/)
- [EMR Laboratory Module Guide](./lab-module-guide.md)

### Emergency Contacts
- **Laboratory Director**: [contact info]
- **IT Support**: [contact info]
- **URIT Technical Support**: [contact info]
- **EMR Vendor Support**: [contact info]

## Success Metrics

Monitor these KPIs for integration success:

- **Result Turnaround Time**: < 5 minutes from analyzer to EMR
- **Data Accuracy**: > 99.9% transmission accuracy
- **System Uptime**: > 99.5% analyzer connectivity
- **User Satisfaction**: > 95% laboratory staff satisfaction

## Version Control

Keep track of configuration changes:

| Date | Version | Changes | Author |
|------|---------|---------|--------|
| YYYY-MM-DD | 1.0.0 | Initial setup | [Your Name] |

---

*This guide should be reviewed and updated regularly as the integration evolves and new requirements emerge.*