# Alternative Fix for apt Update Issues

Since the keyserver is timing out, try these alternative approaches:

## Option 1: Use --allow-unauthenticated (temporary workaround)
```bash
# Skip repository validation temporarily
sudo apt update --allow-unauthenticated
sudo apt install -y git ca-certificates
```

## Option 2: Change to a different Ubuntu mirror
```bash
# Backup current sources
sudo cp /etc/apt/sources.list /etc/apt/sources.list.backup

# Use Ubuntu's main archive instead of country-specific
sudo tee /etc/apt/sources.list > /dev/null << 'EOF'
deb http://archive.ubuntu.com/ubuntu/ jammy main restricted universe multiverse
deb http://archive.ubuntu.com/ubuntu/ jammy-updates main restricted universe multiverse
deb http://archive.ubuntu.com/ubuntu/ jammy-backports main restricted universe multiverse
deb http://security.ubuntu.com/ubuntu jammy-security main restricted universe multiverse
EOF

# Try update again
sudo apt update
```

## Option 3: Use Ubuntu's old-releases mirror (if Jammy is EOL)
```bash
# If Ubuntu 22.04 (Jammy) repositories are having issues, use old-releases
sudo tee /etc/apt/sources.list > /dev/null << 'EOF'
deb http://old-releases.ubuntu.com/ubuntu/ jammy main restricted universe multiverse
deb http://old-releases.ubuntu.com/ubuntu/ jammy-updates main restricted universe multiverse
deb http://old-releases.ubuntu.com/ubuntu/ jammy-backports main restricted universe multiverse
deb http://old-releases.ubuntu.com/ubuntu jammy-security main restricted universe multiverse
EOF

sudo apt update
```

## Option 4: Skip apt entirely and use pre-installed tools
```bash
# Check if git is already available
which git

# If git exists, proceed with SSL fix only
sudo apt install -y ca-certificates --allow-unauthenticated
sudo update-ca-certificates

# Try git clone
GIT_SSL_NO_VERIFY=true git clone https://github.com/Ussyboy7/emr.git emr
```

## Option 5: Manual certificate installation
```bash
# Download GitHub's certificate manually (if you have internet access)
cd /usr/local/share/ca-certificates/
sudo wget --no-check-certificate https://github.com/Ussyboy7/emr/archive/refs/heads/main.zip -O /tmp/emr.zip
sudo unzip /tmp/emr.zip -d /home/emrprod/
sudo mv /home/emrprod/emr-main /home/emrprod/emr
cd /home/emrprod/emr
```

## Network Diagnostics
```bash
# Test connectivity
ping -c 4 8.8.8.8
ping -c 4 google.com
nslookup github.com

# Test specific ports
telnet archive.ubuntu.com 80
telnet github.com 443

# Check DNS
cat /etc/resolv.conf
```

## If All Else Fails: Manual Setup
If network issues persist, you can:

1. **On your local machine with internet:**
   ```bash
   # Download the repository
   git clone https://github.com/Ussyboy7/emr.git
   cd emr
   zip -r emr.zip .
   ```

2. **Transfer to server:**
   ```bash
   # From local machine
   scp emr.zip emrprod@172.16.0.32:~/
   ```

3. **On server:**
   ```bash
   unzip emr.zip
   # Files are now ready
   ```

## Quick Test
Try this sequence:
```bash
# Test 1: Simple apt install without update
sudo apt install -y git --allow-unauthenticated

# Test 2: Clone with SSL bypass
GIT_SSL_NO_VERIFY=true git clone https://github.com/Ussyboy7/emr.git emr

# If that works, you're good to proceed with the EMR setup phases
```

The key is to get the repository files on the server. Once you have them, the EMR deployment scripts will handle the rest.