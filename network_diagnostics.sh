# Network Troubleshooting Results

Your server has a DHCP-assigned IP (172.16.0.32) and appears to have network configuration, but cannot reach the internet. The issue is likely:

1. **Gateway unreachable**: Gateway is 172.16.0.2, but network is 172.16.0.0/23
2. **DNS resolution failing**: Using systemd-resolved stub resolver
3. **Routing/firewall issues**

## Network Fixes

### 1. Check Gateway Connectivity
```bash
# Test gateway reachability
ping -c 4 172.16.0.2

# If gateway ping fails, try different gateway
sudo ip route del default
sudo ip route add default via 172.16.0.1 dev enp4s1  # Try .1 instead of .2

# Test again
ping -c 4 8.8.8.8
```

### 2. Fix DNS Resolution
```bash
# Check systemd-resolved status
sudo systemctl status systemd-resolved

# Try using direct DNS servers instead of stub
sudo tee /etc/resolv.conf > /dev/null << 'EOF'
nameserver 8.8.8.8
nameserver 1.1.1.1
nameserver 172.16.0.2  # Your gateway as DNS
search npa.local
EOF

# Restart systemd-resolved
sudo systemctl restart systemd-resolved

# Test DNS
nslookup google.com
```

### 3. Network Manager Commands (Ubuntu 22.04)
```bash
# Check NetworkManager status
sudo systemctl status NetworkManager

# List connections
nmcli connection show

# Restart NetworkManager
sudo systemctl restart NetworkManager

# Release and renew DHCP
sudo nmcli connection down "Wired connection 1"
sudo nmcli connection up "Wired connection 1"
```

### 4. Check Firewall
```bash
# Check UFW status
sudo ufw status

# Temporarily disable UFW for testing
sudo ufw disable

# Test ping again
ping -c 4 8.8.8.8

# Re-enable if it works
sudo ufw enable
```

### 5. Static IP Configuration (if DHCP is problematic)
```bash
# Create netplan config for static IP
sudo tee /etc/netplan/01-netcfg.yaml > /dev/null << 'EOF'
network:
  version: 2
  ethernets:
    enp4s1:
      dhcp4: no
      addresses:
        - 172.16.0.32/23
      gateway4: 172.16.0.1  # Try .1 instead of .2
      nameservers:
        addresses:
          - 8.8.8.8
          - 1.1.1.1
        search:
          - npa.local
  version: 2
EOF

# Apply configuration
sudo netplan apply

# Test connectivity
ping -c 4 8.8.8.8
```

### 6. ARP and Neighbor Check
```bash
# Check ARP table
arp -a

# Check neighbors
ip neigh show

# Test local network connectivity
ping -c 4 172.16.0.1
ping -c 4 172.16.0.2
```

### 7. Network Diagnostic Commands
```bash
# Comprehensive network test
sudo apt install -y net-tools traceroute mtr

# Trace route to gateway
traceroute 172.16.0.2

# Trace route to internet
traceroute 8.8.8.8

# MTR (My Traceroute) for detailed analysis
mtr 8.8.8.8
```

## Most Likely Issues

1. **Wrong Gateway**: Your network is 172.16.0.0/23, gateway should probably be 172.16.0.1
2. **DNS Stub Resolver**: systemd-resolved stub might be causing issues
3. **Network Isolation**: Server might be in an isolated network segment

## Test Sequence

```bash
# 1. Change gateway to .1
sudo ip route del default
sudo ip route add default via 172.16.0.1 dev enp4s1

# 2. Fix DNS
sudo tee /etc/resolv.conf > /dev/null << 'EOF'
nameserver 8.8.8.8
nameserver 1.1.1.1
EOF

# 3. Test connectivity
ping -c 4 8.8.8.8
curl -k -I https://github.com

# 4. If it works, make changes permanent with netplan
```

## Alternative: Use Different Network Interface

If `enp4s1` is not the correct interface:
```bash
# List all interfaces
ip link show

# Try different interface if available
# Adjust netplan config accordingly
```

## Emergency Manual Transfer

If network issues cannot be resolved, use manual file transfer:

**On a machine with internet:**
```bash
git clone https://github.com/Ussyboy7/emr.git
tar -czf emr.tar.gz emr/
```

**Transfer:**
```bash
# Even without internet, SCP might work if on same network
scp emr.tar.gz emrprod@172.16.0.32:~/
```

**On server:**
```bash
tar -xzf emr.tar.gz
cd emr
# Proceed with EMR setup
```

Try the gateway change first - that's the most likely fix. Your network should have internet access for EMR to function properly.