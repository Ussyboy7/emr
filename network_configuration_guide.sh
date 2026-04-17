# Server Network Configuration Issues

**Critical Issue:** Your server has no internet connectivity. This prevents:
- Package installations (apt)
- Git repository cloning
- Docker image downloads
- SSL certificate validation

## Immediate Network Diagnostics

```bash
# Check network interfaces
ip addr show

# Check routing table
ip route show

# Check DNS configuration
cat /etc/resolv.conf

# Check network manager status
sudo systemctl status NetworkManager

# Try different DNS servers
echo "nameserver 8.8.8.8" | sudo tee /etc/resolv.conf
echo "nameserver 1.1.1.1" | sudo tee -a /etc/resolv.conf
```

## Network Configuration Fixes

### If using DHCP (automatic IP):
```bash
# Restart network services
sudo systemctl restart networking
sudo systemctl restart NetworkManager

# Renew DHCP lease
sudo dhclient -r
sudo dhclient
```

### If using static IP (manual configuration):
```bash
# Check current netplan configuration
cat /etc/netplan/*.yaml

# Example static IP configuration (adjust for your network)
sudo tee /etc/netplan/01-netcfg.yaml > /dev/null << 'EOF'
network:
  version: 2
  ethernets:
    ens18:  # Replace with your interface name from 'ip addr show'
      dhcp4: no
      addresses:
        - 172.16.0.32/24  # Your server's IP
      gateway4: 172.16.0.1  # Your gateway IP
      nameservers:
        addresses:
          - 8.8.8.8
          - 1.1.1.1
EOF

# Apply network configuration
sudo netplan apply
```

### If behind a proxy:
```bash
# Set proxy environment variables
export http_proxy=http://proxy.company.com:8080
export https_proxy=http://proxy.company.com:8080

# Add to bashrc for persistence
echo 'export http_proxy=http://proxy.company.com:8080' >> ~/.bashrc
echo 'export https_proxy=http://proxy.company.com:8080' >> ~/.bashrc

# Configure apt proxy
sudo tee /etc/apt/apt.conf.d/99proxy > /dev/null <<EOF
Acquire::http::Proxy "http://proxy.company.com:8080";
Acquire::https::Proxy "http://proxy.company.com:8080";
EOF
```

## Alternative: Manual File Transfer Setup

Since internet access is required for EMR operation anyway, the most practical solution is:

### Step 1: Prepare EMR files on a machine with internet
```bash
# On a machine with internet access
git clone https://github.com/Ussyboy7/emr.git
cd emr

# Create deployment package
tar -czf emr-deployment.tar.gz .

# Or create ZIP
zip -r emr-deployment.zip .
```

### Step 2: Transfer files to server
```bash
# From the machine with internet
scp emr-deployment.tar.gz emrprod@172.16.0.32:~/
# or
scp emr-deployment.zip emrprod@172.16.0.32:~/
```

### Step 3: Extract on server
```bash
# On the server
cd ~
tar -xzf emr-deployment.tar.gz
# or
unzip emr-deployment.zip

cd emr  # Ready for deployment
```

## Test Network After Configuration

```bash
# Test connectivity
ping -c 4 8.8.8.8
ping -c 4 google.com

# Test DNS
nslookup github.com

# Test HTTPS
curl -k -I https://github.com  # -k skips SSL verification
```

## EMR Production Requirements

**Important:** EMR requires internet access for:
- Docker image pulls (nginx, postgres, redis, etc.)
- SSL certificate validation
- External API calls (if any)
- Monitoring services

If this server cannot have internet access, consider:
1. Setting up in a DMZ with controlled internet access
2. Using an internal mirror for packages
3. Configuring proxy settings properly

## Next Steps

1. **Fix network connectivity first**
2. **Test internet access with ping and curl**
3. **Then proceed with EMR deployment**

Without internet access, the EMR system cannot function properly in production. Please resolve the network configuration before continuing.

What network setup are you using (DHCP, static IP, proxy)? I can provide more specific guidance based on your network environment.