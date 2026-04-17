# CRITICAL: Server Network Access Lost

**Emergency Situation:** SSH access to the server has been lost after the routing change. This indicates the network configuration broke connectivity.

## Immediate Recovery Steps

### If you have console/VM access to the server:

1. **Access the server console** (VM console, physical console, etc.)

2. **Check network status:**
   ```bash
   ip addr show
   ip route show
   ```

3. **Reset to DHCP (automatic IP):**
   ```bash
   # Remove static routes
   sudo ip route del default
   
   # Reset network interface
   sudo ip addr flush dev enp4s1
   sudo systemctl restart NetworkManager
   
   # Or use netplan to reset to DHCP
   sudo tee /etc/netplan/01-netcfg.yaml > /dev/null << 'EOF'
   network:
     version: 2
     ethernets:
       enp4s1:
         dhcp4: true
   EOF
   
   sudo netplan apply
   ```

4. **Check if IP is restored:**
   ```bash
   ip addr show
   ```

### If you have physical/network admin access:

1. **Check network switch/router** for the server's MAC address: `28:6e:d4:89:28:ef`

2. **Verify DHCP server** is assigning IP addresses correctly

3. **Check if server** is in the correct VLAN/subnet

### Alternative Access Methods:

1. **Try different SSH port** (if firewall changed):
   ```bash
   ssh -p 22 emrprod@172.16.0.32
   ```

2. **Try from different network segment** if you're on the same LAN

3. **Check ARP table** on your local machine:
   ```bash
   arp -a | grep 172.16.0.32
   ```

## Network Recovery Commands (if you regain console access)

```bash
# Restore original routing
sudo ip route add default via 172.16.0.2 dev enp4s1

# Or reset to original netplan
sudo rm /etc/netplan/01-netcfg.yaml
sudo netplan apply

# Restart networking
sudo systemctl restart NetworkManager

# Check connectivity
ping -c 4 172.16.0.2
ping -c 4 8.8.8.8
```

## Prevention for Future

**Always test network changes carefully:**
```bash
# Before making changes, note current config
ip addr show > network_before.txt
ip route show >> network_before.txt

# Test new config in background
timeout 30 ping -c 5 172.16.0.2 &
# Make change
# If ping fails, revert immediately
```

## What Likely Happened

The gateway change from 172.16.0.2 to 172.16.0.1 made the server unreachable because:
- The new gateway (.1) may not exist or be configured
- The routing change disconnected the server from your network
- The server may have lost its IP lease

## Next Steps

1. **Gain console access** to the server (VM console, physical access)
2. **Reset network configuration** to DHCP
3. **Verify gateway** with network admin: `172.16.0.2` vs `172.16.0.1`
4. **Test connectivity** before making further changes

**Do not make further network changes without console access available!**

Once you regain access, we can properly diagnose the correct gateway and configure the network safely.